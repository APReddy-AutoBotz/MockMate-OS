import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  boundedRequest,
  exactHostedOrigin,
  exactOriginUrl,
} from './hosted-acceptance-safety.mjs';

const harness = fs.readFileSync(new URL('./hosted-preview-acceptance.mjs', import.meta.url), 'utf8');
const safety = fs.readFileSync(new URL('./hosted-acceptance-safety.mjs', import.meta.url), 'utf8');
const captureGuard = fs.readFileSync(new URL('./test-hosted-capture-authority.mjs', import.meta.url), 'utf8');
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

for (const allowed of [
  'https://mockmate-preview.vercel.app',
  'https://deploy-preview-21--mockmate-os-preview.netlify.app',
]) {
  assert.equal(exactHostedOrigin(allowed).origin, allowed, `${allowed} must be accepted exactly`);
}

for (const rejected of [
  'http://mockmate-preview.vercel.app',
  'https://vercel.app',
  'https://netlify.app',
  'https://mockmate-preview.vercel.app.evil.example',
  'https://mockmate-preview.netlify.app.evil.example',
  'https://mockmate-preview.vercel.app:443',
  'https://mockmate-preview.netlify.app:8443',
  'https://user@mockmate-preview.vercel.app',
  'https://user:password@mockmate-preview.netlify.app',
  'https://mockmate-preview.vercel.app/path',
  'https://mockmate-preview.netlify.app/?query=true',
  'https://mockmate-preview.vercel.app/#fragment',
  '//mockmate-preview.vercel.app',
  'https://localhost.vercel.app.example',
  'https://127.0.0.1',
  'https://localhost',
  'https://example.com',
]) {
  assert.throws(() => exactHostedOrigin(rejected), Error, `${rejected} must be rejected`);
}

const exactOrigin = exactHostedOrigin('https://deploy-preview-21--mockmate-os-preview.netlify.app');
assert.equal(
  exactOriginUrl(exactOrigin, '/api/health').href,
  'https://deploy-preview-21--mockmate-os-preview.netlify.app/api/health',
  'origin-relative requests must resolve on the exact authorized origin',
);
for (const rejectedPath of [
  'https://evil.example/api/health',
  '//evil.example/api/health',
  '/\\evil.example/api/health',
  '\\\\evil.example\\api\\health',
  'api/health',
]) {
  assert.throws(() => exactOriginUrl(exactOrigin, rejectedPath), Error, `${rejectedPath} must not escape the authorized origin`);
}

