/**
 * Renders a worker's test `wrangler.jsonc` for standalone (non-deploy) use:
 * - reads `{output}/vars.test.json` (testVars input)
 * - merges with `vars.template.json` defaults from this package
 * - renders `{input}/wrangler.template.jsonc`
 * - deep-merges with `{output}/wrangler.test.json` patch (null = delete key)
 * - writes `{output}/wrangler.jsonc`
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deepMerge,
  normalizeVars,
  readVarsFile,
  renderTemplate,
  writeJsonFile,
} from "./lib";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function configTestWorker({ templateDir, testDir }: { templateDir: string; testDir: string }): void {
  const testVarsPath = resolve(testDir, "vars.test.json");
  const wranglerPatchPath = resolve(testDir, "wrangler.test.json");
  const templatePath = resolve(templateDir, "wrangler.template.jsonc");

  const testInput = normalizeVars(readVarsFile("", testVarsPath));
  // Skip loadDefaultVars: it strictly resolves cross-default {{refs}} that would
  // require user-input vars (org, cloudflare.accountId) absent in standalone mode.
  // vars.test.json overrides every default that contains unresolved refs used by
  // wrangler.template.jsonc, so raw deep-merge is sufficient.
  const defaults = readVarsFile(pkg, "vars.template.json");
  const vars = deepMerge(defaults, testInput);

  const rendered = renderTemplate(readFileSync(templatePath, "utf8"), vars, {
    template: templatePath,
    vars: testVarsPath,
  });
  const config = deepMerge(
    Bun.JSONC.parse(rendered) as Record<string, unknown>,
    readVarsFile("", wranglerPatchPath),
  );
  for (const k of Object.keys(config)) if (config[k] === null) delete config[k];

  writeJsonFile(testDir, "wrangler.jsonc", config);
}
