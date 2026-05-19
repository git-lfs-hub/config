import { readFileSync, writeFileSync } from "node:fs";
import Ajv, { type AnySchema } from "ajv";
import Handlebars from "handlebars";

export const error = (msg: string): never => { throw new Error(msg); };

export const optionalVars: Record<string, unknown> = JSON.parse(readFileSync(new URL("vars.optional.json", import.meta.url), "utf8"));

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [k, v] of Object.entries(override)) {
    result[k] = isPlainObject(v) && isPlainObject(result[k])
      ? deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>)
      : v;
  }
  return result;
}

function filterDefaults(defaults: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, defVal] of Object.entries(defaults)) {
    if (!(k in input)) {
      result[k] = defVal;
    } else if (isPlainObject(defVal) && isPlainObject(input[k])) {
      const sub = filterDefaults(defVal as Record<string, unknown>, input[k] as Record<string, unknown>);
      if (Object.keys(sub).length > 0) result[k] = sub;
    }
  }
  return result;
}

export function loadInputVars(path: string): Record<string, unknown> {
  return normalizeVars(readVarsFile(path));
}

/** Merges vars.json contents with defaults and normalizes array values. */
export function normalizeVars(raw: Record<string, unknown>): Record<string, unknown> {
  const result = Object.fromEntries(
    Object.entries(deepMerge(optionalVars, raw)).map(([k, v]) => [k, normalizeValue(v)]),
  );
  const gh = result.github as Record<string, unknown> | undefined;
  if (gh) {
    const user = gh.user as string;
    if (user) {
      gh.owner = user;
    } else {
      const firstOrg = (gh.org as string) || (gh.orgs as string)?.split(/[,;\s]+/).find(Boolean) || "";
      if (!gh.org && firstOrg) gh.org = firstOrg;
      gh.owner = firstOrg;
    }
  }
  return result;
}

/** Converts array values to space-separated strings; recurses into plain objects. */
export function normalizeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.join(" ");
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, normalizeValue(val)]));
  return v;
}

export function loadDefaultVars(
  defaultsPath: string,
  input: Record<string, unknown>,
  context?: Record<string, string | undefined>,
): Record<string, unknown> {
  return resolveDefaults(readVarsFile(defaultsPath), input, { template: defaultsPath, ...context });
}

/** Filters, then resolves defaults that may reference each other or input, via multi-pass rendering. */
export function resolveDefaults(
  defaults: Record<string, unknown>,
  input: Record<string, unknown>,
  context?: Record<string, string | undefined>,
): Record<string, unknown> {
  const filtered = filterDefaults(defaults, input);
  let resolved: Record<string, unknown> = {};
  for (let pass = 0; pass < 10; pass++) {
    const prev = JSON.stringify(resolved);
    resolved = JSON.parse(
      Handlebars.compile(JSON.stringify(filtered), { noEscape: true })(deepMerge(resolved, input)),
    ) as Record<string, unknown>;
    if (JSON.stringify(resolved) === prev) break;
  }
  return JSON.parse(renderTemplate(JSON.stringify(filtered), deepMerge(resolved, input), context));
}

/** Reads and parses a JSON file. */
export function readVarsFile(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** Reads a template file, renders it with vars, and writes the result to outPath. */
export function renderTemplateFile(path: string, outPath: string, vars: Record<string, unknown>, varsPath?: string): void {
  writeUtf8File(outPath, renderTemplate(readFileSync(path, "utf8"), vars, { template: path, vars: varsPath }));
}

/** Renders a Handlebars template string with the given vars (strict, no HTML escaping). */
export function renderTemplate(source: string, vars: Record<string, unknown>, context?: Record<string, string | undefined>): string {
  try {
    return Handlebars.compile(source, { strict: true, noEscape: true })(vars);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const msg = [err];
    for (const [k, v] of Object.entries(context ?? {})) {
      msg.push(`  ${k}: ${v}`);
    }
    const match = err.match(/ - (\d+):(\d+)$/);
    if (match) {
      const lines = source.split("\n");
      const lineNo = parseInt(match[1]!);
      const colNo = parseInt(match[2]!);
      const prefix = `line ${lineNo}: `;
      msg.push(`  ${prefix}${lines[lineNo - 1] ?? ""}`);
      msg.push(`  ${" ".repeat(prefix.length + colNo - 1)}^`);
    }
    throw new Error(msg.join("\n"));
  }
}

/** Serializes data to a JSON file with trailing newline. */
export function writeJsonFile(path: string, data: unknown): void {
  writeUtf8File(path, JSON.stringify(data, null, 2) + "\n");
}

/** Writes a UTF-8 file and logs the path. */
export function writeUtf8File(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
  console.log(`Wrote ${path}`);
}

/** Validates data against a JSON Schema file; throws with ajv error text on failure. */
export function validateSchema(data: Record<string, unknown>, ...schemaPaths: string[]): void {
  const schemaPath = schemaPaths[0] ?? error("schemaPath required");
  const refPaths = schemaPaths.slice(1);
  const ajv = new Ajv({ allErrors: true });
  for (const ref of refPaths) {
    try { ajv.addSchema(readVarsFile(ref) as AnySchema); }
    catch (e) { throw new Error(`${ref}: ${e instanceof Error ? e.message : e}`); }
  }
  try {
    const validate = ajv.compile<Record<string, unknown>>(readVarsFile(schemaPath) as AnySchema);
    if (!validate(data)) throw new Error(`Invalid vars:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid vars:")) throw e;
    throw new Error(`${schemaPath}: ${e instanceof Error ? e.message : e}`);
  }
}