assert.match(safety, /AbortController/, 'bounded requests must own an AbortController');
assert.match(safety, /Promise\.race/, 'the abort deadline must race connection and response reads');
assert.match(safety, /reader\.cancel/, 'failed response streams must be cancelled where possible');
assert.match(safety, /chunk\) => chunk\.fill\(0\)/, 'buffered response chunks must be wiped');
assert.match(harness, /HOSTED_ACCEPTANCE_TIMEOUT_MS/, 'hosted acceptance must expose a bounded timeout');
assert.match(harness, /boundedRequest/, 'all hosted requests must use the bounded request authority');
assert.ok(!/\bawait fetch\s*\(/.test(harness), 'the hosted runner must not bypass the bounded request authority');
assert.match(harness, /method:\s*'OPTIONS'/, 'hosted acceptance must issue a bounded CORS preflight');
assert.match(harness, /Access-Control-Request-Method/, 'CORS preflight must declare the requested method');
assert.match(harness, /uploadBuffer\?\.fill\(0\)/, 'raw multipart upload buffers must be wiped');
assert.match(harness, /multipartBuffer\?\.fill\(0\)/, 'encoded multipart request buffers must be wiped');
assert.match(harness, /multipartPartBuffers\.forEach\(\(buffer\) => buffer\.fill\(0\)\)/, 'multipart framing buffers must be wiped');
assert.match(harness, /Buffer\.concat\(multipartParts\)/, 'multipart bodies must use an explicitly wipeable Buffer representation');
assert.ok(!harness.includes('new FormData()'), 'multipart requests must not use FormData-owned immutable storage');
assert.ok(!harness.includes('new Blob([uploadBuffer]'), 'raw fixtures must not be copied into an unwipeable Blob');
assert.match(harness, /jsonBuffer\?\.fill\(0\)/, 'encoded JSON request buffers must be wiped');
assert.match(harness, /responseData\.body\.fill\(0\)/, 'consumed response buffers must be wiped');
assert.match(harness, /body\?\.gitHeadSha !== expectedHeadSha/, 'hosted acceptance must verify the deployed Git head');
assert.match(runtimeConfig, /(?:VERCEL_GIT_COMMIT_SHA|COMMIT_REF)/, 'preview runtime must support deployed commit authority');
assert.match(runtimeConfig, /GIT_HEAD_SHA/, 'preview runtime must validate the deployed commit shape');
assert.match(server, /gitHeadSha: runtime\.previewAuthority\.gitHeadSha/, 'preview health must expose only deployed head identity');
assert.match(harness, /supabaseProjectRef/, 'hosted acceptance must verify Supabase target authority');
assert.match(harness, /Hostile origin was accepted by CORS/, 'hosted acceptance must reject hostile origins');

let hangingSignal;
await assert.rejects(
  boundedRequest(new URL('/api/health', exactOrigin), {}, {
    timeoutMs: 20,
    maxResponseBytes: 1024,
    fetchImpl: (_url, init) => {
      hangingSignal = init.signal;
      return new Promise(() => {});
    },
  }),
  /timed out/i,
);
assert.equal(hangingSignal.aborted, true, 'a hanging connection must be aborted');

let dripSignal;
let dripCancelled = false;
const dripChunks = [];
await assert.rejects(
  boundedRequest(new URL('/api/health', exactOrigin), {}, {
    timeoutMs: 30,
    maxResponseBytes: 1024,
    fetchImpl: async (_url, init) => {
      dripSignal = init.signal;
      return {
        status: 200,
        headers: new Headers(),
        body: {
          getReader() {
            return {
              async read() {
                if (dripChunks.length === 0) {
                  const chunk = new Uint8Array(Buffer.from('sensitive-response-fragment'));
                  dripChunks.push(chunk);
                  return { done: false, value: chunk };
                }
                return new Promise(() => {});
              },
              async cancel() { dripCancelled = true; },
            };
          },
        },
      };
    },
  }),
  /timed out/i,
);
assert.equal(dripSignal.aborted, true, 'a drip-fed response must be aborted');
assert.equal(dripCancelled, true, 'a drip-fed response reader must be cancelled');
assert.ok(dripChunks.every((chunk) => chunk.every((byte) => byte === 0)), 'drip-fed source chunks must be wiped');

let oversizedCancelled = false;
const oversizedChunk = new Uint8Array(Buffer.from('oversized-sensitive-response'));
await assert.rejects(
  boundedRequest(new URL('/api/health', exactOrigin), {}, {
    timeoutMs: 100,
    maxResponseBytes: 4,
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers(),
      body: {
        getReader() {
          return {
            async read() { return { done: false, value: oversizedChunk }; },
            async cancel() { oversizedCancelled = true; },
          };
        },
      },
    }),
  }),
  /oversized/i,
);
assert.equal(oversizedCancelled, true, 'oversized response streams must be cancelled');
assert.ok(oversizedChunk.every((byte) => byte === 0), 'oversized response chunks must be wiped');

