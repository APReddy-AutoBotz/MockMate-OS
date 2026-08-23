import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const runnerPath = fileURLToPath(new URL('./hosted-preview-acceptance.mjs', import.meta.url));
const blockerPath = fileURLToPath(new URL('./hosted-acceptance-network-block.mjs', import.meta.url));
const manifestPath = fileURLToPath(new URL('../config/hosted-acceptance-scenarios.example.json', import.meta.url));
const evidencePath = path.join(os.tmpdir(), `mockmate-p0-8-preflight-${process.pid}.json`);
try { fs.unlinkSync(evidencePath); } catch { /* absent is expected */ }

const result = spawnSync(
  process.execPath,
  ['--import', pathToFileURL(blockerPath).href, runnerPath],
  {
    env: {
      ...process.env,
      AUTHORIZE_HOSTED_PREVIEW_ACCEPTANCE: 'true',
      BOUNDED_TEST_DATA_CONFIRMED: 'true',
      MOCKMATE_PREVIEW_ORIGIN: 'https://mockmate-preflight.netlify.app',
      MOCKMATE_PREVIEW_TARGET_ID: 'p0-8-committed-manifest-preflight',
      MOCKMATE_SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
      EXPECTED_HEAD_SHA: 'a'.repeat(40),
      HOSTED_ACCEPTANCE_SCENARIOS_FILE: manifestPath,
      MOCKMATE_TEST_USER_A_TOKEN: 'offline-user-a-token',
      MOCKMATE_TEST_USER_B_TOKEN: 'offline-user-b-token',
      HOSTED_ACCEPTANCE_EVIDENCE_FILE: evidencePath,
      HOSTED_ACCEPTANCE_TIMEOUT_MS: '1000',
    },
    encoding: 'utf8',
  },
);

const output = `${result.stdout || ''}${result.stderr || ''}`;
assert.equal(result.status, 1, 'network-blocked committed-manifest run must stop at the first hosted request');
assert.ok(!output.includes('[HOSTED_PREVIEW_ACCEPTANCE_REFUSED]'), `committed manifest was refused before network: ${output}`);
assert.match(
  output,
  /\[HOSTED_PREVIEW_ACCEPTANCE_FAILED\] __P0_8_NETWORK_BLOCKED_AFTER_MANIFEST_PREFLIGHT__/,
  'the actual hosted runner must finish whole-manifest validation before the hard network blocker is reached',
);
assert.equal(fs.existsSync(evidencePath), false, 'network-free manifest preflight must never write hosted-success evidence');

console.log('P0-8 committed schema-v4 manifest passed the actual runner whole-manifest preflight with network hard-blocked.');
