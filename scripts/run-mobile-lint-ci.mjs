import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const mobileRoot = path.join(repoRoot, 'mobile');
const eslintBin = path.join(
  mobileRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
);

const run = spawnSync(
  eslintBin,
  ['src', '--format', 'json', '--no-cache'],
  {
    cwd: mobileRoot,
    encoding: 'utf8',
    env: process.env,
  },
);

if (run.error) {
  console.error(`Unable to start mobile ESLint: ${run.error.message}`);
  process.exit(1);
}

let results;
try {
  results = JSON.parse(run.stdout || '[]');
} catch (error) {
  console.error('Mobile ESLint did not return parseable JSON output.');
  if (run.stdout) console.error(run.stdout);
  if (run.stderr) console.error(run.stderr);
  process.exit(run.status || 1);
}

let errors = 0;
let warnings = 0;
const escape = (value) => String(value ?? '')
  .replace(/%/g, '%25')
  .replace(/\r/g, '%0D')
  .replace(/\n/g, '%0A');

for (const result of results) {
  const relative = path.relative(repoRoot, result.filePath).replace(/\\/g, '/');
  for (const message of result.messages || []) {
    const severity = message.severity === 2 ? 'error' : 'warning';
    if (message.severity === 2) errors += 1;
    else if (message.severity === 1) warnings += 1;

    const attrs = [
      `file=${escape(relative)}`,
      `line=${message.line || 1}`,
      `col=${message.column || 1}`,
    ];
    if (message.endLine) attrs.push(`endLine=${message.endLine}`);
    if (message.endColumn) attrs.push(`endColumn=${message.endColumn}`);
    const rule = message.ruleId ? `[${message.ruleId}] ` : '';
    console.log(`::${severity} ${attrs.join(',')}::${escape(`${rule}${message.message}`)}`);
  }
}

console.log(`Mobile ESLint: ${errors} error(s), ${warnings} warning(s).`);
if (run.stderr) console.error(run.stderr);
process.exit(errors > 0 ? 1 : 0);