assert.equal(template.schemaVersion, 4, 'committed hosted scenario template must use captured schemaVersion 4');
assert.ok(!scenarioTemplate.includes('__CONTROLLER_REPLACE_'), 'committed schema-v4 template must require no manual controller substitution');
assert.match(harness, /validateManifestBeforeNetwork\(\);[\s\S]*await preflight\(\);/, 'whole-manifest authority must run before the first hosted preflight');
assert.match(harness, /validateResolvedOperationBody\(scenario\)/, 'whole-manifest preflight must execute strict operation body authority');
assert.match(harness, /unknown or forward-referenced/, 'capture references must fail closed on forward or unknown authority');
assert.match(harness, /schemaVersion === 4/, 'capture authority must be enabled only for schema-v4 manifests');
assert.match(harness, /materializeGeneratedProbe/, 'the bounded oversized probe must be runner-owned, not committed as a giant literal');
assert.equal((scenarioTemplate.match(/\{\{generated:resume\.rawText\.500001\}\}/g) || []).length, 1, 'exactly one bounded generated oversized probe is allowed');
assert.match(harness, /validateAssertions/, 'hosted acceptance must validate response semantics');
assert.match(harness, /semantic assertion/, 'semantic assertion failures must fail the run');
assert.ok(template.scenarios.every((scenario) => Array.isArray(scenario.assertions) && scenario.assertions.length > 0), 'every governed scenario must declare semantic assertions');
assert.ok(!/results\.push\(\{[^}]*status: response\.status[^}]*passed/s.test(harness), 'a status-only result path must not exist');

