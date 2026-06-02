import { describe, test, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "./init";
import { normalizeVars, resolveDefaults, deepMerge } from "./lib";

function setupCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), "config-init-"));
  mkdirSync(join(cwd, "server", "test"), { recursive: true });
  mkdirSync(join(cwd, "admin"), { recursive: true });
  writeFileSync(
    join(cwd, "server", "wrangler.template.jsonc"),
    `{ "org": "{{org}}", "accountId": "{{cloudflare.accountId}}" }\n`,
  );
  writeFileSync(
    join(cwd, "admin", "wrangler.template.jsonc"),
    `{ "org": "{{org}}", "accountId": "{{cloudflare.accountId}}" }\n`,
  );
  writeFileSync(
    join(cwd, "server", "github-app.template.md"),
    `# {{org}}\n`,
  );
  writeFileSync(
    join(cwd, "server", "test", "vars.test.json"),
    `{}\n`,
  );
  writeFileSync(
    join(cwd, "server", "test", "wrangler.test.json"),
    `{}\n`,
  );
  return cwd;
}

const FULL_INPUT = {
  org: "Test",
  github: { org: "test-org" },
  cloudflare: { accountId: "acc", accountSlug: "slug" },
};

function resolveVars(
  varsInputRaw: Record<string, unknown>,
  rawDefaults: Record<string, unknown>,
): Record<string, unknown> {
  const varsInput = normalizeVars(varsInputRaw);
  return deepMerge(resolveDefaults(rawDefaults, varsInput), varsInput);
}

describe("resolveVars", () => {
  test("user var overrides default", () => {
    const vars = resolveVars({ org: "Mine" }, { org: "Default" });
    expect(vars.org).toBe("Mine");
  });

  test("default fills in missing user var", () => {
    const vars = resolveVars({}, { org: "Default" });
    expect(vars.org).toBe("Default");
  });

  test("default key already set by user is excluded from defaults rendering", () => {
    const vars = resolveVars({ org: "Mine" }, { org: "{{org}}" });
    expect(vars.org).toBe("Mine");
  });

  test("default can reference a user var via template", () => {
    const vars = resolveVars(
      { github: { org: "myorg" } },
      { github: { home: "https://github.com/{{github.org}}" } },
    );
    expect((vars.github as Record<string, unknown>).home).toBe("https://github.com/myorg");
  });

  test("default can reference another default via user var", () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: "acme" } },
      {
        cloudflare: { workerName: "lfs-server" },
        lfs: { server: "{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev" },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe("lfs-server.acme.workers.dev");
  });

  test("default can reference another default (chained)", () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: "acme" } },
      {
        cloudflare: { workerName: "lfs-server" },
        lfs: { server: "{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev" },
        github: { appHome: "https://{{lfs.server}}" },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe("lfs-server.acme.workers.dev");
    expect((vars.github as Record<string, unknown>).appHome).toBe("https://lfs-server.acme.workers.dev");
  });

  test("cloudflare.workerName overrides default Worker hostname", () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: "acme", workerName: "lfs-server-staging" } },
      {
        cloudflare: { workerName: "lfs-server" },
        lfs: { server: "{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev" },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe("lfs-server-staging.acme.workers.dev");
  });

  test("optional vars get empty-string defaults", () => {
    const vars = resolveVars({}, {});
    const gh = vars.github as Record<string, unknown>;
    expect(gh.org).toBe("");
    expect(gh.user).toBe("");
    expect(gh.orgs).toBe("");
  });

  test("user vars take precedence over defaults in final merge", () => {
    const vars = resolveVars(
      { org: "User" },
      { org: "Default", extra: "from-default" },
    );
    expect(vars.org).toBe("User");
    expect(vars.extra).toBe("from-default");
  });
});

