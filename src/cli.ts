#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { init } from "./init";
import { initTestWorker } from "./init-test-worker";
import { validate } from "./validate";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    // Monorepo workspace root: templates under server/ + admin/, output at the root.
    ws: { type: "string", default: "." },
    env: { type: "string" },
    // Standalone single-repo render of one Worker. Mutually exclusive; either one
    // makes that dir the vars + output root (no ws-derived layout).
    server: { type: "string" },
    admin: { type: "string" },
  },
  allowPositionals: true,
});

const cmd = positionals[0] ?? "init";

if (cmd === "validate") {
  validate({ cwd: resolve(values.ws) });
} else if (cmd === "init") {
  if (values.server !== undefined && values.admin !== undefined) {
    console.error("--server and --admin are mutually exclusive");
    process.exit(2);
  }
  if (values.server !== undefined) {
    const dir = resolve(values.server);
    init({ varsDir: dir, outDir: dir, serverDir: dir, env: values.env });
  } else if (values.admin !== undefined) {
    const dir = resolve(values.admin);
    init({ varsDir: dir, outDir: dir, adminDir: dir, env: values.env });
  } else {
    const ws = resolve(values.ws);
    init({ varsDir: ws, outDir: ws, serverDir: join(ws, "server"), adminDir: join(ws, "admin"), env: values.env });
  }
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
