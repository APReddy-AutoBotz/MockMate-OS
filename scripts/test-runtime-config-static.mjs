import fs from 'fs';
import path from 'path';

console.log('[Runtime Config Static Check] 1. Scanning source files for dynamic import.meta / process.env hacks...');

const filesToScan = [
  'services/runtimeConfig.ts',
  'services/supabaseClient.ts',
  'services/apiClient.ts',
  'services/apiBase.ts',
  'vite.config.ts'
];

let errors = 0;
for (const relPath of filesToScan) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) continue;
  const content = fs.readFileSync(fullPath, 'utf8');

  if (content.includes("new Function('return import.meta.env')")) {
    console.error(`[FAIL] Found dynamic Function import.meta hack in ${relPath}`);
    errors++;
  }
  if (content.includes('process.env[')) {
    console.error(`[FAIL] Found dynamic process.env[ string lookup in ${relPath}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`[Runtime Config Static Check] FAILED with ${errors} dynamic lookup error(s).`);
  process.exit(1);
}

console.log('[Runtime Config Static Check] PASSED 100% (No dynamic import.meta hacks found).');
