import { describe, test, expect } from "vitest";
import { applyEnv, enforceEnvSuffixes } from "./env";

describe("applyEnv", () => {
  const base = {
    cloudflare: { workerName: "lfs-server", admin: { workerName: "lfs-admin" } },
    s3: { bucket: "lfs-objects" },
  };

  test("appends -{env} to worker names + bucket", () => {
    const v = applyEnv(base, "staging");
    expect((v.cloudflare as Record<string, unknown>).workerName).toBe("lfs-server-staging");
    expect(((v.cloudflare as Record<string, Record<string, unknown>>).admin).workerName).toBe("lfs-admin-staging");
    expect((v.s3 as Record<string, unknown>).bucket).toBe("lfs-objects-staging");
    expect(v.env).toBe("staging");
  });

  test.each(["", "production", "prod", undefined])("env %j is identity", (e) => {
    expect(applyEnv(base, e)).toBe(base);
  });

  test("leaves KV untouched", () => {
    const withKv = { ...base, cloudflare: { ...base.cloudflare, kv: { githubCacheId: "abc" } } };
    const v = applyEnv(withKv, "staging");
    expect(((v.cloudflare as Record<string, Record<string, unknown>>).kv).githubCacheId).toBe("abc");
  });

  test("idempotent: already-suffixed value not doubled", () => {
    const pre = {
      cloudflare: { workerName: "lfs-server-staging", admin: { workerName: "lfs-admin-staging" } },
      s3: { bucket: "lfs-objects-staging" },
    };
    const v = applyEnv(pre, "staging");
    expect((v.cloudflare as Record<string, unknown>).workerName).toBe("lfs-server-staging");
    expect((v.s3 as Record<string, unknown>).bucket).toBe("lfs-objects-staging");
  });

  test("fills source field from defaults when input omits it", () => {
    const v = applyEnv({}, "staging", { cloudflare: { workerName: "lfs-server" }, s3: { bucket: "lfs-objects" } });
    expect((v.cloudflare as Record<string, unknown>).workerName).toBe("lfs-server-staging");
    expect((v.s3 as Record<string, unknown>).bucket).toBe("lfs-objects-staging");
  });
});

describe("enforceEnvSuffixes", () => {
  // Unsuffixed everywhere — simulates a render that bypassed applyEnv.
  const WRANGLER = `{
  // worker name
  "name": "lfs-server",
  "r2_buckets": [{ "binding": "LFS_BUCKET", "bucket_name": "lfs-objects" }],
  "durable_objects": { "bindings": [{ "name": "LOCKS", "class_name": "Locks" }] },
  "workflows": [{ "name": "migration", "binding": "MIGRATION", "class_name": "Migration" }],
  "vars": { "S3_BUCKET_NAME": "lfs-objects", "S3_ENDPOINT": "https://r2" }
}`;

  function parse(env: string | undefined) {
    return Bun.JSONC.parse(enforceEnvSuffixes(WRANGLER, env)) as any;
  }

  test("suffixes worker name, bucket_name, S3_BUCKET_NAME var, and workflow names", () => {
    const c = parse("dev");
    expect(c.name).toBe("lfs-server-dev");
    expect(c.r2_buckets[0].bucket_name).toBe("lfs-objects-dev");
    expect(c.vars.S3_BUCKET_NAME).toBe("lfs-objects-dev");
    expect(c.workflows[0].name).toBe("migration-dev");
  });

  test("leaves resource-scoped + unrelated fields alone", () => {
    const c = parse("dev");
    expect(c.durable_objects.bindings[0].name).toBe("LOCKS");
    expect(c.durable_objects.bindings[0].class_name).toBe("Locks");
    expect(c.workflows[0].binding).toBe("MIGRATION");
    expect(c.vars.S3_ENDPOINT).toBe("https://r2");
  });

  test("leaves prod (unset/production/prod) unchanged", () => {
    for (const env of [undefined, "", "production", "prod"]) {
      expect(enforceEnvSuffixes(WRANGLER, env)).toBe(WRANGLER);
    }
  });

  test("idempotent", () => {
    const once = enforceEnvSuffixes(WRANGLER, "dev");
    expect(enforceEnvSuffixes(once, "dev")).toBe(once);
  });
});
