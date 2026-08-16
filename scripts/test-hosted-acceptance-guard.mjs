import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const harness = fs.readFileSync(new URL('./hosted-preview-acceptance.mjs', import.meta.url), 'utf8');
const scenarioTemplate = fs.readFileSync(new URL('../config/hosted-acceptance-scenarios.example.json', import.meta.url), 'utf8');
const runtimeConfig = fs.readFileSync(new URL('../backend/config/runtimeConfig.ts', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../backend/server.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/production-readiness.yml', import.meta.url), 'utf8');
const template = JSON.parse(scenarioTemplate);

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
assert.match(harness, /resolved\.origin !== originUrl\.origin/, 'scenario URLs must remain on the exact authorized origin');
assert.match(harness, /scenarioPath\.startsWith\('\/\/'\)/, 'protocol-relative scenario paths must be rejected');
assert.match(harness, /scenarioPath\.includes\('\\\\'\)/, 'backslash URL ambiguity must be rejected');
assert.match(harness, /body\?\.gitHeadSha !== expectedHeadSha/, 'hosted acceptance must verify the deployed Git head');
assert.match(runtimeConfig, /VERCEL_GIT_COMMIT_SHA/, 'preview runtime must bind to Vercel deployed commit authority');
assert.match(runtimeConfig, /GIT_HEAD_SHA/, 'preview runtime must validate the deployed commit shape');
assert.match(server, /gitHeadSha: runtime\.previewAuthority\.gitHeadSha/, 'preview health must expose only the non-secret deployed head identity');
assert.match(harness, /supabaseProjectRef/, 'hosted acceptance must verify Supabase target authority');
assert.match(harness, /Hostile origin was accepted by CORS/, 'hosted acceptance must reject hostile origins');

// P1 closure: a passing HTTP status alone is never acceptance.
assert.equal(template.schemaVersion, 3, 'hosted scenario template must use governed-operation schemaVersion 3');
assert.match(harness, /validateAssertions/, 'hosted acceptance must validate response semantics');
assert.match(harness, /semantic assertion/, 'semantic assertion failures must fail the run');
assert.ok(template.scenarios.every((scenario) => Array.isArray(scenario.assertions) && scenario.assertions.length > 0), 'every governed scenario must declare semantic assertions');
assert.ok(!/results\.push\(\{[^}]*status: response\.status[^}]*passed/s.test(harness), 'a status-only result path must not exist');

// P1 closure: concurrency/replay must exercise duplicate/retry behavior and prove post-state.
const concurrency = template.scenarios.find((scenario) => scenario.family === 'concurrency');
const replay = template.scenarios.find((scenario) => scenario.family === 'replay');
assert.equal(concurrency?.execution?.mode, 'parallel', 'concurrency must execute in parallel');
assert.ok(concurrency.execution.attempts >= 2, 'concurrency must execute at least two duplicate requests');
assert.ok(concurrency.verification?.assertions?.length > 0, 'concurrency must verify canonical post-state');
assert.equal(replay?.execution?.mode, 'sequential', 'replay must execute repeated sequential requests');
assert.ok(replay.execution.attempts >= 2, 'replay must execute at least two retries');
assert.ok(replay.verification?.assertions?.length > 0, 'replay must verify canonical post-state');
assert.match(harness, /Promise\.all/, 'parallel duplicate requests must actually be concurrent');
assert.match(harness, /post-state verification/, 'duplicate/replay execution must run a semantic state probe');
assert.match(harness, /family === 'concurrency'/, 'concurrency execution constraints must be enforced at runtime');
assert.match(harness, /family === 'replay'/, 'replay execution constraints must be enforced at runtime');

// Evidence may carry statuses and counts, never response bodies or bearer material.
const evidenceSlice = harness.slice(harness.indexOf('const evidence ='));
const resultSlice = harness.slice(harness.indexOf('results.push('), harness.indexOf('async function preflight'));
assert.ok(!/responseData|responseBody|responseText|Authorization|Bearer/.test(evidenceSlice), 'evidence construction must not persist response bodies or credentials');
assert.match(resultSlice, /statuses/, 'bounded results may retain non-secret status metadata');
assert.match(resultSlice, /verificationStatus/, 'bounded results may retain non-secret verification status metadata');
assert.match(evidenceSlice, /results/, 'evidence may contain only the privacy-bounded result collection');

const operations = new Set(template.scenarios.map((scenario) => scenario.operation));
for (const required of ['resume.parse', 'resume.score', 'resume.suggest', 'clearspeak.create', 'account.delete', 'account.owner-aftermath', 'account.cross-user-aftermath']) {
  assert.ok(operations.has(required), `template must contain governed operation ${required}`);
}
assert.ok(template.scenarios.some((scenario) => scenario.multipart?.fileField === 'resume'), 'Resume must use the registered multipart file field');
assert.ok(template.scenarios.some((scenario) => scenario.multipart?.fileField === 'audio'), 'ClearSpeak must use the registered multipart file field');
assert.match(harness, /rawBuffer\?\.fill\(0\)/, 'raw multipart buffers must be wiped');
assert.match(harness, /requiredOperations/, 'coverage must be explicit operations, not family labels');
assert.match(harness, /operationContracts/, 'operation names must be bound to registered request contracts');
assert.match(harness, /does not match the registered method\/path\/auth contract/, 'mislabeled operations must fail closed');
assert.match(harness, /__CONTROLLER_REPLACE_/, 'the real controller placeholder prefix must be rejected');
assert.ok(!harness.includes('response.arrayBuffer()'), 'responses must not be retained before enforcing the bound');
assert.match(harness, /response\.body\.getReader\(\)/, 'responses must be bounded while streaming');
assert.match(harness, /reader\.cancel\(\)/, 'oversized response streams must be cancelled');
assert.match(harness, /chunks\.forEach\(\(chunk\) => chunk\.fill\(0\)\)/, 'streamed response chunks must be wiped');
assert.ok(template.scenarios.some((scenario) => scenario.operation === 'resume.score' && scenario.body?.resumeData && typeof scenario.body.rawText === 'string' && typeof scenario.body.jdText === 'string'), 'Resume score must use the strict registered body');
assert.ok(template.scenarios.some((scenario) => scenario.operation === 'resume.suggest' && scenario.body?.resumeData && typeof scenario.body.rawText === 'string' && typeof scenario.body.jdText === 'string'), 'Resume suggest must use the strict registered body');
assert.ok(template.scenarios.some((scenario) => scenario.operation === 'clearspeak.create' && typeof scenario.multipart?.fields?.metadata === 'string'), 'ClearSpeak must send registered JSON metadata');
for (const operation of ['clearspeak.prompt', 'clearspeak.cancel', 'clearspeak.history', 'clearspeak.replay', 'interview.version', 'interview.stale', 'interview.interrupted', 'career-context.snapshot', 'career-context.bridge', 'career-context.stale', 'career-context.cross-user', 'partial-failure.oversized', 'partial-failure.account-delete']) {
  assert.ok(operations.has(operation), `template must retain frozen lifecycle operation ${operation}`);
}
assert.match(harness, /canonical responses diverged/, 'retries must compare canonical responses');
assert.match(harness, /exactly one authoritative effect/, 'retries must prove one authoritative effect');
assert.equal(template.scenarios.at(-3).operation, 'account.delete', 'genuine deletion must precede aftermath probes');
assert.equal(template.scenarios.at(-2).operation, 'account.owner-aftermath', 'owner aftermath must follow deletion');
assert.equal(template.scenarios.at(-1).operation, 'account.cross-user-aftermath', 'cross-user aftermath must follow deletion');

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

console.log('P0-8 hosted acceptance semantic/replay/concurrency guard passed.');