describe("init()", () => {
  test("reads vars.input.json when present, writes vars.json", () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, "vars.input.json"), JSON.stringify(FULL_INPUT));
      init({ cwd });
      const merged = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(merged.org).toBe("Test");
      expect(existsSync(join(cwd, "wrangler.jsonc"))).toBe(true);
      expect(existsSync(join(cwd, "github-app.md"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("falls back to vars.json when vars.input.json absent", () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, "vars.json"), JSON.stringify(FULL_INPUT));
      init({ cwd });
      const merged = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(merged.org).toBe("Test");
      expect(merged.github.owner).toBe("test-org");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("idempotent: second run on merged output yields same data", () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, "vars.json"), JSON.stringify(FULL_INPUT));
      init({ cwd });
      const firstPass = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      init({ cwd });
      const secondPass = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(secondPass).toEqual(firstPass);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("throws when neither vars.input.json nor vars.json present", () => {
    const cwd = setupCwd();
    try {
      expect(() => init({ cwd })).toThrow(/No vars\.input\.json or vars\.json/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("init env resolution", () => {
  const ENV_INPUT = { ...FULL_INPUT, env: "dev" };

  function run(cwd: string, input: Record<string, unknown>, opts: { env?: string }) {
    writeFileSync(join(cwd, "vars.input.json"), JSON.stringify(input));
    init({ cwd, ...opts });
    return JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
  }

  afterEach(() => {
    delete process.env.GLH_ENV;
  });

  test("--env flag suffixes worker names + bucket", () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, FULL_INPUT, { env: "staging" });
      expect(vars.cloudflare.workerName).toBe("lfs-server-staging");
      expect(vars.cloudflare.admin.workerName).toBe("lfs-admin-staging");
      expect(vars.s3.bucket).toBe("lfs-objects-staging");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--env cascades into derived lfs.server + github.appHome + adminHome", () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, FULL_INPUT, { env: "staging" });
      expect(vars.lfs.server).toBe("lfs-server-staging.slug.workers.dev");
      expect(vars.github.appHome).toBe("https://lfs-server-staging.slug.workers.dev");
      expect(vars.github.adminHome).toBe("https://lfs-admin-staging.slug.workers.dev");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("explicit lfs.server is not suffixed", () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, { ...FULL_INPUT, lfs: { server: "my.custom.host" } }, { env: "staging" });
      expect(vars.lfs.server).toBe("my.custom.host");
      expect(vars.cloudflare.workerName).toBe("lfs-server-staging");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("GLH_ENV used when no flag", () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_ENV = "staging";
      const vars = run(cwd, FULL_INPUT, {});
      expect(vars.cloudflare.workerName).toBe("lfs-server-staging");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("$.env in vars file used when no flag or GLH_ENV", () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, ENV_INPUT, {});
      expect(vars.cloudflare.workerName).toBe("lfs-server-dev");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("flag overrides GLH_ENV and $.env", () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_ENV = "fromenv";
      const vars = run(cwd, ENV_INPUT, { env: "staging" });
      expect(vars.cloudflare.workerName).toBe("lfs-server-staging");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("GLH_ENV overrides $.env", () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_ENV = "staging";
      const vars = run(cwd, ENV_INPUT, {});
      expect(vars.cloudflare.workerName).toBe("lfs-server-staging");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("no env = prod, no suffix", () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, FULL_INPUT, {});
      expect(vars.cloudflare.workerName).toBe("lfs-server");
      expect(vars.s3.bucket).toBe("lfs-objects");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("init GLH_VARS_JSON", () => {
  afterEach(() => {
    delete process.env.GLH_VARS_JSON;
  });

  test("reads vars from GLH_VARS_JSON when set", () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_VARS_JSON = JSON.stringify(FULL_INPUT);
      init({ cwd });
      const vars = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(vars.org).toBe("Test");
      expect(vars.github.owner).toBe("test-org");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("GLH_VARS_JSON takes precedence over vars.input.json", () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, "vars.input.json"), JSON.stringify({ ...FULL_INPUT, org: "FromFile" }));
      process.env.GLH_VARS_JSON = JSON.stringify({ ...FULL_INPUT, org: "FromEnv" });
      init({ cwd });
      const vars = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(vars.org).toBe("FromEnv");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("throws when no GLH_VARS_JSON and no vars file", () => {
    const cwd = setupCwd();
    try {
      expect(() => init({ cwd })).toThrow(/No vars\.input\.json or vars\.json.*GLH_VARS_JSON unset/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("combines with --env staging", () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_VARS_JSON = JSON.stringify(FULL_INPUT);
      init({ cwd, env: "staging" });
      const vars = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(vars.cloudflare.workerName).toBe("lfs-server-staging");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
