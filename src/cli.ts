#!/usr/bin/env bun
import { init } from "./init";
import { validate } from "./validate";

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith("--") ? argv.shift()! : "init";

const flags: Record<string, string | true> = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (!a.startsWith("--")) continue;
  const k = a.slice(2);
  const next = argv[i + 1];
  if (next && !next.startsWith("--")) {
    flags[k] = next;
    i++;
  } else {
    flags[k] = true;
  }
}

const cwd = typeof flags.cwd === "string" ? flags.cwd : ".";
const force = !!flags.force;

if (cmd === "validate") {
  validate({ cwd });
} else if (cmd === "init") {
  init({ cwd, force });
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
