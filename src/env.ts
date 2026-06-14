import { deepMerge, isPlainObject, error } from './lib';

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

// Source fields that get a `-{env}` suffix when the input holds a plain string. Each is
// account-global, so an unsuffixed non-prod value would collide with prod. `opaque` marks a
// value that only looks suffixable but isn't (a Slack channel *ID*, vs a channel *name*) —
// left as-is rather than mangled; use a per-env override to vary it across envs.
const SUFFIX_FIELDS: Array<{ path: string[]; opaque?: (v: string) => boolean }> = [
  { path: ['cloudflare', 'workerName'] },
  { path: ['cloudflare', 'admin', 'workerName'] },
  { path: ['s3', 'bucket'] },
  { path: ['s3', 'backup', 'bucket'] },
  { path: ['admin', 'slack', 'channel'], opaque: isSlackChannelId },
];

/** Slack channel IDs are upper-case `C`/`G`/`D…`; channel names are always lower-case. */
function isSlackChannelId(v: string): boolean {
  return /^[CGD][A-Z0-9]{8,}$/.test(v);
}

/**
 * Resolves per-env overrides, then suffixes the account-global source fields so a non-prod
 * deploy never collides with prod. Applied to input *before* defaults resolve, so derived
 * fields (lfs.server, github.appHome, adminHome) cascade from the suffixed names.
 *
 * A field whose input is a plain string is suffixed (`lfs-server` → `lfs-server-staging`);
 * a value that can't be derived by suffixing (an opaque Slack channel ID, a backup bucket
 * named off-convention) is instead given explicitly as a `{ prod, staging?, dev? }` object,
 * which `resolveEnvOverrides` picks by env (prod is the fallback) and which is left
 * unsuffixed. `defaults` backs any source field the input omits.
 */
export function applyEnv(
  vars: Record<string, unknown>,
  env: string | undefined,
  defaults: Record<string, unknown> = {},
): Record<string, unknown> {
  const resolved = resolveEnvOverrides(vars, env) as Record<string, unknown>;
  const s = envSuffixer(env);
  if (!s) return resolved;

  let overrides: Record<string, unknown> = { env: s.env };
  for (const { path, opaque } of SUFFIX_FIELDS) {
    const v = suffixField(get(vars, path), get(defaults, path), s.suffix, opaque);
    if (v !== undefined) overrides = deepMerge(overrides, nest(path, v));
  }
  return deepMerge(resolved, overrides);
}

/** Suffixed string for a plain-string source field; undefined when there's nothing to
 * suffix — an explicit env-override (already resolved into the tree), an `opaque` value that
 * can't be derived by suffixing, or an empty/absent value. */
function suffixField(
  rawVal: unknown,
  defVal: unknown,
  suffix: (v: unknown) => string,
  opaque?: (v: string) => boolean,
): string | undefined {
  if (isEnvSelector(rawVal)) return undefined;
  const v = rawVal ?? defVal;
  if (v === undefined || v === '' || isEnvSelector(v)) return undefined;
  if (opaque?.(String(v))) return undefined;
  return suffix(v);
}

/** Replaces every `{ prod, staging?, dev? }` selector in the tree with its value for `env`
 * (prod is the fallback for an absent key). Returns the input unchanged when it holds no
 * selector, so a no-override prod call stays referentially identical. */
function resolveEnvOverrides(v: unknown, env: string | undefined): unknown {
  if (isEnvSelector(v)) return resolveEnvOverrides(selectEnv(v, env), env);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    let changed = false;
    for (const [k, x] of Object.entries(v)) {
      out[k] = resolveEnvOverrides(x, env);
      if (out[k] !== x) changed = true;
    }
    return changed ? out : v;
  }
  return v;
}

const ENV_KEYS = new Set(['prod', 'production', 'staging', 'dev']);

/** A non-empty plain object keyed solely by recognized env names. */
function isEnvSelector(v: unknown): v is Record<string, unknown> {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => ENV_KEYS.has(k));
}

function selectEnv(obj: Record<string, unknown>, env: string | undefined): unknown {
  const e = (env ?? '').trim();
  const key = PROD_ENVS.has(e) ? 'prod' : e;
  const v = obj[key] ?? obj.prod ?? obj.production;
  return v ?? error(`env-override has no value for env '${e || 'prod'}': ${JSON.stringify(obj)}`);
}

/** Value at a dotted path, or undefined if any segment is missing/non-object. */
function get(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Wraps `value` in the nested object shape described by `path`. */
function nest(path: readonly string[], value: unknown): Record<string, unknown> {
  return path.reduceRight<unknown>((acc, k) => ({ [k]: acc }), value) as Record<string, unknown>;
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
