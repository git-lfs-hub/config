import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, test, expect, afterEach } from 'vitest';

import { configVars } from './config-vars';
import { normalizeVars, resolveDefaults, deepMerge } from './lib';

function setupCwd(): string {
  return mkdtempSync(join(tmpdir(), 'config-vars-'));
}

const FULL_INPUT = {
  org: 'Test',
  github: { org: 'test-org' },
  cloudflare: { accountId: 'acc', accountSlug: 'slug' },
};

function resolveVars(
  varsInputRaw: Record<string, unknown>,
  rawDefaults: Record<string, unknown>,
): Record<string, unknown> {
  const varsInput = normalizeVars(varsInputRaw);
  return deepMerge(resolveDefaults(rawDefaults, varsInput), varsInput);
}

describe('resolveVars', () => {
  test('user var overrides default', () => {
    const vars = resolveVars({ org: 'Mine' }, { org: 'Default' });
    expect(vars.org).toBe('Mine');
  });

  test('default fills in missing user var', () => {
    const vars = resolveVars({}, { org: 'Default' });
    expect(vars.org).toBe('Default');
  });

  test('default key already set by user is excluded from defaults rendering', () => {
    const vars = resolveVars({ org: 'Mine' }, { org: '{{org}}' });
    expect(vars.org).toBe('Mine');
  });

  test('default can reference a user var via template', () => {
    const vars = resolveVars(
      { github: { org: 'myorg' } },
      { github: { home: 'https://github.com/{{github.org}}' } },
    );
    expect((vars.github as Record<string, unknown>).home).toBe('https://github.com/myorg');
  });

  test('default can reference another default via user var', () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: 'acme' } },
      {
        cloudflare: { workerName: 'lfs-server' },
        lfs: { server: '{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev' },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe('lfs-server.acme.workers.dev');
  });

  test('default can reference another default (chained)', () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: 'acme' } },
      {
        cloudflare: { workerName: 'lfs-server' },
        lfs: { server: '{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev' },
        github: { appHome: 'https://{{lfs.server}}' },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe('lfs-server.acme.workers.dev');
    expect((vars.github as Record<string, unknown>).appHome).toBe(
      'https://lfs-server.acme.workers.dev',
    );
  });

  test('cloudflare.workerName overrides default Worker hostname', () => {
    const vars = resolveVars(
      { cloudflare: { accountSlug: 'acme', workerName: 'lfs-server-staging' } },
      {
        cloudflare: { workerName: 'lfs-server' },
        lfs: { server: '{{cloudflare.workerName}}.{{cloudflare.accountSlug}}.workers.dev' },
      },
    );
    expect((vars.lfs as Record<string, unknown>).server).toBe(
      'lfs-server-staging.acme.workers.dev',
    );
  });

  test('optional vars get empty-string defaults', () => {
    const vars = resolveVars({}, {});
    const gh = vars.github as Record<string, unknown>;
    expect(gh.org).toBe('');
    expect(gh.user).toBe('');
    expect(gh.orgs).toBe('');
  });

  test('user vars take precedence over defaults in final merge', () => {
    const vars = resolveVars({ org: 'User' }, { org: 'Default', extra: 'from-default' });
    expect(vars.org).toBe('User');
    expect(vars.extra).toBe('from-default');
  });
});

