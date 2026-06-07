#!/usr/bin/env bun
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { configTestWorker } from './config-test-worker';
import { configVars } from './config-vars';
import { configWorker } from './config-worker';
import { validate } from './validate';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    env: { type: 'string' },
  },
  allowPositionals: true,
});

const cmd = positionals[0];
const dir = resolve(positionals[1] ?? '.');

switch (cmd) {
  case 'vars':
    configVars({ varsDir: dir, env: values.env });
    break;
  case 'worker':
    configWorker({ workerDir: dir });
    break;
  case 'test-worker': {
    const templateDir = positionals[1];
    const testDir = positionals[2];
    if (!templateDir || !testDir) {
      console.error('usage: test-worker <template-dir> <test-dir>');
      process.exit(2);
    }
    configTestWorker({ templateDir, testDir });
    break;
  }
  case 'validate':
    validate({ cwd: dir });
    break;
  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(2);
}
