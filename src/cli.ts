#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { init } from "./init";
import { initTestWorker } from "./init-test-worker";
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

if (cmd === "validate") {
  validate({ cwd });
} else if (cmd === "init") {
  init({ cwd });
} else if (cmd === "init-test-worker") {
  const templateDir = positionals[1];
  const testDir = positionals[2];
  if (!templateDir || !testDir) {
    console.error("usage: init-test-worker <template-dir> <test-dir>");
    process.exit(2);
  }
  initTestWorker({ templateDir, testDir });
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}
