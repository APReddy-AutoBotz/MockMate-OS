'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tsc = require.resolve('typescript/bin/tsc');

const runTsc = (config) => {
  const result = spawnSync(process.execPath, [tsc, '-p', config], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
};

for (const dir of ['dist', 'dist-cjs']) {
  fs.rmSync(path.join(root, dir), { recursive: true, force: true });
}

runTsc('tsconfig.json');
runTsc('tsconfig.cjs.json');

fs.writeFileSync(
  path.join(root, 'dist', 'package.json'),
  `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(root, 'dist-cjs', 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  'utf8',
);

console.log('[mockmate-shared] Built ESM + CommonJS artifacts.');
