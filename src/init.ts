/**
 * Renders deployment artifacts from Handlebars templates in `cwd`:
 * - vars.json    ← vars.input.json (or vars.json) merged with vars.template.json
 * - wrangler.jsonc ← server/wrangler.template.jsonc
 * - wrangler.admin.jsonc ← admin/wrangler.template.jsonc
 * - github-app.md  ← server/github-app.template.md
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadInputVars,
  loadDefaultVars,
  deepMerge,
  applyEnv,
  normalizeVars,
  readVarsFile,
  error,
  renderTemplateFile,
  validateSchema,
  writeJsonFile,
  writeUtf8File,
} from "./lib";

function existing(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function init({ cwd, env }: { cwd: string; env?: string }): void {
  const ws = resolve(cwd);

  // Precedence: GLH_VARS_JSON env > vars.input.json > vars.json.
  const varsJson = process.env.GLH_VARS_JSON;
  const inputPath = varsJson
    ? "$GLH_VARS_JSON"
    : existing(resolve(ws, "vars.input.json")) ??
      existing(resolve(ws, "vars.json")) ??
      error(`No vars.input.json or vars.json in ${ws}, and GLH_VARS_JSON unset`);

  const input = varsJson
    ? normalizeVars(JSON.parse(varsJson) as Record<string, unknown>)
    : loadInputVars(inputPath);

  // Suffix the source fields (workerName, admin.workerName, bucket) before
  // resolving defaults, so derived fields (lfs.server, github.appHome,
  // github.adminHome) cascade from the suffixed names.
  // Precedence: --env flag > GLH_ENV > $.env in vars file.
  const resolvedEnv = env ?? process.env.GLH_ENV ?? (input.env as string | undefined);
  const templateDefaults = readVarsFile(pkg, "vars.template.json");
  const envInput = applyEnv(input, resolvedEnv, templateDefaults);

  const defaults = loadDefaultVars(pkg, "vars.template.json", envInput, {
    vars: inputPath,
  });
  const vars = deepMerge(defaults, envInput);
  validateSchema(pkg, vars, "vars.schema.json");
  writeJsonFile(ws, "vars.json", vars);

  function render(relIn: string): string {
    return renderTemplateFile(ws, relIn, vars, inputPath);
  }

  writeUtf8File(ws, "wrangler.jsonc", render("server/wrangler.template.jsonc"));
  if (existsSync(resolve(ws, "admin"))) {
    writeUtf8File(ws, "wrangler.admin.jsonc", render("admin/wrangler.template.jsonc"));
  }
  writeUtf8File(ws, "github-app.md", render("server/github-app.template.md"));
}
