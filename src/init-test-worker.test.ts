import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTestWorker } from "./init-test-worker";

function setup(opts: {
  template: string;
  testVars: unknown;
  wranglerPatch: unknown;
}): { templateDir: string; testDir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "config-init-test-worker-"));
  const templateDir = join(root, "tpl");
  const testDir = join(root, "test");
  mkdirSync(templateDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(templateDir, "wrangler.template.jsonc"), opts.template);
  writeFileSync(join(testDir, "vars.test.json"), JSON.stringify(opts.testVars));
  writeFileSync(join(testDir, "wrangler.test.json"), JSON.stringify(opts.wranglerPatch));
  return {
    templateDir,
    testDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function readOut(testDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(testDir, "wrangler.jsonc"), "utf8"));
}

describe("initTestWorker", () => {
  test("renders template with testVars overriding package defaults", () => {
    const { templateDir, testDir, cleanup } = setup({
      template: `{ "name": "{{cloudflare.workerName}}", "bucket": "{{s3.bucket}}" }\n`,
      testVars: { cloudflare: { workerName: "test-worker" } },
      wranglerPatch: {},
    });
    try {
      initTestWorker({ templateDir, testDir });
      const out = readOut(testDir);
      expect(out.name).toBe("test-worker");
      expect(out.bucket).toBe("lfs-objects");
    } finally {
      cleanup();
    }
  });

  test("falls through to vars.template.json defaults when testVars omits key", () => {
    const { templateDir, testDir, cleanup } = setup({
      template: `{ "name": "{{cloudflare.workerName}}" }\n`,
      testVars: {},
      wranglerPatch: {},
    });
    try {
      initTestWorker({ templateDir, testDir });
      expect(readOut(testDir).name).toBe("lfs-server");
    } finally {
      cleanup();
    }
  });

  test("optional vars (github.org/user/orgs, sentry.org) get empty-string defaults", () => {
    const { templateDir, testDir, cleanup } = setup({
      template: `{ "org": "{{github.org}}", "user": "{{github.user}}", "orgs": "{{github.orgs}}", "sentry": "{{sentry.org}}" }\n`,
      testVars: {},
      wranglerPatch: {},
    });
    try {
      initTestWorker({ templateDir, testDir });
      const out = readOut(testDir);
      expect(out.org).toBe("");
      expect(out.user).toBe("");
      expect(out.orgs).toBe("");
      expect(out.sentry).toBe("");
    } finally {
      cleanup();
    }
  });

  test("wrangler.test.json patch deep-merges into rendered config", () => {
    const { templateDir, testDir, cleanup } = setup({
      template: `{ "vars": { "A": "1", "B": "2" }, "compatibility_flags": ["nodejs_compat"] }\n`,
      testVars: {},
      wranglerPatch: {
        vars: { A: "overridden", C: "added" },
        new_field: "from-patch",
      },
    });
    try {
      initTestWorker({ templateDir, testDir });
      const out = readOut(testDir);
      expect(out.vars).toEqual({ A: "overridden", B: "2", C: "added" });
      expect(out.compatibility_flags).toEqual(["nodejs_compat"]);
      expect(out.new_field).toBe("from-patch");
    } finally {
      cleanup();
    }
  });

  test("null value in patch deletes top-level key", () => {
    const { templateDir, testDir, cleanup } = setup({
      template: `{ "observability": { "enabled": true }, "upload_source_maps": true, "keep": "yes" }\n`,
      testVars: {},
      wranglerPatch: { observability: null, upload_source_maps: null },
    });
    try {
      initTestWorker({ templateDir, testDir });
      const out = readOut(testDir);
      expect(out).not.toHaveProperty("observability");
      expect(out).not.toHaveProperty("upload_source_maps");
      expect(out.keep).toBe("yes");
    } finally {
      cleanup();
    }
  });

  test("supports JSONC (comments) in template", () => {
    const { templateDir, testDir, cleanup } = setup({
      template: `{\n  // a comment\n  "name": "{{cloudflare.workerName}}"\n}\n`,
      testVars: {},
      wranglerPatch: {},
    });
    try {
      initTestWorker({ templateDir, testDir });
      expect(readOut(testDir).name).toBe("lfs-server");
    } finally {
      cleanup();
    }
  });

  test("throws on missing wrangler.template.jsonc", () => {
    const root = mkdtempSync(join(tmpdir(), "config-init-test-worker-"));
    const templateDir = join(root, "tpl");
    const testDir = join(root, "test");
    mkdirSync(templateDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "vars.test.json"), "{}");
    writeFileSync(join(testDir, "wrangler.test.json"), "{}");
    try {
      expect(() => initTestWorker({ templateDir, testDir })).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
