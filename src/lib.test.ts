import { describe, test, expect, vi, afterAll, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeValue, normalizeVars, renderTemplate, optionalVars, writeUtf8File } from "./lib";

describe("normalize", () => {
  test("joins array with spaces", () => {
    expect(normalizeValue(["alice", "bob"])).toBe("alice bob");
  });

  test("single-element array produces bare value", () => {
    expect(normalizeValue(["alice"])).toBe("alice");
  });

  test("empty array produces empty string", () => {
    expect(normalizeValue([])).toBe("");
  });

  test("passes string through unchanged", () => {
    expect(normalizeValue("alice bob")).toBe("alice bob");
  });

  test("passes empty string through unchanged", () => {
    expect(normalizeValue("")).toBe("");
  });

  test("passes non-string primitives through", () => {
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue(null)).toBe(null);
  });

  test("recurses into plain objects", () => {
    expect(normalizeValue({ users: ["alice", "bob"], org: "myorg" })).toEqual({ users: "alice bob", org: "myorg" });
  });
});

describe("buildVars", () => {
  test("provides empty-string defaults for optional vars", () => {
    const result = normalizeVars({ org: "Test", cloudflare: { accountSlug: "slug", accountId: "id" } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.org).toBe("");
    expect(gh.user).toBe("");
    expect(gh.orgs).toBe("");
  });

  test("vars.json values override defaults", () => {
    const result = normalizeVars({ github: { org: "myorg" } });
    expect((result.github as Record<string, unknown>).org).toBe("myorg");
  });

  test("computes owner from user (user mode)", () => {
    const result = normalizeVars({ github: { user: "pasha" } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.owner).toBe("pasha");
  });

  test("computes owner from org (org mode)", () => {
    const result = normalizeVars({ github: { org: "myorg" } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.owner).toBe("myorg");
  });

  test("computes owner from first orgs entry when org absent", () => {
    const result = normalizeVars({ github: { orgs: "org1 org2" } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.owner).toBe("org1");
    expect(gh.org).toBe("org1");
  });

  test("user takes priority over org for owner", () => {
    const result = normalizeVars({ github: { user: "pasha", org: "myorg" } });
    expect((result.github as Record<string, unknown>).owner).toBe("pasha");
  });

  test("owner is empty string when neither user nor org set", () => {
    const result = normalizeVars({});
    expect((result.github as Record<string, unknown>).owner).toBe("");
  });

  test("string list values pass through unchanged", () => {
    const result = normalizeVars({ github: { orgs: "foo bar,baz" } });
    expect((result.github as Record<string, unknown>).orgs).toBe("foo bar,baz");
  });

  test("preserves non-list keys from vars.json", () => {
    const result = normalizeVars({ org: "Acme", cloudflare: { accountSlug: "acme-123" } });
    expect(result.org).toBe("Acme");
    expect(result.cloudflare).toEqual({ accountSlug: "acme-123" });
  });

  test("all optionalVars keys are present even when raw is empty", () => {
    const result = normalizeVars({});
    for (const key of Object.keys(optionalVars)) {
      expect(key in result).toBe(true);
    }
  });
});

describe("renderTemplate", () => {
  test("substitutes a simple placeholder", () => {
    expect(renderTemplate("hello {{name}}", { name: "world" })).toBe("hello world");
  });

  test("substitutes multiple placeholders", () => {
    const out = renderTemplate("{{a}} and {{b}}", { a: "foo", b: "bar" });
    expect(out).toBe("foo and bar");
  });

  test("does not HTML-escape values (noEscape)", () => {
    const out = renderTemplate("{{val}}", { val: "a & b" });
    expect(out).toBe("a & b");
  });

  test("throws in strict mode when a placeholder is missing", () => {
    expect(() => renderTemplate("{{missing}}", {})).toThrow();
  });

  test("renders empty string for an empty-string var", () => {
    expect(renderTemplate('"{{github.org}}"', { github: { org: "" } })).toBe('""');
  });

  test("full wrangler-style snippet renders correctly", () => {
    const template = `"GITHUB_ORG": "{{github.org}}",\n"GITHUB_USER": "{{github.user}}"`;
    const out = renderTemplate(template, { github: { org: "myorg", user: "" } });
    expect(out).toBe(`"GITHUB_ORG": "myorg",\n"GITHUB_USER": ""`);
  });
});

describe("writeUtf8File", () => {
  const dir = mkdtempSync(join(tmpdir(), "writeUtf8File-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  afterEach(() => vi.restoreAllMocks());

  test("creates file when missing", () => {
    const p = join(dir, "new.txt");
    writeUtf8File(p, "hello");
    expect(readFileSync(p, "utf8")).toBe("hello");
  });

  test("overwrites when content differs", () => {
    const p = join(dir, "diff.txt");
    writeFileSync(p, "old", "utf8");
    writeUtf8File(p, "new");
    expect(readFileSync(p, "utf8")).toBe("new");
  });

  test("skips write when content matches existing", () => {
    const p = join(dir, "same.txt");
    writeFileSync(p, "hello", "utf8");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    writeUtf8File(p, "hello");
    expect(log).not.toHaveBeenCalled();
  });

  test("logs when write occurs", () => {
    const p = join(dir, "logged.txt");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    writeUtf8File(p, "hello");
    expect(log).toHaveBeenCalledWith(`Wrote ${p}`);
  });
});

describe("end-to-end: buildVars + renderTemplate", () => {
  test("github.owner renders correctly in template", () => {
    const vars = normalizeVars({ github: { org: "myorg" } });
    const out = renderTemplate('"home": "https://github.com/{{github.owner}}"', vars);
    expect(out).toBe('"home": "https://github.com/myorg"');
  });

  test("missing optional var renders as empty string", () => {
    const vars = normalizeVars({ org: "Test" });
    const out = renderTemplate('"GITHUB_ORGS": "{{github.orgs}}"', vars);
    expect(out).toBe('"GITHUB_ORGS": ""');
  });

  test("vars.json string value passes through to template", () => {
    const vars = normalizeVars({ github: { org: "myorg" } });
    const out = renderTemplate('"GITHUB_ORG": "{{github.org}}"', vars);
    expect(out).toBe('"GITHUB_ORG": "myorg"');
  });
});
