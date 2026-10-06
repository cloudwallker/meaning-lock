import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const cliPath = join(projectRoot, 'bin', 'meaning-lock.mjs');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'meaning-lock-cli-'));
let fixtureNumber = 0;
let original: string;
let revised: string;

function run(args: string[], executable = cliPath) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd: fixtureRoot, encoding: 'utf8', timeout: 15_000,
  });
}

function assertError(args: string[], diagnostic: RegExp) {
  const result = run(args);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toMatch(diagnostic);
  expect(result.stderr).not.toMatch(/\n\s+at |ERR_MODULE_NOT_FOUND/);
}

function assertInputsProtected(output: string) {
  const beforeOriginal = readFileSync(original);
  const beforeRevised = readFileSync(revised);
  const result = run([original, revised, '--output', output]);
  expect.soft(result.status).toBe(2);
  expect.soft(result.stdout).toBe('');
  expect.soft(result.stderr).toMatch(/output.*input|input.*output|overwrite/i);
  expect.soft(readFileSync(original)).toEqual(beforeOriginal);
  expect.soft(readFileSync(revised)).toEqual(beforeRevised);
}

beforeAll(async () => {
  // CI runs tests before the production build; compile the actual engine here.
  await build({ root: projectRoot, configFile: join(projectRoot, 'vite.core.config.ts'), logLevel: 'silent' });
}, 30_000);

beforeEach(() => {
  fixtureNumber += 1;
  original = join(fixtureRoot, `original-${fixtureNumber}.md`);
  revised = join(fixtureRoot, `revised-${fixtureNumber}.md`);
  writeFileSync(original, 'Revenue was 2.3 billion dollars. The launch may happen.\n');
  writeFileSync(revised, 'Revenue was 23 billion dollars. The launch will happen.\n');
});

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

