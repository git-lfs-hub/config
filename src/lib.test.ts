import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, test, expect, vi, afterAll, afterEach } from 'vitest';

import {
  deepMerge,
  error,
  loadInputVars,
  loadDefaultVars,
  normalizeValue,
  normalizeVars,
  readVarsFile,
  renderTemplate,
  renderTemplateFile,
  validateSchema,
  writeJsonFile,
  writeUtf8File,
  optionalVars,
} from './lib';

describe('normalize', () => {
  test('joins array with spaces', () => {
    expect(normalizeValue(['alice', 'bob'])).toBe('alice bob');
  });

  test('single-element array produces bare value', () => {
    expect(normalizeValue(['alice'])).toBe('alice');
  });

  test('empty array produces empty string', () => {
    expect(normalizeValue([])).toBe('');
  });

  test('passes string through unchanged', () => {
    expect(normalizeValue('alice bob')).toBe('alice bob');
  });

  test('passes empty string through unchanged', () => {
    expect(normalizeValue('')).toBe('');
  });

  test('passes non-string primitives through', () => {
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue(null)).toBe(null);
  });

  test('recurses into plain objects', () => {
    expect(normalizeValue({ users: ['alice', 'bob'], org: 'myorg' })).toEqual({
      users: 'alice bob',
      org: 'myorg',
    });
  });
});

