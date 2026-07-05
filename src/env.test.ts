import { describe, test, expect } from 'vitest';

import { applyEnv, enforceEnvSuffixes } from './env';

describe('applyEnv', () => {
  const base = {
    cloudflare: {
      workerName: 'lfs-server',
      admin: { workerName: 'lfs-admin' },
      compute: { workerName: 'lfs-compute' },
    },
    s3: { bucket: 'lfs-objects' },
  };

  test('appends -{env} to worker names + bucket', () => {
    const v = applyEnv(base, 'staging');
    const cloudflare = v.cloudflare as {
      workerName: string;
      admin: { workerName: string };
      compute: { workerName: string };
    };
    expect(cloudflare.workerName).toBe('lfs-server-staging');
    expect(cloudflare.admin.workerName).toBe('lfs-admin-staging');
    expect(cloudflare.compute.workerName).toBe('lfs-compute-staging');
    expect((v.s3 as Record<string, unknown>).bucket).toBe('lfs-objects-staging');
    expect(v.env).toBe('staging');
  });

  test.each(['', 'production', 'prod', undefined])('env %j is identity', (e) => {
    expect(applyEnv(base, e)).toBe(base);
  });

  test('leaves KV untouched', () => {
    const withKv = { ...base, cloudflare: { ...base.cloudflare, kv: { githubCacheId: 'abc' } } };
    const v = applyEnv(withKv, 'staging');
    const cloudflare = v.cloudflare as { kv: { githubCacheId: string } };
    expect(cloudflare.kv.githubCacheId).toBe('abc');
  });

  test('idempotent: already-suffixed value not doubled', () => {
    const pre = {
      cloudflare: { workerName: 'lfs-server-staging', admin: { workerName: 'lfs-admin-staging' } },
      s3: { bucket: 'lfs-objects-staging' },
    };
    const v = applyEnv(pre, 'staging');
    expect((v.cloudflare as Record<string, unknown>).workerName).toBe('lfs-server-staging');
    expect((v.s3 as Record<string, unknown>).bucket).toBe('lfs-objects-staging');
  });

  test('fills source field from defaults when input omits it', () => {
    const v = applyEnv({}, 'staging', {
      cloudflare: { workerName: 'lfs-server' },
      s3: { bucket: 'lfs-objects' },
    });
    expect((v.cloudflare as Record<string, unknown>).workerName).toBe('lfs-server-staging');
    expect((v.s3 as Record<string, unknown>).bucket).toBe('lfs-objects-staging');
  });

  const backupBucket = (v: Record<string, unknown>) =>
    ((v.s3 as Record<string, unknown>).backup as Record<string, unknown>).bucket;
  const slackChannel = (v: Record<string, unknown>) =>
    ((v.admin as Record<string, unknown>).slack as Record<string, unknown>).channel;

  test('suffixes plain-string backup bucket + slack channel', () => {
    const v = applyEnv(
      { s3: { backup: { bucket: 'glh-backup' } }, admin: { slack: { channel: 'glh-alerts' } } },
      'staging',
    );
    expect(backupBucket(v)).toBe('glh-backup-staging');
    expect(slackChannel(v)).toBe('glh-alerts-staging');
  });

  test('leaves a Slack channel ID unsuffixed, still suffixes a channel name', () => {
    const id = applyEnv({ admin: { slack: { channel: 'C0B8UCE4G8H' } } }, 'staging');
    expect(slackChannel(id)).toBe('C0B8UCE4G8H');
    const name = applyEnv({ admin: { slack: { channel: 'glh-alerts' } } }, 'staging');
    expect(slackChannel(name)).toBe('glh-alerts-staging');
  });

  test('leaves empty backup bucket + slack channel empty (no bare -env)', () => {
    const v = applyEnv(
      { s3: { backup: { bucket: '' } }, admin: { slack: { channel: '' } } },
      'dev',
    );
    expect(backupBucket(v)).toBe('');
    expect(slackChannel(v)).toBe('');
  });

  test('env-override object picks the env value, unsuffixed', () => {
    const v = applyEnv(
      {
        cloudflare: { workerName: 'lfs-server' },
        admin: { slack: { channel: { prod: 'C_PROD', staging: 'C_STAGE', dev: 'C_DEV' } } },
      },
      'staging',
    );
    expect(slackChannel(v)).toBe('C_STAGE');
    // a sibling plain string still gets suffixed
    expect((v.cloudflare as Record<string, unknown>).workerName).toBe('lfs-server-staging');
  });

  test('env-override falls back to prod when the env key is absent', () => {
    const v = applyEnv(
      { admin: { slack: { channel: { prod: 'C_PROD', staging: 'C_STAGE' } } } },
      'dev',
    );
    expect(slackChannel(v)).toBe('C_PROD');
  });

  test('prod selects the prod branch of an env-override, no suffix', () => {
    const v = applyEnv(
      { s3: { backup: { bucket: { prod: 'glh-backup', staging: 'glh-backup-staging' } } } },
      '',
    );
    expect(backupBucket(v)).toBe('glh-backup');
  });

  test('resolves env-overrides anywhere in the tree (e.g. KV id)', () => {
    const v = applyEnv(
      { cloudflare: { kv: { githubCacheId: { prod: 'KV_PROD', staging: 'KV_STAGE' } } } },
      'staging',
    );
    expect(((v.cloudflare as any).kv as Record<string, unknown>).githubCacheId).toBe('KV_STAGE');
  });

  test('throws when an env-override lacks the env key and a prod fallback', () => {
    expect(() =>
      applyEnv({ admin: { slack: { channel: { staging: 'C_STAGE' } } } }, 'dev'),
    ).toThrow(/no value for env 'dev'/);
  });
});