describe('configVars()', () => {
  test('reads vars.input.json when present, writes vars.json', () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, 'vars.input.json'), JSON.stringify(FULL_INPUT));
      configVars({ varsDir: cwd });
      const merged = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(merged.org).toBe('Test');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('falls back to vars.json when vars.input.json absent', () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, 'vars.json'), JSON.stringify(FULL_INPUT));
      configVars({ varsDir: cwd });
      const merged = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(merged.org).toBe('Test');
      expect(merged.github.owner).toBe('test-org');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('idempotent: second run on merged output yields same data', () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, 'vars.json'), JSON.stringify(FULL_INPUT));
      configVars({ varsDir: cwd });
      const firstPass = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      configVars({ varsDir: cwd });
      const secondPass = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(secondPass).toEqual(firstPass);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('throws when neither vars.input.json nor vars.json present', () => {
    const cwd = setupCwd();
    try {
      expect(() => configVars({ varsDir: cwd })).toThrow(/No vars\.input\.json or vars\.json/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('vars.input.{env}.json takes precedence over vars.input.json', () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, 'vars.input.json'), JSON.stringify(FULL_INPUT));
      writeFileSync(
        join(cwd, 'vars.input.staging.json'),
        JSON.stringify({ ...FULL_INPUT, org: 'Staging' }),
      );
      process.env.GLH_ENV = 'staging';
      configVars({ varsDir: cwd });
      const merged = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(merged.org).toBe('Staging');
    } finally {
      delete process.env.GLH_ENV;
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('falls back to vars.input.json when vars.input.{env}.json absent', () => {
    const cwd = setupCwd();
    try {
      writeFileSync(join(cwd, 'vars.input.json'), JSON.stringify(FULL_INPUT));
      process.env.GLH_ENV = 'staging';
      configVars({ varsDir: cwd });
      const merged = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(merged.org).toBe('Test');
    } finally {
      delete process.env.GLH_ENV;
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('configVars env resolution', () => {
  function run(cwd: string, input: Record<string, unknown>, opts: { env?: string }) {
    if (opts.env) process.env.GLH_ENV = opts.env;
    writeFileSync(join(cwd, 'vars.input.json'), JSON.stringify(input));
    configVars({ varsDir: cwd });
    return JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
  }

  function writeDotConfig(cwd: string, env: string) {
    writeFileSync(join(cwd, '.config.json'), JSON.stringify({ env }));
  }

  afterEach(() => {
    delete process.env.GLH_ENV;
  });

  test('GLH_ENV suffixes worker names + bucket', () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, FULL_INPUT, { env: 'staging' });
      expect(vars.cloudflare.workerName).toBe('lfs-server-staging');
      expect(vars.cloudflare.admin.workerName).toBe('lfs-admin-staging');
      expect(vars.s3.bucket).toBe('lfs-objects-staging');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('GLH_ENV cascades into derived lfs.server + github.appHome + adminHome', () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, FULL_INPUT, { env: 'staging' });
      expect(vars.lfs.server).toBe('lfs-server-staging.slug.workers.dev');
      expect(vars.github.appHome).toBe('https://lfs-server-staging.slug.workers.dev');
      expect(vars.github.adminHome).toBe('https://lfs-admin-staging.slug.workers.dev');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('explicit lfs.server is not suffixed', () => {
    const cwd = setupCwd();
    try {
      const vars = run(
        cwd,
        { ...FULL_INPUT, lfs: { server: 'my.custom.host' } },
        { env: 'staging' },
      );
      expect(vars.lfs.server).toBe('my.custom.host');
      expect(vars.cloudflare.workerName).toBe('lfs-server-staging');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('GLH_ENV used when set', () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_ENV = 'staging';
      const vars = run(cwd, FULL_INPUT, {});
      expect(vars.cloudflare.workerName).toBe('lfs-server-staging');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('.config.json env used when no GLH_ENV', () => {
    const cwd = setupCwd();
    try {
      writeDotConfig(cwd, 'staging');
      const vars = run(cwd, FULL_INPUT, {});
      expect(vars.cloudflare.workerName).toBe('lfs-server-staging');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('GLH_ENV overrides .config.json', () => {
    const cwd = setupCwd();
    try {
      writeDotConfig(cwd, 'fromfile');
      process.env.GLH_ENV = 'staging';
      const vars = run(cwd, FULL_INPUT, {});
      expect(vars.cloudflare.workerName).toBe('lfs-server-staging');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('env in vars file is ignored (obsolete $.env support removed)', () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, { ...FULL_INPUT, env: 'dev' }, {});
      expect(vars.cloudflare.workerName).toBe('lfs-server');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('no env = prod, no suffix', () => {
    const cwd = setupCwd();
    try {
      const vars = run(cwd, FULL_INPUT, {});
      expect(vars.cloudflare.workerName).toBe('lfs-server');
      expect(vars.s3.bucket).toBe('lfs-objects');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('renders the resolved env into vars.json', () => {
    const cwd = setupCwd();
    try {
      expect(run(cwd, FULL_INPUT, { env: 'staging' }).env).toBe('staging');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('renders an empty env for prod', () => {
    const cwd = setupCwd();
    try {
      expect(run(cwd, { ...FULL_INPUT, env: 'dev' }, {}).env).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('configVars GLH_VARS_JSON', () => {
  afterEach(() => {
    delete process.env.GLH_VARS_JSON;
  });

  test('reads vars from GLH_VARS_JSON when set', () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_VARS_JSON = JSON.stringify(FULL_INPUT);
      configVars({ varsDir: cwd });
      const vars = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(vars.org).toBe('Test');
      expect(vars.github.owner).toBe('test-org');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('GLH_VARS_JSON takes precedence over vars.input.json', () => {
    const cwd = setupCwd();
    try {
      writeFileSync(
        join(cwd, 'vars.input.json'),
        JSON.stringify({ ...FULL_INPUT, org: 'FromFile' }),
      );
      process.env.GLH_VARS_JSON = JSON.stringify({ ...FULL_INPUT, org: 'FromEnv' });
      configVars({ varsDir: cwd });
      const vars = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(vars.org).toBe('FromEnv');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('throws when no GLH_VARS_JSON and no vars file', () => {
    const cwd = setupCwd();
    try {
      expect(() => configVars({ varsDir: cwd })).toThrow(
        /No vars\.input\.json or vars\.json.*GLH_VARS_JSON unset/,
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('combines with GLH_ENV staging', () => {
    const cwd = setupCwd();
    try {
      process.env.GLH_VARS_JSON = JSON.stringify(FULL_INPUT);
      process.env.GLH_ENV = 'staging';
      configVars({ varsDir: cwd });
      const vars = JSON.parse(readFileSync(join(cwd, 'vars.json'), 'utf8'));
      expect(vars.cloudflare.workerName).toBe('lfs-server-staging');
    } finally {
      delete process.env.GLH_ENV;
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