describe('Meaning Lock command line', () => {
  it('shows help successfully without an engine bundle', () => {
    const isolatedBin = join(fixtureRoot, 'isolated-bin');
    mkdirSync(isolatedBin);
    const isolatedCli = join(isolatedBin, 'standalone.mjs');
    // The isolated copy has no dist/core.js beside it.
    if (existsSync(cliPath)) copyFileSync(cliPath, isolatedCli);
    const result = run(['--help'], isolatedCli);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('original.md revised.md');
    expect(result.stdout).toContain('--fail-on-change');
    expect(result.stderr).toBe('');
  });

  it('returns JSON to stdout by default with original text and pending findings', () => {
    const result = run([original, revised]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report.original).toBe('Revenue was 2.3 billion dollars. The launch may happen.\n');
    expect(report.revised).toBe('Revenue was 23 billion dollars. The launch will happen.\n');
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'number', reviewed: false })]));
    expect(report.reviewedIds).toEqual([]);
  });

  it('uses English for HTML unless a language is supplied', () => {
    const result = run([original, revised, '--format', 'html']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('lang="en"');
    expect(result.stdout).toContain('Original');
  });

  it('renders Chinese HTML and keeps supplied markup inert', () => {
    writeFileSync(original, '<script>print(1)</script>访客有3人。');
    writeFileSync(revised, '<script>print(1)</script>访客有5人。');
    const result = run(['--lang', 'zh', original, revised, '--format', 'html']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('lang="zh"');
    expect(result.stdout).toContain('&lt;script&gt;');
    expect(result.stdout).not.toMatch(/<script\b/i);
  });

  it('writes a UTF-8 report to the chosen file instead of stdout', () => {
    const output = join(fixtureRoot, '报告.json');
    const result = run([original, revised, '--output', output]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(JSON.parse(readFileSync(output, 'utf8')).findings.length).toBeGreaterThan(0);
  });

  it.each(['original', 'revised'])('refuses output at the %s input path without changing input bytes', (side) => {
    assertInputsProtected(side === 'original' ? original : revised);
  });

  it('refuses a normalized relative alias of an input path', () => {
    const nested = join(fixtureRoot, 'nested');
    mkdirSync(nested);
    assertInputsProtected(`${nested}${sep}..${sep}${basename(original)}`);
  });

  it.each(['original', 'revised'])('refuses a hard link to the %s input without changing input bytes', (side) => {
    const alias = join(fixtureRoot, `hard-link-${fixtureNumber}.md`);
    linkSync(side === 'original' ? original : revised, alias);
    assertInputsProtected(alias);
  });

  it('refuses a symbolic link to an input without changing input bytes', (context) => {
    const alias = join(fixtureRoot, `symbolic-link-${fixtureNumber}.md`);
    try { symlinkSync(original, alias, 'file'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM' || (error as NodeJS.ErrnoException).code === 'EACCES') {
        context.skip('This Windows account cannot create symbolic links; hard-link protection is tested separately.');
        return;
      }
      throw error;
    }
    assertInputsProtected(alias);
  });

  const windowsTest = process.platform === 'win32' ? it : it.skip;
  windowsTest('refuses a case-insensitive Windows alias without changing input bytes', () => {
    assertInputsProtected(original.toUpperCase());
  });

  it('returns exit 1 with complete stdout when the change gate finds a change', () => {
    const result = run([original, revised, '--fail-on-change']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).findings.length).toBeGreaterThan(0);
    expect(result.stderr).toBe('');
  });

  it('finishes writing the HTML report before returning exit 1', () => {
    const output = join(fixtureRoot, 'changed.html');
    const result = run([original, revised, '--format', 'html', '--output', output, '--fail-on-change']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(readFileSync(output, 'utf8')).toContain('lang="en"');
  });

  it('returns exit 0 at the change gate for identical inputs', () => {
    writeFileSync(revised, readFileSync(original));
    const result = run([original, revised, '--fail-on-change']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings).toEqual([]);
  });

  it.each([
    [[], /two|original|Usage/i],
    [['one.md'], /two|original|Usage/i],
    [['one.md', 'two.md', 'three.md'], /two|arguments|Usage/i],
    [['--unknown'], /unknown/i],
    [['--format'], /value|format/i],
    [['--format', 'pdf'], /format|json|html/i],
    [['--lang', 'fr'], /lang|zh|en/i],
    [['--output'], /value|output/i],
    [['--format', 'json', '--format', 'html'], /duplicate|once|repeated/i],
    [['--fail-on-change', '--fail-on-change'], /duplicate|once|repeated/i],
    [['--help', '--unknown'], /unknown|help/i],
  ])('rejects malformed arguments %j', (args, diagnostic) => assertError(args as string[], diagnostic as RegExp));

  it('accepts filenames beginning with a dash after the option terminator', () => {
    writeFileSync(join(fixtureRoot, '-original.md'), 'There are 3 visitors.');
    writeFileSync(join(fixtureRoot, '-revised.md'), 'There are 3 visitors.');
    const result = run(['--', '-original.md', '-revised.md']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings).toEqual([]);
  });

  it('rejects a missing input as an operational error', () => {
    assertError([join(fixtureRoot, 'absent.md'), revised], /read|open|exist|ENOENT/i);
  });

  it('rejects a directory instead of reading it as text', () => {
    assertError([fixtureRoot, revised], /regular file|file/i);
  });

  it('rejects malformed UTF-8 instead of silently replacing characters', () => {
    writeFileSync(original, Uint8Array.from([0x61, 0xc3, 0x28]));
    assertError([original, revised], /UTF-8/i);
  });

  it('rejects an input over 200000 bytes before comparison', () => {
    writeFileSync(original, '文'.repeat(66_667));
    assertError([original, revised], /200000|200,000|bytes/i);
  });

  it('rejects more than 50000 decoded characters even below the byte limit', () => {
    writeFileSync(original, 'a'.repeat(50_001));
    assertError([original, revised], /50000|50,000/);
  });

  it('accepts exactly 50000 decoded characters', () => {
    writeFileSync(original, '文'.repeat(50_000));
    writeFileSync(revised, '文'.repeat(50_000));
    const result = run([original, revised]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings).toEqual([]);
  });

  it('reports an unwritable output path with exit 2 and no partial stdout', () => {
    assertError([original, revised, '--output', fixtureRoot], /write|output|directory|EISDIR/i);
  });
});
