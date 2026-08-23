import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = path.join(repositoryRoot, 'mobile');
const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'mockmate-mobile-web-export-'));
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const result = spawnSync(
    npmExecutable,
    ['exec', '--', 'expo', 'export', '--platform', 'web', '--output-dir', outputDirectory],
    {
      cwd: mobileRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        EXPO_PUBLIC_RUNTIME_MODE: 'preview',
        EXPO_PUBLIC_ENABLE_MOCK_AUTH: 'false',
        EXPO_PUBLIC_SUPABASE_URL: 'https://cysnsoeonyhcshjjpezk.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'bundle-verification-public-key',
        EXPO_PUBLIC_API_URL: 'https://deploy-preview-21--mockmate-os-preview.netlify.app',
      },
    },
  );

  assert.equal(result.status, 0, 'Expo web production export must succeed');
  console.log('Mobile Expo web production export passed.');
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
