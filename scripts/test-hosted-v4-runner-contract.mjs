import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boundedAbandonedRequest } from './hosted-acceptance-safety.mjs';

const harness = fs.readFileSync(new URL('./hosted-preview-acceptance.mjs', import.meta.url), 'utf8');
const safety = fs.readFileSync(new URL('./hosted-acceptance-safety.mjs', import.meta.url), 'utf8');

assert.match(harness, /createCaptureStore/, 'schema-v4 runner must use the proven capture store');
assert.match(harness, /manifest\.schemaVersion === 4/, 'schema-v4 capture authority must be explicit');
assert.match(harness, /capture declarations require schemaVersion 4/, 'schema-v3 compatibility must not activate captures');
assert.match(harness, /resolveRequestSpec/, 'request specs must pass through capture resolution');
assert.match(harness, /captureStore\.resolve\(rawSpec\.path\)/, 'dynamic paths must resolve process-local captures');
assert.match(harness, /captureStore\.resolve\(rawSpec\.body\)/, 'JSON bodies must resolve process-local captures');
assert.match(harness, /captureStore\.resolve\(rawSpec\.multipart\.fields/, 'multipart fields must resolve process-local captures');
assert.match(harness, /captureStore\.resolve\(assertion\.value\)/, 'assertion expected values must resolve process-local captures');
assert.match(harness, /captureStore\.resolve\(rawSpec\.idempotencyKey\)/, 'idempotency identities must resolve process-local captures');

const requestScenario = harness.slice(harness.indexOf('async function requestScenario'), harness.indexOf('async function boundedPreflight'));
const resolutionIndex = requestScenario.indexOf('resolveRequestSpec(rawScenario');
const contractIndex = requestScenario.indexOf('validateOperationContract(scenario)');
const executionIndex = requestScenario.indexOf('executeRequest(scenario');
const captureIndex = requestScenario.indexOf('captureStore.captureFromResponse');
assert.ok(resolutionIndex >= 0 && contractIndex > resolutionIndex, 'capture references must resolve before registered path/body validation');
assert.ok(executionIndex > contractIndex && captureIndex > executionIndex, 'captures must be extracted only after a validated, semantically successful request');
assert.match(harness, /verification cannot declare captures/, 'post-state verification must not create captures');
assert.match(harness, /may capture only from an ordinary single successful request/, 'repeated concurrency/replay scenarios must not create captures');

assert.match(harness, /process\.on\('exit', \(\) => captureStore\.clear\(\)\)/, 'capture state must clear even on refusal exits');
assert.match(harness, /finally \{\s*captureStore\.clear\(\);\s*\}/s, 'capture state must clear before normal evidence or failure completion');
const evidenceSlice = harness.slice(harness.indexOf('const evidence ='));
assert.ok(!/captureStore|captures|ownerOf|names\(\)/.test(evidenceSlice), 'capture names, owners and values must not be persisted to evidence');
assert.ok(!/\bawait fetch\s*\(/.test(harness), 'runner must not bypass shared bounded request authorities');
assert.match(harness, /boundedAbandonedRequest/, 'response-loss replay must use explicit bounded response abandonment');
assert.match(harness, /abandoned first response/, 'replay must distinguish the deliberately lost first response');
assert.match(harness, /canonical responses diverged/, 'recovery replies must retain canonical equality checks');
assert.match(harness, /exactly one authoritative effect/, 'replay/concurrency must retain post-state exactly-once proof');
assert.match(harness, /'clearspeak\.authority'/, 'ClearSpeak server-issued attempt authority must be a governed operation');
assert.match(safety, /export async function boundedAbandonedRequest/, 'shared safety authority must own bounded abandonment');
assert.match(safety, /response\.body\.cancel/, 'abandoned responses must cancel their body stream');

let cancelled = false;
let receivedSignal;
const abandoned = await boundedAbandonedRequest(
  new URL('https://deploy-preview-21--mockmate-os-preview.netlify.app/api/health'),
  { method: 'POST' },
  {
    timeoutMs: 100,
    fetchImpl: async (_url, init) => {
      receivedSignal = init.signal;
      return {
        status: 200,
        headers: new Headers(),
        body: { async cancel() { cancelled = true; } },
      };
    },
  },
);
assert.equal(abandoned.status, 200);
assert.equal(cancelled, true, 'response-loss simulation must cancel the response body without consuming it');
assert.equal(receivedSignal.aborted, true, 'bounded abandonment must close its request authority after header receipt');

console.log('P0-8 hosted schema-v4 runner contract guard passed');
