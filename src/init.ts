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

export function init({ cwd }: { cwd: string }): void {
  const ws = resolve(cwd);

  const inputPath =
    existing(resolve(ws, "vars.input.json")) ??
    existing(resolve(ws, "vars.json")) ??
    error(`No vars.input.json or vars.json in ${ws}`);

  const input = loadInputVars(inputPath);
  const defaults = loadDefaultVars(pkg, "vars.template.json", input, {
    vars: inputPath,
  });
  const vars = deepMerge(defaults, input);
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
