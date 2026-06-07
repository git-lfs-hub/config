/**
 * Renders a worker's {workerDir}/wrangler.jsonc from {workerDir}/vars.json (already
 * merged by configVars; env recovered from its `env` field for the suffix safety net).
 * Also renders github-app.md when a github-app.template.md is present — server has
 * one, admin doesn't. Reads only its own dir; never reaches up for a parent's vars.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { enforceEnvSuffixes } from './env';
import { readVarsFile, renderTemplateFile, writeUtf8File } from './lib';

export function configWorker({ workerDir }: { workerDir: string }): void {
  const vars = readVarsFile(workerDir, 'vars.json');
  const env = typeof vars.env === 'string' ? vars.env : '';
  const varsPath = resolve(workerDir, 'vars.json');
  const render = (file: string): string => renderTemplateFile(workerDir, file, vars, varsPath);

  writeUtf8File(
    workerDir,
    'wrangler.jsonc',
    enforceEnvSuffixes(render('wrangler.template.jsonc'), env),
  );
  if (existsSync(resolve(workerDir, 'github-app.template.md'))) {
    writeUtf8File(workerDir, 'github-app.md', render('github-app.template.md'));
  }
}
