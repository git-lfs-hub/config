/**
 * Renders a worker's {workerDir}/wrangler.jsonc from {workerDir}/vars.json (already
 * merged by configVars; env recovered from its `env` field for the suffix safety net).
 * Also renders each `<name>-app.md` when a `<name>-app.template.md` is present (server has
 * github-app; admin has github-app + slack-app). Reads only its own dir; never reaches up
 * for a parent's vars.
 */

// Markdown registration walkthroughs rendered alongside wrangler.jsonc (when their template
// exists in the worker dir).
const DOC_TEMPLATES = ['github-app', 'slack-app'] as const;

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
  for (const name of DOC_TEMPLATES) {
    if (existsSync(resolve(workerDir, `${name}.template.md`))) {
      writeUtf8File(workerDir, `${name}.md`, render(`${name}.template.md`));
    }
  }
}
