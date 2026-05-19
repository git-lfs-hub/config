import { describe, test, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "./init";
import { normalizeVars, resolveDefaults, deepMerge } from "./lib";

function setupCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), "config-init-"));
  mkdirSync(join(cwd, "server"), { recursive: true });
  writeFileSync(
    join(cwd, "server", "wrangler.template.jsonc"),
    `{ "org": "{{org}}", "accountId": "{{cloudflare.accountId}}" }\n`,
  );
  writeFileSync(
    join(cwd, "server", "github-app.template.md"),
    `# {{org}}\n`,
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
      { lfs: { server: "lfs.{{cloudflare.accountSlug}}.workers.dev" } },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe("lfs.acme.workers.dev");
  });

  test("default can reference another default (chained)", () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: "acme" } },
      {
        lfs: { server: "lfs.{{cloudflare.accountSlug}}.workers.dev" },
        github: { appHome: "https://{{lfs.server}}" },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe("lfs.acme.workers.dev");
    expect((vars.github as Record<string, unknown>).appHome).toBe("https://lfs.acme.workers.dev");
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
      init({ cwd, force: false });
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
      init({ cwd, force: false });
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
      init({ cwd, force: false });
      const firstPass = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      init({ cwd, force: false });
      const secondPass = JSON.parse(readFileSync(join(cwd, "vars.json"), "utf8"));
      expect(secondPass).toEqual(firstPass);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("throws when neither vars.input.json nor vars.json present", () => {
    const cwd = setupCwd();
    try {
      expect(() => init({ cwd, force: false })).toThrow(/No vars\.input\.json or vars\.json/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("preserves existing wrangler.jsonc unless --force", () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, "vars.input.json"), JSON.stringify(FULL_INPUT));
      writeFileSync(join(cwd, "wrangler.jsonc"), "PRESERVED");
      init({ cwd, force: false });
      expect(readFileSync(join(cwd, "wrangler.jsonc"), "utf8")).toBe("PRESERVED");
      init({ cwd, force: true });
      expect(readFileSync(join(cwd, "wrangler.jsonc"), "utf8")).not.toBe("PRESERVED");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
