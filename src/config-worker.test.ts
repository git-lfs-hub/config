import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, test, expect } from 'vitest';

import { configVars } from './config-vars';
import { configWorker } from './config-worker';

const FULL_INPUT = {
  org: 'Test',
  github: { org: 'test-org' },
  cloudflare: { accountId: 'acc', accountSlug: 'slug' },
};

/** A worker dir with its templates + a merged vars.json (as configVars/cli.sh produce). */
function setupWorker({
  env,
  githubApp = true,
  slackApp = false,
}: { env?: string; githubApp?: boolean; slackApp?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'config-worker-'));
  writeFileSync(
    join(dir, 'wrangler.template.jsonc'),
    `{ "name": "{{cloudflare.workerName}}", "org": "{{org}}" }\n`,
  );
  if (githubApp) writeFileSync(join(dir, 'github-app.template.md'), `# {{org}}\n`);
  if (slackApp) writeFileSync(join(dir, 'slack-app.template.md'), `# {{org}} Slack\n`);
  writeFileSync(join(dir, 'vars.input.json'), JSON.stringify(FULL_INPUT));
  if (env) process.env.GLH_ENV = env;
  try {
    configVars({ varsDir: dir });
  } finally {
    delete process.env.GLH_ENV;
  }
  return dir;
}

describe('configWorker()', () => {
  test('renders wrangler.jsonc + github-app.md from vars.json', () => {
    const dir = setupWorker();
    try {
      configWorker({ workerDir: dir });
      expect(existsSync(join(dir, 'wrangler.jsonc'))).toBe(true);
      expect(existsSync(join(dir, 'github-app.md'))).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')).org).toBe('Test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('renders slack-app.md when slack-app.template.md is present (admin)', () => {
    const dir = setupWorker({ slackApp: true });
    try {
      configWorker({ workerDir: dir });
      expect(readFileSync(join(dir, 'slack-app.md'), 'utf8')).toBe('# Test Slack\n');
      expect(existsSync(join(dir, 'github-app.md'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skips github-app.md when no github-app.template.md (admin)', () => {
    const dir = setupWorker({ githubApp: false });
    try {
      configWorker({ workerDir: dir });
      expect(existsSync(join(dir, 'wrangler.jsonc'))).toBe(true);
      expect(existsSync(join(dir, 'github-app.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recovers env from vars.json.env and suffixes the worker name', () => {
    const dir = setupWorker({ env: 'staging' });
    try {
      configWorker({ workerDir: dir });
      expect(JSON.parse(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')).name).toBe(
        'lfs-server-staging',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
