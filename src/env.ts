import { deepMerge, isPlainObject } from './lib';

const PROD_ENVS = new Set(['', 'production', 'prod']);

/** null for prod (env unset/production/prod); otherwise an idempotent `-{env}` suffixer. */
function envSuffixer(
  env: string | undefined,
): { env: string; suffix: (v: unknown) => string } | null {
  const e = (env ?? '').trim();
  if (PROD_ENVS.has(e)) return null;
  const sfx = `-${e}`;
  const suffix = (v: unknown): string => {
    const s = String(v);
    return s.endsWith(sfx) ? s : `${s}${sfx}`;
  };
  return { env: e, suffix };
}

/**
 * Suffixes worker names and the S3 bucket so a non-prod deploy never collides with
 * prod. Applied to input *before* defaults resolve, so derived fields (lfs.server,
 * github.appHome, adminHome) cascade from the suffixed names. `defaults` backs any
 * source field the input omits (workerName/bucket come from vars.template.json).
 */
export function applyEnv(
  vars: Record<string, unknown>,
  env: string | undefined,
  defaults: Record<string, unknown> = {},
): Record<string, unknown> {
  const s = envSuffixer(env);
  if (!s) return vars;
  const { suffix } = s;
  const cf = (vars.cloudflare ?? {}) as Record<string, unknown>;
  const dcf = (defaults.cloudflare ?? {}) as Record<string, unknown>;
  const admin = (cf.admin ?? {}) as Record<string, unknown>;
  const dAdmin = (dcf.admin ?? {}) as Record<string, unknown>;
  const s3 = (vars.s3 ?? {}) as Record<string, unknown>;
  const ds3 = (defaults.s3 ?? {}) as Record<string, unknown>;
  const workerName = cf.workerName ?? dcf.workerName;
  const adminName = admin.workerName ?? dAdmin.workerName;
  const bucket = s3.bucket ?? ds3.bucket;
  return deepMerge(vars, {
    env: s.env,
    cloudflare: {
      ...(workerName ? { workerName: suffix(workerName) } : {}),
      ...(adminName ? { admin: { workerName: suffix(adminName) } } : {}),
    },
    ...(bucket ? { s3: { bucket: suffix(bucket) } } : {}),
  });
}

/**
 * Safety net over the rendered config, in case a hardcoded template/vars bypassed
 * applyEnv. Suffixes account-global names (worker, bucket, workflow, queue) — an
 * unsuffixed one silently clobbers/shares the prod resource. Resource-scoped names
 * (DO bindings/classes, KV bindings) don't collide across workers, so left alone.
 * Comments dropped (re-emitted as JSON) — output gitignored, only wrangler reads it.
 */
export function enforceEnvSuffixes(wrangler: string, env: string | undefined): string {
  const s = envSuffixer(env);
  if (!s) return wrangler;
  const config = Bun.JSONC.parse(wrangler) as Record<string, unknown>;

  if (typeof config.name === 'string') config.name = s.suffix(config.name);

  for (const b of asObjects(config.r2_buckets)) {
    if (typeof b.bucket_name === 'string') b.bucket_name = s.suffix(b.bucket_name);
  }
  // The presign var must track the bucket binding.
  const vars = config.vars;
  if (isPlainObject(vars) && typeof vars.S3_BUCKET_NAME === 'string') {
    vars.S3_BUCKET_NAME = s.suffix(vars.S3_BUCKET_NAME);
  }

  for (const wf of asObjects(config.workflows)) {
    if (typeof wf.name === 'string') wf.name = s.suffix(wf.name);
  }

  const queues = config.queues;
  if (isPlainObject(queues)) {
    for (const key of ['producers', 'consumers']) {
      for (const q of asObjects(queues[key])) {
        if (typeof q.queue === 'string') q.queue = s.suffix(q.queue);
      }
    }
  }

  return JSON.stringify(config, null, 2) + '\n';
}

/** Array elements that are plain objects; [] for non-arrays. */
function asObjects(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter(isPlainObject) : [];
}