describe('buildVars', () => {
  test('provides empty-string defaults for optional vars', () => {
    const result = normalizeVars({
      org: 'Test',
      cloudflare: { accountSlug: 'slug', accountId: 'id' },
    });
    const gh = result.github as Record<string, unknown>;
    expect(gh.org).toBe('');
    expect(gh.user).toBe('');
    expect(gh.orgs).toBe('');
  });

  test('vars.json values override defaults', () => {
    const result = normalizeVars({ github: { org: 'myorg' } });
    expect((result.github as Record<string, unknown>).org).toBe('myorg');
  });

  test('computes owner from user (user mode)', () => {
    const result = normalizeVars({ github: { user: 'pasha' } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.owner).toBe('pasha');
  });

  test('computes owner from org (org mode)', () => {
    const result = normalizeVars({ github: { org: 'myorg' } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.owner).toBe('myorg');
  });

  test('computes owner from first orgs entry when org absent', () => {
    const result = normalizeVars({ github: { orgs: 'org1 org2' } });
    const gh = result.github as Record<string, unknown>;
    expect(gh.owner).toBe('org1');
    expect(gh.org).toBe('org1');
  });

  test('user takes priority over org for owner', () => {
    const result = normalizeVars({ github: { user: 'pasha', org: 'myorg' } });
    expect((result.github as Record<string, unknown>).owner).toBe('pasha');
  });

  test('owner is empty string when neither user nor org set', () => {
    const result = normalizeVars({});
    expect((result.github as Record<string, unknown>).owner).toBe('');
  });

  test('string list values pass through unchanged', () => {
    const result = normalizeVars({ github: { orgs: 'foo bar,baz' } });
    expect((result.github as Record<string, unknown>).orgs).toBe('foo bar,baz');
  });

  test('preserves non-list keys from vars.json', () => {
    const result = normalizeVars({ org: 'Acme', cloudflare: { accountSlug: 'acme-123' } });
    expect(result.org).toBe('Acme');
    expect(result.cloudflare).toEqual({ accountSlug: 'acme-123' });
  });

  test('all optionalVars keys are present even when raw is empty', () => {
    const result = normalizeVars({});
    for (const key of Object.keys(optionalVars)) {
      expect(key in result).toBe(true);
    }
  });
});

describe('renderTemplate', () => {
  test('substitutes a simple placeholder', () => {
    expect(renderTemplate('hello {{name}}', { name: 'world' })).toBe('hello world');
  });

  test('substitutes multiple placeholders', () => {
    const out = renderTemplate('{{a}} and {{b}}', { a: 'foo', b: 'bar' });
    expect(out).toBe('foo and bar');
  });

  test('does not HTML-escape values (noEscape)', () => {
    const out = renderTemplate('{{val}}', { val: 'a & b' });
    expect(out).toBe('a & b');
  });

  test('throws in strict mode when a placeholder is missing', () => {
    expect(() => renderTemplate('{{missing}}', {})).toThrow();
  });

  test('renders empty string for an empty-string var', () => {
    expect(renderTemplate('"{{github.org}}"', { github: { org: '' } })).toBe('""');
  });

  test('full wrangler-style snippet renders correctly', () => {
    const template = `"GITHUB_ORG": "{{github.org}}",\n"GITHUB_USER": "{{github.user}}"`;
    const out = renderTemplate(template, { github: { org: 'myorg', user: '' } });
    expect(out).toBe(`"GITHUB_ORG": "myorg",\n"GITHUB_USER": ""`);
  });
});

describe('writeUtf8File', () => {
  const dir = mkdtempSync(join(tmpdir(), 'writeUtf8File-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  afterEach(() => vi.restoreAllMocks());

  test('creates file when missing', () => {
    const p = join(dir, 'new.txt');
    writeUtf8File(dir, 'new.txt', 'hello');
    expect(readFileSync(p, 'utf8')).toBe('hello');
  });

  test('overwrites when content differs', () => {
    const p = join(dir, 'diff.txt');
    writeFileSync(p, 'old', 'utf8');
    writeUtf8File(dir, 'diff.txt', 'new');
    expect(readFileSync(p, 'utf8')).toBe('new');
  });

  test('skips write when content matches existing', () => {
    const p = join(dir, 'same.txt');
    writeFileSync(p, 'hello', 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeUtf8File(dir, 'same.txt', 'hello');
    expect(log).not.toHaveBeenCalled();
  });

  test('logs when write occurs', () => {
    const p = join(dir, 'logged.txt');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeUtf8File(dir, 'logged.txt', 'hello');
    expect(log).toHaveBeenCalledWith(`Wrote ${p}`);
  });
});

describe('renderTemplate error reporting', () => {
  test('includes context entries in error message', () => {
    try {
      renderTemplate('{{missing}}', {}, { template: 'foo.hbs', vars: 'bar.json' });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('template: foo.hbs');
      expect(msg).toContain('vars: bar.json');
    }
  });

  test('includes line/col pointer when error has position', () => {
    const source = '{\n  "key": "{{missing}}"\n}';
    try {
      renderTemplate(source, {});
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('line ');
      expect(msg).toContain('^');
    }
  });

  test('omits context block when context is undefined', () => {
    try {
      renderTemplate('{{missing}}', {});
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('template:');
    }
  });

  test('skips undefined context values', () => {
    try {
      renderTemplate('{{missing}}', {}, { template: 'a.hbs', vars: undefined });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('template: a.hbs');
      expect(msg).toContain('vars: undefined');
    }
  });
});

describe('validateSchema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'validate-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('passes valid data', () => {
    const schema = join(dir, 'valid-schema.json');
    writeFileSync(
      schema,
      JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' } },
      }),
    );
    expect(() => validateSchema(dir, { name: 'test' }, 'valid-schema.json')).not.toThrow();
  });

  test('throws on invalid data', () => {
    const schema = join(dir, 'strict-schema.json');
    writeFileSync(
      schema,
      JSON.stringify({
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      }),
    );
    expect(() => validateSchema(dir, {}, 'strict-schema.json')).toThrow('Invalid vars:');
  });

  test('throws on type mismatch', () => {
    const schema = join(dir, 'type-schema.json');
    writeFileSync(
      schema,
      JSON.stringify({
        type: 'object',
        properties: { age: { type: 'number' } },
      }),
    );
    expect(() => validateSchema(dir, { age: 'not-a-number' }, 'type-schema.json')).toThrow(
      'Invalid vars:',
    );
  });

  test('throws when ref schema file is unreadable', () => {
    const schema = join(dir, 'main.json');
    writeFileSync(schema, JSON.stringify({ type: 'object' }));
    expect(() => validateSchema(dir, {}, 'main.json', 'nonexistent-ref.json')).toThrow(
      'nonexistent-ref.json',
    );
  });

  test('throws when ref schema is invalid JSON Schema', () => {
    const schema = join(dir, 'main2.json');
    const badRef = join(dir, 'bad-ref.json');
    writeFileSync(schema, JSON.stringify({ type: 'object' }));
    writeFileSync(badRef, 'NOT JSON');
    expect(() => validateSchema(dir, {}, 'main2.json', 'bad-ref.json')).toThrow('bad-ref.json');
  });

  test('throws when main schema file is unreadable', () => {
    expect(() => validateSchema(dir, {}, 'no-such-schema.json')).toThrow('no-such-schema.json');
  });

  test('throws when no schema path provided', () => {
    expect(() => validateSchema(dir, {})).toThrow('schemaPath required');
  });

  test('uses ref schemas for validation', () => {
    const ref = join(dir, 'defs.json');
    writeFileSync(
      ref,
      JSON.stringify({
        $id: 'https://example.com/defs.json',
        definitions: { posInt: { type: 'integer', minimum: 1 } },
      }),
    );
    const schema = join(dir, 'with-ref.json');
    writeFileSync(
      schema,
      JSON.stringify({
        type: 'object',
        properties: {
          count: { $ref: 'https://example.com/defs.json#/definitions/posInt' },
        },
      }),
    );
    expect(() => validateSchema(dir, { count: 5 }, 'with-ref.json', 'defs.json')).not.toThrow();
    expect(() => validateSchema(dir, { count: -1 }, 'with-ref.json', 'defs.json')).toThrow(
      'Invalid vars:',
    );
  });
});

describe('deepMerge', () => {
  test('override non-object replaces base non-object', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test('override adds new keys', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  test('override replaces object with non-object', () => {
    expect(deepMerge({ a: { x: 1 } }, { a: 'flat' })).toEqual({ a: 'flat' });
  });

  test('override replaces non-object with object', () => {
    expect(deepMerge({ a: 'flat' }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });
});

describe('error', () => {
  test('throws with message', () => {
    expect(() => error('boom')).toThrow('boom');
  });
});

describe('readVarsFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'readVars-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('reads and parses JSON', () => {
    const p = join(dir, 'data.json');
    writeFileSync(p, '{"key":"val"}');
    expect(readVarsFile(dir, 'data.json')).toEqual({ key: 'val' });
  });
});

describe('writeJsonFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'writeJson-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('writes pretty JSON with trailing newline', () => {
    const p = join(dir, 'out.json');
    writeJsonFile(dir, 'out.json', { a: 1 });
    expect(readFileSync(p, 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});

describe('renderTemplateFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'renderFile-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('reads template and renders', () => {
    const tpl = join(dir, 'tpl.txt');
    writeFileSync(tpl, 'Hello {{name}}!');
    expect(renderTemplateFile(dir, 'tpl.txt', { name: 'world' })).toBe('Hello world!');
  });
});

describe('loadInputVars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadInput-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('loads and normalizes vars from file', () => {
    const p = join(dir, 'input.json');
    writeFileSync(p, JSON.stringify({ github: { orgs: ['a', 'b'] } }));
    const result = loadInputVars(p);
    expect((result.github as Record<string, unknown>).orgs).toBe('a b');
  });
});

describe('loadDefaultVars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadDefaults-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('loads defaults and resolves templates against input', () => {
    const defaults = join(dir, 'defaults.json');
    writeFileSync(defaults, JSON.stringify({ greeting: 'Hello {{name}}' }));
    const result = loadDefaultVars(dir, 'defaults.json', { name: 'world' });
    expect(result.greeting).toBe('Hello world');
  });
});

describe('end-to-end: buildVars + renderTemplate', () => {
  test('github.owner renders correctly in template', () => {
    const vars = normalizeVars({ github: { org: 'myorg' } });
    const out = renderTemplate('"home": "https://github.com/{{github.owner}}"', vars);
    expect(out).toBe('"home": "https://github.com/myorg"');
  });

  test('missing optional var renders as empty string', () => {
    const vars = normalizeVars({ org: 'Test' });
    const out = renderTemplate('"GITHUB_ORGS": "{{github.orgs}}"', vars);
    expect(out).toBe('"GITHUB_ORGS": ""');
  });

  test('vars.json string value passes through to template', () => {
    const vars = normalizeVars({ github: { org: 'myorg' } });
    const out = renderTemplate('"GITHUB_ORG": "{{github.org}}"', vars);
    expect(out).toBe('"GITHUB_ORG": "myorg"');
  });
});