describe('enforceEnvSuffixes', () => {
  // Unsuffixed everywhere — simulates a render that bypassed applyEnv.
  const WRANGLER = `{
  // worker name
  "name": "lfs-server",
  "r2_buckets": [{ "binding": "LFS_BUCKET", "bucket_name": "lfs-objects" }],
  "durable_objects": { "bindings": [{ "name": "LOCKS", "class_name": "Locks" }] },
  "workflows": [{ "name": "migration", "binding": "MIGRATION", "class_name": "Migration" }],
  "queues": {
    "producers": [{ "binding": "OBJECT_EVENTS", "queue": "lfs-object-events" }],
    "consumers": [{ "queue": "lfs-object-events" }]
  },
  "vars": { "S3_BUCKET_NAME": "lfs-objects", "S3_ENDPOINT": "https://r2" }
}`;

  function parse(env: string | undefined) {
    return Bun.JSONC.parse(enforceEnvSuffixes(WRANGLER, env)) as any;
  }

  test('suffixes worker name, bucket_name, S3_BUCKET_NAME var, and workflow names', () => {
    const c = parse('dev');
    expect(c.name).toBe('lfs-server-dev');
    expect(c.r2_buckets[0].bucket_name).toBe('lfs-objects-dev');
    expect(c.vars.S3_BUCKET_NAME).toBe('lfs-objects-dev');
    expect(c.workflows[0].name).toBe('migration-dev');
    expect(c.queues.producers[0].queue).toBe('lfs-object-events-dev');
    expect(c.queues.consumers[0].queue).toBe('lfs-object-events-dev');
  });

  test('leaves resource-scoped + unrelated fields alone', () => {
    const c = parse('dev');
    expect(c.durable_objects.bindings[0].name).toBe('LOCKS');
    expect(c.durable_objects.bindings[0].class_name).toBe('Locks');
    expect(c.workflows[0].binding).toBe('MIGRATION');
    expect(c.vars.S3_ENDPOINT).toBe('https://r2');
  });

  test('leaves prod (unset/production/prod) unchanged', () => {
    for (const env of [undefined, '', 'production', 'prod']) {
      expect(enforceEnvSuffixes(WRANGLER, env)).toBe(WRANGLER);
    }
  });

  test('idempotent', () => {
    const once = enforceEnvSuffixes(WRANGLER, 'dev');
    expect(enforceEnvSuffixes(once, 'dev')).toBe(once);
  });
});
