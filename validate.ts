import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readVarsFile, validateSchema } from "./lib";

const pkg = dirname(fileURLToPath(import.meta.url));

export function validate({ cwd }: { cwd: string }): void {
  const ws = resolve(cwd);
  const vars = readVarsFile(resolve(ws, "vars.json"));
  validateSchema(vars, resolve(pkg, "vars.schema.json"));
  console.log(`OK: ${resolve(ws, "vars.json")}`);
}
