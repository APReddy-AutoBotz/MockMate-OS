import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  boundedRequest,
  exactHostedOrigin,
  exactOriginUrl,
} from './hosted-acceptance-safety.mjs';
import { compensateTestUserAppData } from './hosted-acceptance-cleanup.mjs';
import {
  awaitParallelQuiescence,
  evidenceCleanupStatus,
  finalizeOwnedEvidence,
} from './hosted-acceptance-lifecycle.mjs';

const harness = fs.readFileSync(new URL('./hosted-preview-acceptance.mjs', import.meta.url), 'utf8');
const safety = fs.readFileSync(new URL('./hosted-acceptance-safety.mjs', import.meta.url), 'utf8');
const cleanupGuard = fs.readFileSync(new URL('./hosted-acceptance-cleanup.mjs', import.meta.url), 'utf8');
const lifecycleGuard = fs.readFileSync(new URL('./hosted-acceptance-lifecycle.mjs', import.meta.url), 'utf8');
const captureGuard = fs.readFileSync(new URL('./test-hosted-capture-authority.mjs', import.meta.url), 'utf8');
const scenarioTemplate = fs.readFileSync(new URL('../config/hosted-acceptance-scenarios.example.json', import.meta.url), 'utf8');
const runtimeConfig = fs.readFileSync(new URL('../backend/config/runtimeConfig.ts', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../backend/server.ts', import.meta.url), 'utf8');
const usageService = fs.readFileSync(new URL('../backend/services/usageService.ts', import.meta.url), 'utf8');
const sessionService = fs.readFileSync(new URL('../backend/services/sessionService.ts', import.meta.url), 'utf8');
const quotaMigration = fs.readFileSync(new URL('../supabase/migrations/20260823060000_p0_8_interview_answer_usage_exactly_once.sql', import.meta.url), 'utf8');
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
assert.match(cleanupGuard, /requestImpl = boundedRequest/, 'compensating cleanup must default to the bounded hosted transport');
assert.match(cleanupGuard, /exactOriginUrl\(originUrl, CLEANUP_PATH\)/, 'compensating cleanup must stay on the exact authorized origin');
assert.equal((harness.match(/if \(mutatingMethods\.has\(prepared\.method\)\) mutationsMayHaveStarted = true;/g) || []).length, 2, 'cleanup authority must arm immediately before ordinary or abandoned mutating dispatch');
assert.ok(!harness.includes('scenarioExecutionStarted'), 'non-mutating scenario execution must not arm destructive cleanup');
assert.match(harness, /await compensateTestUserAppData\(/, 'scenario failures must invoke compensating app-data cleanup');
assert.match(harness, /compensating_cleanup=\$\{cleanupStatus\}/, 'failure output must disclose whether compensating cleanup completed');
assert.match(harness, /delete process\.env\.MOCKMATE_TEST_USER_A_TOKEN/, 'the runner must release user A token environment authority after the run');
assert.match(harness, /delete process\.env\.MOCKMATE_TEST_USER_B_TOKEN/, 'the runner must release user B token environment authority after the run');
assert.match(harness, /delete process\.env\.MOCKMATE_TEST_ADMIN_TOKEN/, 'the runner must release optional admin token environment authority after the run');
assert.match(lifecycleGuard, /openSync\(artifactPath, 'wx', 0o600\)/, 'evidence finalization must acquire exclusive file ownership');
assert.match(lifecycleGuard, /if \(ownsArtifact\)[\s\S]*unlinkSync\(artifactPath\)/, 'evidence finalization may remove only an artifact it owns');
const guardedLifecycleSlice = harness.slice(harness.indexOf('let runError;'), harness.indexOf('if (runError)'));
assert.ok(guardedLifecycleSlice.indexOf('const evidence =') < guardedLifecycleSlice.indexOf('} catch (error)'), 'evidence construction must remain inside the guarded lifecycle');
assert.ok(guardedLifecycleSlice.indexOf('finalizeOwnedEvidence') < guardedLifecycleSlice.indexOf('} catch (error)'), 'exclusive evidence write and hash must remain inside the guarded lifecycle');
assert.ok(guardedLifecycleSlice.indexOf('await compensateTestUserAppData') < guardedLifecycleSlice.indexOf('tokens.userA = undefined'), 'test-user token authority must remain available through compensation');
assert.match(harness, /evidence_cleanup=\$\{artifactCleanupStatus\}/, 'failure output must report redacted owned-evidence cleanup status');

const cleanupResponses = [];
const cleanupCalls = [];
await compensateTestUserAppData({
  originUrl: exactOrigin,
  userAToken: 'offline-user-a-token',
  userBToken: 'offline-user-b-token',
  timeoutMs: 3210,
  maxResponseBytes: 4321,
  requestImpl: async (url, options, limits) => {
    cleanupCalls.push({ url: url.href, options, limits });
    const body = Buffer.from(JSON.stringify({ success: true, operation: 'app_data_deleted', failedTables: [] }));
    cleanupResponses.push(body);
    return { status: 200, headers: new Headers(), body };
  },
});
assert.equal(cleanupCalls.length, 2, 'compensating cleanup must attempt both bounded test identities');
assert.deepEqual(cleanupCalls.map((call) => call.url), [
  `${exactOrigin.origin}/api/me/data`,
  `${exactOrigin.origin}/api/me/data`,
], 'compensating cleanup must use only the fixed account-data endpoint');
assert.deepEqual(cleanupCalls.map((call) => call.options.method), ['DELETE', 'DELETE'], 'compensating cleanup must delete app data for both identities');
assert.deepEqual(cleanupCalls.map((call) => call.options.headers.Authorization), [
  'Bearer offline-user-a-token',
  'Bearer offline-user-b-token',
], 'compensating cleanup must use each test-user token exactly once');
assert.ok(cleanupCalls.every((call) => call.options.headers.Origin === exactOrigin.origin), 'compensating cleanup must bind the authorized Origin header');
assert.ok(cleanupCalls.every((call) => call.options.redirect === 'manual'), 'compensating cleanup must refuse redirect following');
assert.ok(cleanupCalls.every((call) => call.limits.timeoutMs === 3210 && call.limits.maxResponseBytes === 4321), 'compensating cleanup must retain bounded request limits');
assert.ok(cleanupResponses.every((body) => body.every((byte) => byte === 0)), 'compensating cleanup response bodies must be wiped');

const incompleteCleanupCalls = [];
const incompleteCleanupBody = Buffer.from(JSON.stringify({ success: false, operation: 'app_data_deleted', failedTables: ['synthetic_table'] }));
await assert.rejects(
  compensateTestUserAppData({
    originUrl: exactOrigin,
    userAToken: 'offline-user-a-token',
    userBToken: 'offline-user-b-token',
    timeoutMs: 3210,
    maxResponseBytes: 4321,
    requestImpl: async (_url, options) => {
      incompleteCleanupCalls.push(options.headers.Authorization);
      if (incompleteCleanupCalls.length === 1) return { status: 500, headers: new Headers(), body: incompleteCleanupBody };
      throw new Error('synthetic transport failure');
    },
  }),
  /incomplete for userA and userB/,
  'any incomplete principal cleanup must fail closed',
);
assert.equal(incompleteCleanupCalls.length, 2, 'a failed first cleanup must not prevent the second cleanup attempt');
assert.ok(incompleteCleanupBody.every((byte) => byte === 0), 'failed cleanup response bodies must also be wiped');

const missingFailedTablesCalls = [];
await assert.rejects(
  compensateTestUserAppData({
    originUrl: exactOrigin,
    userAToken: 'offline-user-a-token',
    userBToken: 'offline-user-b-token',
    timeoutMs: 3210,
    maxResponseBytes: 4321,
    requestImpl: async () => {
      missingFailedTablesCalls.push(true);
      return {
        status: 200,
        headers: new Headers(),
        body: Buffer.from(JSON.stringify({ success: true, operation: 'app_data_deleted' })),
      };
    },
  }),
  /incomplete for userA and userB/,
  'cleanup success must require an explicitly empty failedTables array',
);
assert.equal(missingFailedTablesCalls.length, 2, 'malformed success responses must not prevent both cleanup attempts');

const firstParallelFailure = new Error('synthetic first parallel failure');
let slowMutationActive = true;
let slowMutationSettled = false;
const fastFailedMutation = new Promise((_, reject) => {
  setTimeout(() => reject(firstParallelFailure), 5);
});
const slowSuccessfulMutation = new Promise((resolve) => {
  setTimeout(() => {
    slowMutationActive = false;
    slowMutationSettled = true;
    resolve({ status: 200 });
  }, 30);
});
let observedParallelFailure;
let cleanupWouldHaveRaced;
try {
  await awaitParallelQuiescence([fastFailedMutation, slowSuccessfulMutation]);
} catch (error) {
  observedParallelFailure = error;
  cleanupWouldHaveRaced = slowMutationActive;
}
assert.strictEqual(observedParallelFailure, firstParallelFailure, 'parallel quiescence must preserve the first rejection');
assert.equal(cleanupWouldHaveRaced, false, 'parallel failure propagation must wait until no mutating request remains active');
assert.equal(slowMutationSettled, true, 'the slower parallel mutation must settle before compensation can begin');
assert.deepEqual(
  await awaitParallelQuiescence([Promise.resolve('first'), Promise.resolve('second')]),
  ['first', 'second'],
  'successful parallel attempts must retain manifest order',
);

const evidenceTestDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `mockmate-p0-8-evidence-${process.pid}-`));
const partialEvidencePath = path.join(evidenceTestDirectory, 'partial.json');
const hashFailureEvidencePath = path.join(evidenceTestDirectory, 'hash-failure.json');
const foreignEvidencePath = path.join(evidenceTestDirectory, 'foreign.json');
const successfulEvidencePath = path.join(evidenceTestDirectory, 'success.json');
try {
  const partialWriteFailure = new Error('synthetic partial evidence write failure');
  const partialFileSystem = {
    mkdirSync: (...args) => fs.mkdirSync(...args),
    openSync: (...args) => fs.openSync(...args),
    writeFileSync: (descriptor, serialized) => {
      fs.writeSync(descriptor, serialized.subarray(0, 8));
      throw partialWriteFailure;
    },
    fsyncSync: (...args) => fs.fsyncSync(...args),
    closeSync: (...args) => fs.closeSync(...args),
    unlinkSync: (...args) => fs.unlinkSync(...args),
    readFileSync: (...args) => fs.readFileSync(...args),
  };
  let observedPartialWriteFailure;
  try {
    finalizeOwnedEvidence({ artifactPath: partialEvidencePath, evidence: { passed: true }, fileSystem: partialFileSystem });
  } catch (error) {
    observedPartialWriteFailure = error;
  }
  assert.strictEqual(observedPartialWriteFailure, partialWriteFailure, 'evidence cleanup must preserve the original finalization error');
  assert.equal(evidenceCleanupStatus(observedPartialWriteFailure), 'complete', 'owned partial evidence cleanup must report complete');
  assert.equal(fs.existsSync(partialEvidencePath), false, 'a partial evidence file owned by this run must be removed');

  const hashFailure = new Error('synthetic evidence hash failure');
  let observedHashFailure;
  try {
    finalizeOwnedEvidence({
      artifactPath: hashFailureEvidencePath,
      evidence: { passed: true },
      hashFile: () => { throw hashFailure; },
    });
  } catch (error) {
    observedHashFailure = error;
  }
  assert.strictEqual(observedHashFailure, hashFailure, 'post-write hash failure must remain the primary error');
  assert.equal(evidenceCleanupStatus(observedHashFailure), 'complete', 'post-write hash failure must remove owned evidence');
  assert.equal(fs.existsSync(hashFailureEvidencePath), false, 'hash failure must leave no evidence artifact');

  fs.writeFileSync(foreignEvidencePath, 'foreign-owner\n', { mode: 0o600, flag: 'wx' });
  let foreignOwnershipFailure;
  try {
    finalizeOwnedEvidence({ artifactPath: foreignEvidencePath, evidence: { passed: true } });
  } catch (error) {
    foreignOwnershipFailure = error;
  }
  assert.equal(foreignOwnershipFailure?.code, 'EEXIST', 'exclusive evidence ownership must reject a pre-existing path');
  assert.equal(evidenceCleanupStatus(foreignOwnershipFailure), 'not-owned', 'a pre-existing evidence path must never be claimed by this run');
  assert.equal(fs.readFileSync(foreignEvidencePath, 'utf8'), 'foreign-owner\n', 'failure must preserve evidence owned by another actor');

  const successfulDigest = finalizeOwnedEvidence({ artifactPath: successfulEvidencePath, evidence: { passed: true } });
  assert.match(successfulDigest, /^[a-f0-9]{64}$/, 'successful exclusive evidence finalization must return its SHA-256 digest');
  assert.deepEqual(JSON.parse(fs.readFileSync(successfulEvidencePath, 'utf8')), { passed: true }, 'successful evidence must contain only the supplied bounded object');
} finally {
  for (const ownedPath of [partialEvidencePath, hashFailureEvidencePath, foreignEvidencePath, successfulEvidencePath]) {
    if (fs.existsSync(ownedPath)) fs.unlinkSync(ownedPath);
  }
  fs.rmdirSync(evidenceTestDirectory);
}

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
assert.match(harness, /validateP0EightLifecycleOrdering\(\)/, 'P0-8 lifecycle order must fail closed before network');
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
assert.match(harness, /awaitParallelQuiescence/, 'parallel duplicate requests must use the quiescent failure barrier');
assert.match(lifecycleGuard, /Promise\.all/, 'the quiescence barrier must start and await all parallel requests');
assert.match(harness, /boundedAbandonedRequest/, 'response-loss replay must abandon the first response through bounded authority');
assert.match(harness, /canonical responses diverged/, 'retries must compare canonical responses');

// P0-8 exactly-once quota authority: replay and stale rejection must precede
// the transactional usage increment, which must precede the business mutation.
const replayIndex = quotaMigration.indexOf('IF FOUND THEN');
const staleIndex = quotaMigration.indexOf("IF v_session.status <> 'active'");
const usageIndex = quotaMigration.indexOf("consume_daily_usage_tx(p_user_id, 'interview_question', 20)");
const insertIndex = quotaMigration.indexOf('INSERT INTO public.interview_turns');
assert.ok(replayIndex >= 0 && staleIndex > replayIndex && usageIndex > staleIndex && insertIndex > usageIndex, 'atomic Interview quota order must be replay/stale -> one quota effect -> one turn effect');
assert.match(quotaMigration, /FOR UPDATE/, 'adaptive session mutation must retain row serialization');
assert.ok(!quotaMigration.includes('EXCEPTION WHEN unique_violation'), 'unexpected duplicate insertion must roll the whole transaction back instead of hiding a quota effect');
assert.match(usageService, /req\.route\?\.path !== '\/sessions\/:sessionId\/answers'/, 'only the adaptive answer route may defer middleware quota authority');
assert.match(usageService, /authority: 'atomic_adaptive_turn'/, 'adaptive middleware must explicitly delegate quota to the atomic RPC');
assert.ok(sessionService.indexOf('existingTurn = session.history.find') < sessionService.indexOf("session.status !== 'active'"), 'response-loss replay must be checked before terminal session state rejection');
assert.match(sessionService, /Daily usage limit reached/, 'atomic quota exhaustion must map back to the API');
assert.match(sessionService, /err\.status = 429/, 'atomic quota exhaustion must preserve HTTP 429 semantics');

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
  'career-context.rebuild', 'career-context.state', 'career-context.update', 'career-context.delete', 'career-context.decision-state', 'career-context.decision-stale', 'career-context.stale', 'career-context.create', 'career-context.snapshot', 'career-context.bridge', 'career-context.cross-user',
  'clearspeak.prompt', 'clearspeak.authority', 'clearspeak.create', 'clearspeak.submit', 'clearspeak.result', 'clearspeak.replay', 'clearspeak.cancel-authority', 'clearspeak.cancel', 'clearspeak.cancel-status', 'clearspeak.cancel-submit', 'clearspeak.history', 'clearspeak.delete',
  'interview.usage-baseline', 'interview.create', 'interview.version', 'interview.answer', 'interview.report', 'interview.stale', 'concurrency.exactly-once', 'interview.usage-after-concurrency', 'interview.interrupted', 'replay.response-loss', 'interview.usage-after-response-loss', 'interview.complete', 'interview.terminal',
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
const careerDecisionState = template.scenarios.find((scenario) => scenario.operation === 'career-context.decision-state');
const careerDecisionStale = template.scenarios.find((scenario) => scenario.operation === 'career-context.decision-stale');
assert.deepEqual(careerDecision.expectedStatuses, [200], 'Career Context must prove a successful current-version decision');
assert.equal(careerDecision.body.decision, 'revoke', 'Career Context successful decision must use real revoke vocabulary');
assert.ok(careerDecision.assertions.some((a) => a.path === '/item/status' && a.op === 'equals' && a.value === 'revoked'), 'Career Context decision must verify persisted revoked item state');
assert.ok(careerDecision.assertions.some((a) => a.path === '/item/source/recordId' && a.op === 'equals'), 'Career Context decision must verify item lineage');
assert.ok(careerDecision.captures?.some((capture) => capture.name === 'career.v2'), 'successful Career Context decision must capture the advanced version');
assert.ok(careerDecisionState.assertions.some((a) => a.path === '/state/contextVersion' && a.value === '{{capture:career.v2}}'), 'Career Context must re-read the persisted post-decision version');
assert.deepEqual(careerDecisionStale.expectedStatuses, [409], 'stale Career Context decision must remain a distinct negative');
assert.equal(careerDecisionStale.body.expectedContextVersion, '{{capture:career.v1}}', 'stale decision must use the prior current version');

const clearPrompt = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.prompt');
const clearAuthority = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.authority');
const clearCreate = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.create');
const clearReplay = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.replay');
const cancelAuthority = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.cancel-authority');
const cancel = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.cancel');
const cancelStatus = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.cancel-status');
const cancelSubmit = template.scenarios.find((scenario) => scenario.operation === 'clearspeak.cancel-submit');
assert.ok(clearPrompt.captures?.length >= 6, 'ClearSpeak prompt must capture variable server-owned selector authority');
assert.deepEqual(clearCreate.expectedStatuses, [201], 'first ClearSpeak commit must be 201');
assert.deepEqual(clearReplay.expectedStatuses, [200], 'exact ClearSpeak replay must be 200');
assert.ok(typeof clearCreate.multipart?.fields?.metadata === 'string' && clearCreate.multipart.fields.metadata.includes('{{capture:clearspeak.capability}}'), 'ClearSpeak create must be capability-bound');
assert.ok(typeof clearReplay.multipart?.fields?.metadata === 'string' && clearReplay.multipart.fields.metadata.includes('{{capture:clearspeak.capability}}'), 'ClearSpeak replay must be capability-bound');
assert.notEqual(cancelAuthority.body.attemptId, clearAuthority.body.attemptId, 'cancellation must use a distinct uncommitted authority');
assert.ok(cancelAuthority.captures?.some((capture) => capture.name === 'clearspeak.cancelCapability'), 'cancellation authority must capture its own capability');
assert.equal(cancel.body.submissionCapability, '{{capture:clearspeak.cancelCapability}}', 'pending cancellation must use the second process-local capability');
assert.ok(cancel.assertions.some((a) => a.path === '/status' && a.op === 'equals' && a.value === 'cancelled'), 'cancel must verify cancelled status');
assert.ok(cancelStatus.assertions.some((a) => a.path === '/status' && a.op === 'equals' && a.value === 'cancelled'), 'post-cancel read must persist cancelled status');
assert.deepEqual(cancelSubmit.expectedStatuses, [422], 'submit after cancellation must be denied');
assert.ok(cancelSubmit.assertions.some((a) => a.path === '/error' && a.op === 'equals' && a.value === 'submission_canceled'), 'cancelled authority reuse must prove semantic denial');
assert.ok(cancelSubmit.multipart.fields.metadata.includes('{{capture:clearspeak.cancelCapability}}'), 'cancelled submit must reuse the cancelled capability');
assert.ok(!/queued|processing|completed/.test(JSON.stringify(template.scenarios.filter((s) => s.family === 'clearspeak'))), 'ClearSpeak acceptance must not use stale lifecycle vocabulary');

const interviewCreate = template.scenarios.find((scenario) => scenario.operation === 'interview.create');
const interviewAnswer = template.scenarios.find((scenario) => scenario.operation === 'interview.answer');
const interviewComplete = template.scenarios.find((scenario) => scenario.operation === 'interview.complete');
const interviewTerminal = template.scenarios.find((scenario) => scenario.operation === 'interview.terminal');
const interviewReport = template.scenarios.find((scenario) => scenario.operation === 'interview.report');
const usageBaseline = template.scenarios.find((scenario) => scenario.operation === 'interview.usage-baseline');
const usageAfterConcurrency = template.scenarios.find((scenario) => scenario.operation === 'interview.usage-after-concurrency');
const usageAfterResponseLoss = template.scenarios.find((scenario) => scenario.operation === 'interview.usage-after-response-loss');
assert.equal(interviewCreate.body.context.interviewPlan.questionSet.length, 4, 'provider-free Interview acceptance must keep four deterministic roots');
for (const scenario of [interviewAnswer, concurrency, replay, interviewComplete]) {
  assert.equal(scenario.body.answerKind, 'skipped', `${scenario.operation} must deterministically advance roots without provider scoring`);
  assert.ok(!Object.prototype.hasOwnProperty.call(scenario.body, 'answerText'), `${scenario.operation} skipped answer must not carry answer text`);
}
assert.equal(replay.body.expectedSessionVersion, 3, 'response-loss replay must bind the deterministic post-concurrency version');
assert.deepEqual(replay.canonicalPaths, ['/completedTurnId','/sessionVersion'], 'replay must compare canonical exactly-once response fields');
assert.ok(usageBaseline.assertions.some((a) => a.path === '/usage/interview_question/used' && a.value === 0), 'hosted acceptance must start from a fresh zero Interview quota baseline');
assert.ok(usageAfterConcurrency.assertions.some((a) => a.path === '/usage/interview_question/used' && a.value === 3), 'parallel duplicate must yield exactly one quota effect');
assert.ok(usageAfterResponseLoss.assertions.some((a) => a.path === '/usage/interview_question/used' && a.value === 4), 'response-loss retry must yield exactly one quota effect');
assert.equal(interviewComplete.body.questionId, 'q4', 'fourth root must be explicitly completed');
assert.equal(interviewComplete.body.expectedSessionVersion, 4, 'fourth root must follow the response-loss third root');
assert.ok(interviewComplete.assertions.some((a) => a.path === '/isSessionComplete' && a.value === true), 'fourth root must complete the session');
assert.ok(interviewTerminal.assertions.some((a) => a.path === '/status' && a.value === 'awaiting_report'), 'report must be gated by terminal awaiting_report state');
assert.deepEqual(interviewReport.expectedStatuses, [200], 'terminal Interview report must succeed');
assert.ok(interviewReport.assertions.some((a) => a.path === '/evaluationModel' && a.value === 'mockmate_v1_canonical'), 'report must prove deterministic canonical evaluation model');
assert.ok(interviewReport.assertions.some((a) => a.path === '/readiness/status' && a.value === 'NOT_ASSESSED'), 'provider-free report must truthfully remain NOT_ASSESSED');
assert.ok(interviewReport.verification?.assertions?.some((a) => a.path === '/status' && a.value === 'completed'), 'report must persist completed session state');

const malformed = template.scenarios.find((scenario) => scenario.operation === 'partial-failure.malformed');
assert.equal(malformed.body.unsupportedProbeField, 'reject-me', 'malformed seam must be one intentional strict-schema violation');
const oversized = template.scenarios.find((scenario) => scenario.operation === 'partial-failure.oversized');
assert.equal(oversized.body.rawText, '{{generated:resume.rawText.500001}}', 'oversized seam must be bounded and runner-materialized');

assert.equal(template.scenarios.at(-4).operation, 'partial-failure.account-delete', 'non-destructive delete failure seam must be first in terminal sequence');
assert.equal(template.scenarios.at(-3).operation, 'account.delete', 'genuine deletion must precede aftermath probes');
assert.equal(template.scenarios.at(-2).operation, 'account.owner-aftermath', 'owner aftermath must follow deletion');
assert.equal(template.scenarios.at(-1).operation, 'account.cross-user-aftermath', 'cross-user aftermath must follow deletion');
const ownerAftermath = template.scenarios.at(-2);
assert.deepEqual(ownerAftermath.assertions, [
  { source: 'json', op: 'equals', path: '', value: [] },
], 'owner aftermath must require an empty Interview history, not merely an array response');
assert.equal(ownerAftermath.verification?.method, 'GET', 'owner aftermath must verify a second persisted module');
assert.equal(ownerAftermath.verification?.path, '/api/career-context/snapshots/{{capture:career.snapshotId}}', 'owner aftermath must probe the created Career Context snapshot');
assert.equal(ownerAftermath.verification?.auth, 'userA', 'snapshot deletion aftermath must remain owner-scoped');
assert.deepEqual(ownerAftermath.verification?.expectedStatuses, [404], 'deleted owner snapshot must be missing');
assert.ok(ownerAftermath.verification?.assertions?.some((assertion) => assertion.path === '/error' && assertion.op === 'exists' && assertion.value === true), 'missing snapshot aftermath must be semantically asserted');

assert.equal(packageJson.scripts['acceptance:hosted'], 'node scripts/hosted-preview-acceptance.mjs');
assert.equal(packageJson.scripts['test:hosted-acceptance-contract'], 'node scripts/test-hosted-acceptance-guard.mjs && npm run test:hosted-operation-authority');
assert.equal(packageJson.scripts['test:hosted-operation-authority'], 'node scripts/test-hosted-operation-authority.mjs');
assert.ok(!packageJson.scripts['check:production'].includes('acceptance:hosted'), 'ordinary production source checks must never contact hosted resources');
assert.ok(!packageJson.scripts['check:release'].includes('acceptance:hosted'), 'ordinary release source checks must never contact hosted resources');
assert.match(workflow, /test:hosted-acceptance-contract/, 'Production Readiness must retain the offline P0-8 guard');
assert.ok(!workflow.includes('npm run acceptance:hosted'), 'ordinary PR CI must never invoke hosted acceptance');
assert.match(captureGuard, /test-hosted-committed-manifest-preflight\.mjs/, 'P0-8 capture CI gate must execute the exact committed manifest through the real runner');

const refused = spawnSync(process.execPath, [fileURLToPath(new URL('./hosted-preview-acceptance.mjs', import.meta.url))], { env: {}, encoding: 'utf8' });
assert.notEqual(refused.status, 0, 'empty configuration must be refused before any network activity');
assert.match(`${refused.stdout}${refused.stderr}`, /HOSTED_PREVIEW_ACCEPTANCE_REFUSED/);

const staleEvidencePath = path.join(os.tmpdir(), `mockmate-p0-8-stale-evidence-${process.pid}.json`);
fs.writeFileSync(staleEvidencePath, '{"stale":true}\n', { mode: 0o600, flag: 'wx' });
try {
  const staleEvidenceRefused = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./hosted-preview-acceptance.mjs', import.meta.url))],
    {
      env: {
        AUTHORIZE_HOSTED_PREVIEW_ACCEPTANCE: 'true',
        BOUNDED_TEST_DATA_CONFIRMED: 'true',
        MOCKMATE_PREVIEW_ORIGIN: 'https://mockmate-preflight.netlify.app',
        MOCKMATE_PREVIEW_TARGET_ID: 'p0-8-stale-evidence-guard',
        MOCKMATE_SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
        EXPECTED_HEAD_SHA: 'a'.repeat(40),
        HOSTED_ACCEPTANCE_SCENARIOS_FILE: fileURLToPath(new URL('../config/hosted-acceptance-scenarios.example.json', import.meta.url)),
        MOCKMATE_TEST_USER_A_TOKEN: 'offline-user-a-token',
        MOCKMATE_TEST_USER_B_TOKEN: 'offline-user-b-token',
        HOSTED_ACCEPTANCE_EVIDENCE_FILE: staleEvidencePath,
      },
      encoding: 'utf8',
    },
  );
  const staleEvidenceOutput = `${staleEvidenceRefused.stdout || ''}${staleEvidenceRefused.stderr || ''}`;
  assert.equal(staleEvidenceRefused.status, 2, 'an existing evidence path must be refused before hosted network activity');
  assert.match(staleEvidenceOutput, /HOSTED_ACCEPTANCE_EVIDENCE_FILE already exists/, 'stale success evidence must fail closed');
  assert.equal(fs.readFileSync(staleEvidencePath, 'utf8'), '{"stale":true}\n', 'the existing evidence artifact must remain preserved');
} finally {
  fs.unlinkSync(staleEvidencePath);
}

console.log('P0-8 hosted acceptance schema-v4/origin/timeout/cleanup/semantic/quota/lifecycle guard passed.');
