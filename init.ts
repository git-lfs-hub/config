/**
 * Renders deployment artifacts from Handlebars templates in `cwd`:
 * - vars.json    ← vars.input.json (or vars.json) merged with vars.template.json
 * - wrangler.jsonc ← server/wrangler.template.jsonc (skipped if exists unless --force)
 * - github-app.md  ← server/github-app.template.md
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadInputVars, loadDefaultVars, deepMerge, renderTemplateFile, validateSchema, writeJsonFile } from "./lib";

const pkg = dirname(fileURLToPath(import.meta.url));

export function init({ cwd, force }: { cwd: string; force: boolean }): void {
  const ws = resolve(cwd);

  const inputCandidate = resolve(ws, "vars.input.json");
  const legacyCandidate = resolve(ws, "vars.json");
  const inputPath = existsSync(inputCandidate)
    ? inputCandidate
    : existsSync(legacyCandidate)
      ? legacyCandidate
      : (() => { throw new Error(`No vars.input.json or vars.json in ${ws}`); })();

  const input = loadInputVars(inputPath);
  const defaults = loadDefaultVars(resolve(pkg, "vars.template.json"), input, { vars: inputPath });
  const vars = deepMerge(defaults, input);
  validateSchema(vars, resolve(pkg, "vars.schema.json"));
  writeJsonFile(resolve(ws, "vars.json"), vars);

  const render = (relIn: string, relOut: string) =>
    renderTemplateFile(resolve(ws, relIn), resolve(ws, relOut), vars, inputPath);

  if (force || !existsSync(resolve(ws, "wrangler.jsonc"))) {
    render("server/wrangler.template.jsonc", "wrangler.jsonc");
  }
  render("server/github-app.template.md", "github-app.md");
}
