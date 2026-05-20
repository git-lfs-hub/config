#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { init } from "./init";
import { validate } from "./validate";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    cwd: { type: "string", default: "." },
    force: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const cmd = positionals[0] ?? "init";
const cwd = values.cwd;
const force = values.force;

if (cmd === "validate") {
  validate({ cwd });
} else if (cmd === "init") {
  init({ cwd, force });
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
