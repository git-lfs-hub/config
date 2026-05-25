import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readVarsFile, validateSchema } from "./lib";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function validate({ cwd }: { cwd: string }): void {
  const ws = resolve(cwd);
  const vars = readVarsFile(ws, "vars.json");
  validateSchema(pkg, vars, "vars.schema.json");
  console.log(`OK: ${resolve(ws, "vars.json")}`);
}
