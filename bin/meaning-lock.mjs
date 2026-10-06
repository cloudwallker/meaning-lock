#!/usr/bin/env node
import { open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

const MAX_BYTES = 200_000;
const USAGE = `Usage: node bin/meaning-lock.mjs original.md revised.md [options]

Compare factual details in two local UTF-8 text or Markdown files.

Options:
  --format json|html   Report format (default: json)
  --lang zh|en         HTML report language (default: en)
  --output path        Write the report to a file instead of stdout
  --fail-on-change     Exit 1 when the report contains findings
  --help               Show this help without loading the engine

Use -- before filenames that begin with a dash.
Exit codes: 0 completed, 1 findings with --fail-on-change, 2 error.
Limits: 200000 bytes per input; engine limit: 50000 characters.
`;

class CliError extends Error {}

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const options = { format: 'json', lang: 'en', output: undefined, failOnChange: false };
  const paths = [];
  const seen = new Set();
  let terminated = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!terminated && arg === '--') { terminated = true; continue; }
    if (!terminated && arg.startsWith('-')) {
      if (arg === '--help') throw new CliError('--help must be used alone.');
      if (!['--format', '--lang', '--output', '--fail-on-change'].includes(arg)) {
        throw new CliError(`Unknown option: ${arg}. Use --help for usage.`);
      }
      if (seen.has(arg)) throw new CliError(`Duplicate option: ${arg}. Supply it only once.`);
      seen.add(arg);
      if (arg === '--fail-on-change') { options.failOnChange = true; continue; }
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--') || !value.trim()) {
        throw new CliError(`${arg} requires a value.`);
      }
      i += 1;
      if (arg === '--format') {
        if (value !== 'json' && value !== 'html') throw new CliError('--format must be json or html.');
        options.format = value;
      } else if (arg === '--lang') {
        if (value !== 'zh' && value !== 'en') throw new CliError('--lang must be zh or en.');
        options.lang = value;
      } else options.output = value;
    } else paths.push(arg);
  }
  if (paths.length !== 2) throw new CliError('Provide exactly two input files: original.md revised.md. Use --help for usage.');
  return { ...options, paths };
}

function errorCode(error) {
  return error && typeof error === 'object' && typeof error.code === 'string' ? ` (${error.code})` : '';
}

async function readText(path, label) {
  let file;
  try {
    file = await open(path, 'r');
    const stats = await file.stat({ bigint: true });
    if (!stats.isFile()) throw new CliError(`The ${label} input must be a regular file.`);
    if (stats.size > MAX_BYTES) throw new CliError(`The ${label} input exceeds 200000 bytes.`);
    // Read only a bounded buffer even if a file grows after the size check.
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_BYTES) throw new CliError(`The ${label} input exceeds 200000 bytes.`);
    try {
      return {
        text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)),
        dev: stats.dev, ino: stats.ino,
      };
    }
    catch { throw new CliError(`The ${label} input is not valid UTF-8.`); }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot read the ${label} input${errorCode(error)}.`);
  } finally {
    if (file) await file.close();
  }
}

function normalizedPath(path) {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

async function writeReport(path, inputPaths, inputs, content) {
  let file;
  try {
    const outputPath = normalizedPath(path);
    if (inputPaths.some((input) => normalizedPath(input) === outputPath)) {
      throw new CliError('The output must not overwrite either input file.');
    }
    const canonicalInputs = await Promise.all(inputPaths.map((input) => realpath(input)));
    let canonicalOutput;
    try { canonicalOutput = await realpath(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (canonicalOutput && canonicalInputs.some((input) => normalizedPath(input) === normalizedPath(canonicalOutput))) {
      throw new CliError('The output must not overwrite either input file.');
    }
    // Neither mode truncates: inspect the actual handle before writing,
    // including hard links and aliases changed after realpath(). Exclusive
    // creation also refuses a destination introduced during the initial check.
    try { file = await open(path, 'r+'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      file = await open(path, 'wx+');
    }
    const outputStat = await file.stat({ bigint: true });
    if (inputs.some((input) => input.dev === outputStat.dev && input.ino === outputStat.ino)) {
      throw new CliError('The output must not overwrite either input file.');
    }
    if (!outputStat.isFile()) throw new CliError('The output must be a regular file.');
    await file.truncate(0);
    await file.writeFile(content, 'utf8');
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Cannot write the output report${errorCode(error)}.`);
  } finally {
    if (file) await file.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(USAGE); return 0; }
  const [original, revised] = await Promise.all([
    readText(options.paths[0], 'original'), readText(options.paths[1], 'revised'),
  ]);
  let engine;
  try { engine = await import('../dist/core.js'); }
  catch { throw new CliError('Cannot load the comparison engine. Run npm run build first.'); }
  const report = engine.compareText(original.text, revised.text);
  const output = options.format === 'html'
    ? engine.renderReportHtml(report, [], options.lang)
    : engine.serializeReport(report, []);
  if (options.output !== undefined) {
    await writeReport(options.output, options.paths, [original, revised], `${output}\n`);
  } else {
    await new Promise((resolve, reject) => {
      process.stdout.write(`${output}\n`, (error) => error ? reject(new CliError('Cannot write the report to stdout.')) : resolve());
    });
  }
  return options.failOnChange && report.findings.length > 0 ? 1 : 0;
}

try { process.exitCode = await main(); }
catch (error) {
  process.stderr.write(`Meaning Lock: ${error instanceof Error ? error.message : 'Command failed.'}\n`);
  process.exitCode = 2;
}