const concurrency = template.scenarios.find((scenario) => scenario.operation === 'concurrency.exactly-once');
const replay = template.scenarios.find((scenario) => scenario.operation === 'replay.response-loss');
assert.equal(concurrency?.execution?.mode, 'parallel', 'concurrency must remain genuinely parallel');
assert.ok(concurrency.execution.attempts >= 2, 'concurrency must retain duplicate intent');
assert.equal(replay?.execution?.mode, 'sequential', 'response-loss recovery must remain sequential');
assert.ok(replay.execution.attempts >= 2, 'response-loss recovery must retain retry intent');
assert.match(harness, /repetitionContracts/, 'repeated execution authority must be operation-owned');
assert.match(harness, /'concurrency\.exactly-once': \{ mode: 'parallel'/, 'concurrency operation must require parallel execution');
assert.match(harness, /'replay\.response-loss': \{ mode: 'sequential'/, 'replay operation must require sequential recovery');
assert.ok(!harness.includes("family === 'concurrency'"), 'concurrency authority must not be controlled by a family label');
assert.ok(!harness.includes("family === 'replay'"), 'replay authority must not be controlled by a family label');
assert.ok(harness.includes("'replay.response-loss': ['POST', /^\\/api\\/interview\\/sessions\\/[^/]+\\/answers$/, 'userA', 'json']"), 'response-loss replay must target Interview answer idempotency');
assert.match(harness, /clientSubmissionId/, 'repetition must require endpoint-native clientSubmissionId');
assert.match(harness, /expectedSessionVersion/, 'repetition must bind Interview session version');
assert.match(harness, /same session advanced by exactly one version/, 'verification must prove one authoritative transition');
assert.match(harness, /must use endpoint-native clientSubmissionId rather than Idempotency-Key/, 'repetition must reject controller-only idempotency metadata');
assert.match(harness, /Promise\.all/, 'parallel duplicate requests must actually be concurrent');
assert.match(harness, /boundedAbandonedRequest/, 'response-loss replay must abandon the first response through bounded authority');
assert.match(harness, /canonical responses diverged/, 'retries must compare canonical responses');

const evidenceSlice = harness.slice(harness.indexOf('const evidence ='));
const resultSlice = harness.slice(harness.indexOf('results.push('), harness.indexOf('async function boundedPreflight'));
assert.ok(!/responseData|responseBody|responseText|Authorization|Bearer/.test(evidenceSlice), 'evidence construction must not persist response bodies or credentials');
assert.match(resultSlice, /statuses/, 'bounded results may retain non-secret status metadata');
assert.match(resultSlice, /verificationStatus/, 'bounded results may retain non-secret verification status metadata');
assert.match(evidenceSlice, /results/, 'evidence may contain only the privacy-bounded result collection');

const operations = template.scenarios.map((scenario) => scenario.operation);
const operationSet = new Set(operations);
assert.equal(operationSet.size, operations.length, 'committed manifest must contain each governed operation exactly once');
for (const required of [
  'runtime.health', 'pwa.manifest', 'pwa.offline', 'auth.identity',
  'resume.parse', 'resume.score', 'resume.suggest',
  'career-context.rebuild', 'career-context.state', 'career-context.update', 'career-context.delete', 'career-context.stale', 'career-context.create', 'career-context.snapshot', 'career-context.bridge', 'career-context.cross-user',
  'clearspeak.prompt', 'clearspeak.authority', 'clearspeak.create', 'clearspeak.submit', 'clearspeak.result', 'clearspeak.cancel', 'clearspeak.history', 'clearspeak.replay', 'clearspeak.delete',
  'interview.create', 'interview.version', 'interview.answer', 'interview.report', 'interview.stale', 'concurrency.exactly-once', 'interview.interrupted', 'replay.response-loss',
  'admin.denied', 'cross-user.denied', 'partial-failure.malformed', 'partial-failure.oversized', 'partial-failure.account-delete',
  'account.delete', 'account.owner-aftermath', 'account.cross-user-aftermath',
]) {
  assert.ok(operationSet.has(required), `template must contain governed operation ${required}`);
}

const pwaManifest = template.scenarios.find((scenario) => scenario.operation === 'pwa.manifest');
const pwaOffline = template.scenarios.find((scenario) => scenario.operation === 'pwa.offline');
assert.equal(pwaManifest.path, '/manifest.webmanifest', 'PWA acceptance must target the generated manifest asset');
assert.equal(pwaOffline.path, '/sw.js', 'PWA offline authority must target the generated service worker');

for (const operation of ['resume.parse', 'resume.suggest']) {
  const scenario = template.scenarios.find((entry) => entry.operation === operation);
  assert.deepEqual(scenario.expectedStatuses, [503], `${operation} must truthfully model provider-unavailable preview behavior`);
  assert.ok(scenario.assertions.some((a) => a.source === 'json' && a.path === '/code' && a.op === 'equals' && a.value === 'SERVICE_UNAVAILABLE'), `${operation} must assert SERVICE_UNAVAILABLE`);
}
const resumeSuggest = template.scenarios.find((entry) => entry.operation === 'resume.suggest');
assert.ok(!Object.prototype.hasOwnProperty.call(resumeSuggest.body, 'rawText'), 'Resume suggest must refuse score-only rawText');
assert.ok(template.scenarios.some((scenario) => scenario.multipart?.fileField === 'resume'), 'Resume parse must use the registered multipart file field');
assert.ok(template.scenarios.some((scenario) => scenario.multipart?.fileField === 'audio'), 'ClearSpeak must use the registered multipart file field');

const careerState = template.scenarios.find((scenario) => scenario.operation === 'career-context.state');
assert.ok(careerState.captures?.some((capture) => capture.name === 'career.itemId'), 'Career Context state must capture a real authoritative item');
const careerDecision = template.scenarios.find((scenario) => scenario.operation === 'career-context.delete');
assert.ok(['confirm','reject','revoke','dispute','replace','edit'].includes(careerDecision.body.decision), 'Career Context decision must use real shared vocabulary');
assert.notEqual(careerDecision.body.decision, 'delete', 'Career Context must not invent a delete decision');

const clearPrompt = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.prompt');
assert.ok(clearPrompt.captures?.length >= 6, 'ClearSpeak prompt must capture variable server-owned selector authority');
const clearCreate = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.create');
const clearReplay = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.replay');
assert.deepEqual(clearCreate.expectedStatuses, [201], 'first ClearSpeak commit must be 201');
assert.deepEqual(clearReplay.expectedStatuses, [200], 'exact ClearSpeak replay must be 200');
assert.ok(typeof clearCreate.multipart?.fields?.metadata === 'string' && clearCreate.multipart.fields.metadata.includes('{{capture:clearspeak.capability}}'), 'ClearSpeak create must be capability-bound');
assert.ok(typeof clearReplay.multipart?.fields?.metadata === 'string' && clearReplay.multipart.fields.metadata.includes('{{capture:clearspeak.capability}}'), 'ClearSpeak replay must be capability-bound');
for (const op of ['clearspeak.submit','clearspeak.result','clearspeak.cancel']) {
  const scenario = template.scenarios.find((entry) => entry.operation === op);
  assert.ok(scenario.assertions.some((a) => a.path === '/status' && ['equals','oneOf'].includes(a.op)), `${op} must assert real lifecycle status`);
}
assert.ok(!/queued|processing|completed/.test(JSON.stringify(template.scenarios.filter((s) => s.family === 'clearspeak'))), 'ClearSpeak acceptance must not use stale lifecycle vocabulary');

const interviewCreate = template.scenarios.find((scenario) => scenario.operation === 'interview.create');
assert.equal(interviewCreate.body.context.interviewPlan.questionSet.length, 4, 'provider-free Interview acceptance must keep enough deterministic roots for answer/concurrency/replay');
assert.deepEqual(template.scenarios.find((s) => s.operation === 'interview.report').expectedStatuses, [409], 'active Interview report must truthfully fail with 409');
assert.equal(replay.body.expectedSessionVersion, 3, 'response-loss replay must bind the deterministic post-concurrency version');
assert.deepEqual(replay.canonicalPaths, ['/completedTurnId','/sessionVersion'], 'replay must compare canonical exactly-once response fields');

const malformed = template.scenarios.find((scenario) => scenario.operation === 'partial-failure.malformed');
assert.equal(malformed.body.unsupportedProbeField, 'reject-me', 'malformed seam must be one intentional strict-schema violation');
const oversized = template.scenarios.find((scenario) => scenario.operation === 'partial-failure.oversized');
assert.equal(oversized.body.rawText, '{{generated:resume.rawText.500001}}', 'oversized seam must be bounded and runner-materialized');

assert.equal(template.scenarios.at(-4).operation, 'partial-failure.account-delete', 'non-destructive delete failure seam must be first in terminal sequence');
assert.equal(template.scenarios.at(-3).operation, 'account.delete', 'genuine deletion must precede aftermath probes');
assert.equal(template.scenarios.at(-2).operation, 'account.owner-aftermath', 'owner aftermath must follow deletion');
assert.equal(template.scenarios.at(-1).operation, 'account.cross-user-aftermath', 'cross-user aftermath must follow deletion');

assert.equal(packageJson.scripts['acceptance:hosted'], 'node scripts/hosted-preview-acceptance.mjs');
assert.equal(packageJson.scripts['test:hosted-acceptance-contract'], 'node scripts/test-hosted-acceptance-guard.mjs && npm run test:hosted-operation-authority');
assert.equal(packageJson.scripts['test:hosted-operation-authority'], 'node scripts/test-hosted-operation-authority.mjs');
assert.ok(!packageJson.scripts['check:production'].includes('acceptance:hosted'), 'ordinary production source checks must never contact hosted resources');
assert.ok(!packageJson.scripts['check:release'].includes('acceptance:hosted'), 'ordinary release source checks must never contact hosted resources');
assert.match(workflow, /test:hosted-acceptance-contract/, 'Production Readiness must retain the offline P0-8 guard');
assert.ok(!workflow.includes('npm run acceptance:hosted'), 'ordinary PR CI must never invoke hosted acceptance');
assert.match(captureGuard, /test-hosted-committed-manifest-preflight\.mjs/, 'P0-8 capture CI gate must execute the exact committed manifest through the real runner');

const refused = spawnSync(process.execPath, [new URL('./hosted-preview-acceptance.mjs', import.meta.url).pathname], { env: {}, encoding: 'utf8' });
assert.notEqual(refused.status, 0, 'empty configuration must be refused before any network activity');
assert.match(`${refused.stdout}${refused.stderr}`, /HOSTED_PREVIEW_ACCEPTANCE_REFUSED/);

console.log('P0-8 hosted acceptance schema-v4/origin/timeout/cleanup/semantic/replay/concurrency guard passed.');
