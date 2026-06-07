/**
 * Resolves vars.input.json (or vars.json/GLH_VARS_JSON) + defaults into
 * {varsDir}/vars.json — the merged, env-applied vars every worker renders from.
 * cli.sh symlinks the result into each worker dir; the worker render reads it there.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyEnv } from './env';
import {
  loadInputVars,
  loadDefaultVars,
  deepMerge,
  normalizeVars,
  readVarsFile,
  error,
  validateSchema,
  writeJsonFile,
} from './lib';

function existing(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** On-disk pin for the deploy env; survives turbo strict-env stripping that GLH_ENV can't. */
function readDotConfigEnv(dir: string): string | undefined {
  const path = existing(resolve(dir, '.config.json'));
  return path ? (readVarsFile('', path).env as string | undefined) : undefined;
}

export function configVars({ varsDir, env }: { varsDir: string; env?: string }): void {
  // Precedence: GLH_VARS_JSON env > vars.input.json > vars.json.
  const varsJson = process.env.GLH_VARS_JSON;
  const inputPath = varsJson
    ? '$GLH_VARS_JSON'
    : (existing(resolve(varsDir, 'vars.input.json')) ??
      existing(resolve(varsDir, 'vars.json')) ??
      error(`No vars.input.json or vars.json in ${varsDir}, and GLH_VARS_JSON unset`));

  const input = varsJson
    ? normalizeVars(JSON.parse(varsJson) as Record<string, unknown>)
    : loadInputVars(inputPath);

  // Suffix the source fields (workerName, admin.workerName, bucket) before
  // resolving defaults, so derived fields (lfs.server, github.appHome,
  // github.adminHome) cascade from the suffixed names.
  // Precedence: --env flag > GLH_ENV > .config.json.
  const resolvedEnv = env ?? process.env.GLH_ENV ?? readDotConfigEnv(varsDir);
  const templateDefaults = readVarsFile(pkg, 'vars.template.json');
  const envInput = applyEnv(input, resolvedEnv, templateDefaults);

  const defaults = loadDefaultVars(pkg, 'vars.template.json', envInput, {
    vars: inputPath,
  });
  const vars = deepMerge(defaults, envInput);
  // applyEnv only writes `env` for non-prod (it no-ops on prod). Pin it here for
  // every env so vars.json is authoritative — it feeds wrangler's ENV var
  // ({{env}}), config-worker's env suffixing, and the deploy-target assertion.
  vars.env = (resolvedEnv ?? '').trim();
  validateSchema(pkg, vars, 'vars.schema.json');
  writeJsonFile(varsDir, 'vars.json', vars);
}
