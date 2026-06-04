/**
 * Renders deployment artifacts from Handlebars templates. Source and output dirs
 * are passed explicitly (cli.ts derives them from --ws / --server / --admin):
 * - vars.json            ← {varsDir}/vars.input.json (or vars.json) merged with vars.template.json
 * - wrangler.jsonc       ← {serverDir}/wrangler.template.jsonc
 * - github-app.md        ← {serverDir}/github-app.template.md
 * - wrangler[.admin].jsonc ← {adminDir}/wrangler.template.jsonc   (.admin. suffix only when a server is also rendered)
 * All outputs are written to {outDir}.
 *
 * Monorepo: varsDir/outDir = ws, serverDir = ws/server, adminDir = ws/admin (both rendered).
 * Standalone: varsDir = outDir = the single repo root, and exactly one of serverDir/adminDir set to it.
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadInputVars,
  loadDefaultVars,
  deepMerge,
  normalizeVars,
  readVarsFile,
  error,
  renderTemplateFile,
  validateSchema,
  writeJsonFile,
  writeUtf8File,
} from "./lib";
import { applyEnv, enforceEnvSuffixes } from "./env";

function existing(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface InitDirs {
  /** Reads vars.input.json (or vars.json) and writes vars.json. */
  varsDir: string;
  /** Writes the rendered artifacts. */
  outDir: string;
  /** Reads wrangler.template.jsonc + github-app.template.md for the server Worker. */
  serverDir?: string;
  /** Reads wrangler.template.jsonc for the admin Worker. Skipped if unset or absent. */
  adminDir?: string;
  env?: string;
}

/** On-disk pin for the deploy env; survives turbo strict-env stripping that GLH_ENV can't. */
function readDotConfigEnv(dir: string): string | undefined {
  const path = existing(resolve(dir, ".config.json"));
  return path ? (readVarsFile("", path).env as string | undefined) : undefined;
}

export function init({ varsDir, outDir, serverDir, adminDir, env }: InitDirs): void {
  // Precedence: GLH_VARS_JSON env > vars.input.json > vars.json.
  const varsJson = process.env.GLH_VARS_JSON;
  const inputPath = varsJson
    ? "$GLH_VARS_JSON"
    : existing(resolve(varsDir, "vars.input.json")) ??
      existing(resolve(varsDir, "vars.json")) ??
      error(`No vars.input.json or vars.json in ${varsDir}, and GLH_VARS_JSON unset`);

  const input = varsJson
    ? normalizeVars(JSON.parse(varsJson) as Record<string, unknown>)
    : loadInputVars(inputPath);

  // Suffix the source fields (workerName, admin.workerName, bucket) before
  // resolving defaults, so derived fields (lfs.server, github.appHome,
  // github.adminHome) cascade from the suffixed names.
  // Precedence: --env flag > GLH_ENV > .config.json.
  const resolvedEnv = env ?? process.env.GLH_ENV ?? readDotConfigEnv(varsDir);
  const templateDefaults = readVarsFile(pkg, "vars.template.json");
  const envInput = applyEnv(input, resolvedEnv, templateDefaults);

  const defaults = loadDefaultVars(pkg, "vars.template.json", envInput, {
    vars: inputPath,
  });
  const vars = deepMerge(defaults, envInput);
  // applyEnv only writes `env` for non-prod (it no-ops on prod). Pin it here for
  // every env so vars.json is authoritative — it feeds wrangler's ENV var
  // ({{env}}) and the deploy-target assertion.
  vars.env = (resolvedEnv ?? "").trim();
  validateSchema(pkg, vars, "vars.schema.json");
  writeJsonFile(varsDir, "vars.json", vars);

  function render(dir: string, file: string): string {
    return renderTemplateFile(dir, file, vars, inputPath);
  }

  if (serverDir) {
    writeUtf8File(outDir, "wrangler.jsonc", enforceEnvSuffixes(render(serverDir, "wrangler.template.jsonc"), resolvedEnv));
    writeUtf8File(outDir, "github-app.md", render(serverDir, "github-app.template.md"));
  }
  if (adminDir && existsSync(adminDir)) {
    // Suffix the output only when it shares outDir with a server render (monorepo).
    const adminOut = serverDir ? "wrangler.admin.jsonc" : "wrangler.jsonc";
    writeUtf8File(outDir, adminOut, enforceEnvSuffixes(render(adminDir, "wrangler.template.jsonc"), resolvedEnv));
  }
}
