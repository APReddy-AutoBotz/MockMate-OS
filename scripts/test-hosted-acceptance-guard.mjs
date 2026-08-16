import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const harness = fs.readFileSync(new URL('./hosted-preview-acceptance.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/production-readiness.yml', import.meta.url), 'utf8');

for (const required of [
  'AUTHORIZE_HOSTED_PREVIEW_ACCEPTANCE',
  'BOUNDED_TEST_DATA_CONFIRMED',
  'MOCKMATE_PREVIEW_ORIGIN',
  'MOCKMATE_PREVIEW_TARGET_ID',
  'MOCKMATE_SUPABASE_PROJECT_REF',
  'EXPECTED_HEAD_SHA',
  'HOSTED_ACCEPTANCE_SCENARIOS_FILE',
  'MOCKMATE_TEST_USER_A_TOKEN',
  'MOCKMATE_TEST_USER_B_TOKEN',
]) {
  assert.match(harness, new RegExp(required), `harness must require ${required}`);
}
assert.match(harness, /\.vercel\.app/, 'hosted acceptance must bind to an exact Vercel preview origin');
assert.match(harness, /supabaseProjectRef/, 'hosted acceptance must verify Supabase target authority');
assert.match(harness, /Hostile origin was accepted by CORS/, 'hosted acceptance must reject hostile origins');
assert.equal(packageJson.scripts['acceptance:hosted'], 'node scripts/hosted-preview-acceptance.mjs');
assert.equal(packageJson.scripts['test:hosted-acceptance-contract'], 'node scripts/test-hosted-acceptance-guard.mjs');
assert.ok(!packageJson.scripts['check:production'].includes('acceptance:hosted'), 'ordinary production source checks must never contact hosted resources');
assert.ok(!packageJson.scripts['check:release'].includes('acceptance:hosted'), 'ordinary release source checks must never contact hosted resources');
assert.match(workflow, /test:hosted-acceptance-contract/, 'Production Readiness must retain the offline P0-8 guard');
assert.ok(!workflow.includes('npm run acceptance:hosted'), 'ordinary PR CI must never invoke hosted acceptance');

const refused = spawnSync(process.execPath, [new URL('./hosted-preview-acceptance.mjs', import.meta.url).pathname], {
  env: {},
  encoding: 'utf8',
});
assert.notEqual(refused.status, 0, 'empty configuration must be refused before any network activity');
assert.match(`${refused.stdout}${refused.stderr}`, /HOSTED_PREVIEW_ACCEPTANCE_REFUSED/);

console.log('P0-8 hosted acceptance guard passed.');
