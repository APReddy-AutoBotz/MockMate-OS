import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { boundedAbandonedRequest, boundedRequest, exactHostedOrigin, exactOriginUrl } from './hosted-acceptance-safety.mjs';
import { createCaptureStore } from './hosted-acceptance-captures.mjs';

const captureStore = createCaptureStore();
process.on('exit', () => captureStore.clear());

const fail = (message) => {
  console.error(`[HOSTED_PREVIEW_ACCEPTANCE_REFUSED] ${message}`);
  process.exit(2);
};

const requireExact = (name, expected) => {
  const value = process.env[name];
  if (value !== expected) fail(`${name} is not explicitly authorized.`);
  return value;
};

const requireValue = (name, pattern) => {
  const value = process.env[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) fail(`${name} is missing or malformed.`);
  return value;
};

requireExact('AUTHORIZE_HOSTED_PREVIEW_ACCEPTANCE', 'true');
requireExact('BOUNDED_TEST_DATA_CONFIRMED', 'true');

const origin = requireValue('MOCKMATE_PREVIEW_ORIGIN');
let originUrl;
try {
  originUrl = exactHostedOrigin(origin);
} catch (error) {
  fail(error instanceof Error ? error.message : 'MOCKMATE_PREVIEW_ORIGIN is invalid.');
}

const previewTargetId = requireValue('MOCKMATE_PREVIEW_TARGET_ID', /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/);
const supabaseProjectRef = requireValue('MOCKMATE_SUPABASE_PROJECT_REF', /^[a-z0-9]{20}$/);
const expectedHeadSha = requireValue('EXPECTED_HEAD_SHA', /^[0-9a-f]{40}$/);
const scenarioFile = requireValue('HOSTED_ACCEPTANCE_SCENARIOS_FILE');
const userAToken = requireValue('MOCKMATE_TEST_USER_A_TOKEN');
const userBToken = requireValue('MOCKMATE_TEST_USER_B_TOKEN');
const adminToken = process.env.MOCKMATE_TEST_ADMIN_TOKEN?.trim();

if (!fs.existsSync(scenarioFile)) fail('HOSTED_ACCEPTANCE_SCENARIOS_FILE does not exist.');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
} catch {
  fail('HOSTED_ACCEPTANCE_SCENARIOS_FILE is not valid JSON.');
}

const operationContracts = new Map(Object.entries({
  'runtime.health': ['GET', /^\/api\/health$/, 'none', 'none'],
  'pwa.manifest': ['GET', /^\/manifest\.json$/, 'none', 'none'],
  'pwa.offline': ['GET', /^\/offline\.html$/, 'none', 'none'],
  'auth.identity': ['GET', /^\/api\/auth\/test$/, 'userA', 'none'],
  'resume.parse': ['POST', /^\/api\/resume\/parse$/, 'userA', 'resume'],
  'resume.score': ['POST', /^\/api\/resume\/score$/, 'userA', 'json'],
  'resume.suggest': ['POST', /^\/api\/resume\/suggest$/, 'userA', 'json'],
  'clearspeak.prompt': ['POST', /^\/api\/clearspeak\/v1\/accent\/prompts$/, 'userA', 'json'],
  'clearspeak.authority': ['POST', /^\/api\/clearspeak\/v1\/accent\/attempt-authority$/, 'userA', 'json'],
  'clearspeak.create': ['POST', /^\/api\/clearspeak\/v1\/accent\/attempts$/, 'userA', 'audio'],
  'clearspeak.submit': ['GET', /^\/api\/clearspeak\/v1\/accent\/attempts\/[^/]+\/status$/, 'userA', 'none'],
  'clearspeak.result': ['GET', /^\/api\/clearspeak\/v1\/accent\/attempts\/[^/]+\/status$/, 'userA', 'none'],
  'clearspeak.cancel': ['POST', /^\/api\/clearspeak\/v1\/accent\/attempts\/[^/]+\/cancel$/, 'userA', 'json'],
  'clearspeak.history': ['GET', /^\/api\/clearspeak\/v1\/accent\/attempts(?:\?.*)?$/, 'userA', 'none'],
  'clearspeak.replay': ['POST', /^\/api\/clearspeak\/v1\/accent\/attempts$/, 'userA', 'audio'],
  'clearspeak.delete': ['DELETE', /^\/api\/clearspeak\/v1\/accent\/attempts\/[^/]+$/, 'userA', 'none'],
  'interview.create': ['POST', /^\/api\/interview\/sessions$/, 'userA', 'json'],
  'interview.answer': ['POST', /^\/api\/interview\/sessions\/[^/]+\/answers$/, 'userA', 'json'],
  'interview.report': ['POST', /^\/api\/interview\/sessions\/[^/]+\/report$/, 'userA', 'json'],
  'interview.version': ['GET', /^\/api\/interview\/sessions\/[^/]+$/, 'userA', 'none'],
  'interview.stale': ['POST', /^\/api\/interview\/sessions\/[^/]+\/answers$/, 'userA', 'json'],
  'interview.interrupted': ['GET', /^\/api\/interview\/sessions\/[^/]+$/, 'userA', 'none'],
  'career-context.create': ['POST', /^\/api\/career-context\/snapshots$/, 'userA', 'json'],
  'career-context.update': ['POST', /^\/api\/career-context\/preference$/, 'userA', 'json'],
  'career-context.delete': ['POST', /^\/api\/career-context\/items\/[^/]+\/decision$/, 'userA', 'json'],
  'career-context.snapshot': ['GET', /^\/api\/career-context\/snapshots\/[^/]+$/, 'userA', 'none'],
  'career-context.bridge': ['POST', /^\/api\/career-context\/bridges$/, 'userA', 'json'],
  'career-context.stale': ['POST', /^\/api\/career-context\/preference$/, 'userA', 'json'],
  'career-context.cross-user': ['GET', /^\/api\/career-context\/snapshots\/[^/]+$/, 'userB', 'none'],
  'admin.denied': ['GET', /^\/api\/admin\/usage$/, 'userA', 'none'],
  'cross-user.denied': ['GET', /^\/api\/interview\/sessions\/[^/]+$/, 'userB', 'none'],
  'partial-failure.malformed': ['POST', /^\/api\/resume\/score$/, 'userA', 'json'],
  'partial-failure.oversized': ['POST', /^\/api\/resume\/score$/, 'userA', 'json'],
  'partial-failure.account-delete': ['DELETE', /^\/api\/me\/data$/, 'userA', 'none'],
  'concurrency.exactly-once': ['POST', /^\/api\/interview\/sessions\/[^/]+\/answers$/, 'userA', 'json'],
  'replay.response-loss': ['POST', /^\/api\/career-context\/preference$/, 'userA', 'json'],
  'account.delete': ['DELETE', /^\/api\/me\/data$/, 'userA', 'none'],
  'account.owner-aftermath': ['GET', /^\/api\/user\/sessions$/, 'userA', 'none'],
  'account.cross-user-aftermath': ['GET', /^\/api\/interview\/sessions\/[^/]+$/, 'userB', 'none'],
}));

const requiredOperations = new Set([
  'runtime.health', 'pwa.manifest', 'pwa.offline', 'auth.identity',
  'resume.parse', 'resume.score', 'resume.suggest',
  'clearspeak.prompt', 'clearspeak.create', 'clearspeak.submit', 'clearspeak.result', 'clearspeak.cancel', 'clearspeak.history', 'clearspeak.replay', 'clearspeak.delete',
  'interview.create', 'interview.answer', 'interview.report', 'interview.version', 'interview.stale', 'interview.interrupted',
  'career-context.create', 'career-context.update', 'career-context.delete', 'career-context.snapshot', 'career-context.bridge', 'career-context.stale', 'career-context.cross-user',
  'admin.denied', 'cross-user.denied', 'partial-failure.malformed', 'partial-failure.oversized', 'partial-failure.account-delete',
  'concurrency.exactly-once', 'replay.response-loss',
  'account.delete', 'account.owner-aftermath', 'account.cross-user-aftermath',
]);

const operationStatusContracts = new Map(Object.entries({
  'runtime.health': [200], 'pwa.manifest': [200], 'pwa.offline': [200], 'auth.identity': [200],
  'resume.parse': [200], 'resume.score': [200], 'resume.suggest': [200],
  'clearspeak.prompt': [200], 'clearspeak.authority': [201], 'clearspeak.create': [200, 201], 'clearspeak.submit': [200],
  'clearspeak.result': [200], 'clearspeak.cancel': [200], 'clearspeak.history': [200],
  'clearspeak.replay': [200, 201], 'clearspeak.delete': [200, 204],
  'interview.create': [200, 201], 'interview.answer': [200], 'interview.report': [200],
  'interview.version': [200], 'interview.stale': [409], 'interview.interrupted': [200],
  'career-context.create': [200, 201], 'career-context.update': [200], 'career-context.delete': [200],
  'career-context.snapshot': [200], 'career-context.bridge': [200, 201], 'career-context.stale': [409],
  'career-context.cross-user': [403, 404], 'admin.denied': [403], 'cross-user.denied': [403, 404],
  'partial-failure.malformed': [400, 422], 'partial-failure.oversized': [400, 413, 422],
  'partial-failure.account-delete': [409, 500], 'concurrency.exactly-once': [200],
  'replay.response-loss': [200], 'account.delete': [200], 'account.owner-aftermath': [200],
  'account.cross-user-aftermath': [403, 404],
}));

if (!manifest || ![3, 4].includes(manifest.schemaVersion) || !Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0 || manifest.scenarios.length > 64) {
  fail('Scenario manifest must use supported schemaVersion 3 or 4 and contain 1-64 scenarios.');
}
const captureSchemaEnabled = manifest.schemaVersion === 4;
if (JSON.stringify(manifest).includes('__CONTROLLER_REPLACE_')) fail('Scenario manifest still contains controller placeholders.');
for (const operation of requiredOperations) {
  if (!manifest.scenarios.some((scenario) => scenario.operation === operation)) fail(`Scenario manifest is missing required governed operation: ${operation}.`);
}

const tokens = { userA: userAToken, userB: userBToken, admin: adminToken };
const results = [];
const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const allowedAssertionOps = new Set(['exists', 'equals', 'oneOf', 'type', 'matches', 'includes']);
const allowedJsonTypes = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = Number(process.env.HOSTED_ACCEPTANCE_TIMEOUT_MS ?? 30_000);
if (!Number.isInteger(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 1_000 || REQUEST_TIMEOUT_MS > 120_000) {
  fail('HOSTED_ACCEPTANCE_TIMEOUT_MS must be an integer between 1000 and 120000.');
}

function resolveAssertions(assertions) {
  return assertions?.map((assertion) => ({
    ...assertion,
    ...(Object.prototype.hasOwnProperty.call(assertion, 'value') ? { value: captureStore.resolve(assertion.value) } : {}),
  }));
}

function resolveRequestSpec(rawSpec, { allowCaptures = false } = {}) {
  if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) fail('Scenario request specification is invalid.');
  if (!allowCaptures && rawSpec.captures !== undefined) fail('Capture declarations are not allowed on this request phase.');
  const resolved = {
    ...rawSpec,
    path: captureStore.resolve(rawSpec.path),
    assertions: resolveAssertions(rawSpec.assertions),
  };
  if (rawSpec.body !== undefined) resolved.body = captureStore.resolve(rawSpec.body);
  if (rawSpec.idempotencyKey !== undefined) resolved.idempotencyKey = captureStore.resolve(rawSpec.idempotencyKey);
  if (rawSpec.multipart) {
    resolved.multipart = {
      ...rawSpec.multipart,
      fields: captureStore.resolve(rawSpec.multipart.fields ?? {}),
    };
  }
  if (rawSpec.canonicalPaths) resolved.canonicalPaths = captureStore.resolve(rawSpec.canonicalPaths);
  delete resolved.captures;
  return resolved;
}

function validateOperationContract(scenario) {
  const contract = operationContracts.get(scenario.operation);
  if (!contract) fail(`Scenario ${scenario.id} names an unregistered governed operation.`);
  const [method, pathPattern, auth, bodyKind] = contract;
  if (scenario.method?.toUpperCase() !== method || !pathPattern.test(scenario.path) || (scenario.auth ?? 'none') !== auth) {
    fail(`Scenario ${scenario.id} does not match the registered method/path/auth contract for ${scenario.operation}.`);
  }
  const actualBodyKind = scenario.multipart?.fileField ?? (scenario.body === undefined ? 'none' : 'json');
  if (actualBodyKind !== bodyKind) fail(`Scenario ${scenario.id} does not match the registered body contract for ${scenario.operation}.`);
  if (JSON.stringify(scenario.expectedStatuses) !== JSON.stringify(operationStatusContracts.get(scenario.operation))) {
    fail(`Scenario ${scenario.id} does not match the registered status contract for ${scenario.operation}.`);
  }
  if (!Array.isArray(scenario.assertions) || scenario.assertions.length === 0) fail(`Scenario ${scenario.id} does not provide the required semantic oracle for ${scenario.operation}.`);
  if (bodyKind === 'audio') {
    const metadata = scenario.multipart?.fields?.metadata;
    if (typeof metadata !== 'string') fail(`Scenario ${scenario.id} must send ClearSpeak metadata as one JSON multipart field.`);
    try { JSON.parse(metadata); } catch { fail(`Scenario ${scenario.id} has malformed ClearSpeak metadata.`); }
  }
  if (scenario.operation === 'resume.score' || scenario.operation === 'resume.suggest') {
    if (!scenario.body?.resumeData || typeof scenario.body.rawText !== 'string' || typeof scenario.body.jdText !== 'string') fail(`Scenario ${scenario.id} does not match the strict Resume request schema.`);
  }
}

function exactTargetUrl(scenarioId, scenarioPath) {
  try {
    return exactOriginUrl(originUrl, scenarioPath);
  } catch (error) {
    fail(`Scenario ${scenarioId} ${error instanceof Error ? error.message : 'has an invalid path.'}`);
  }
}

function jsonPointerValue(document, pointer) {
  if (pointer === '') return { exists: true, value: document };
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return { exists: false, value: undefined };
  let current = document;
  for (const rawPart of pointer.slice(1).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return { exists: false, value: undefined };
    current = current[part];
  }
  return { exists: true, value: current };
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateAssertions(assertions, responseData, scenarioId, phase) {
  if (!Array.isArray(assertions) || assertions.length === 0 || assertions.length > 24) fail(`Scenario ${scenarioId} ${phase} must declare semantic assertions.`);
  assertions.forEach((assertion, index) => {
    if (!assertion || !['json', 'header', 'text'].includes(assertion.source) || !allowedAssertionOps.has(assertion.op)) fail(`Scenario ${scenarioId} ${phase} assertion ${index + 1} has an invalid shape.`);
    let exists = true;
    let actual;
    if (assertion.source === 'json') {
      if (responseData.json === undefined) throw new Error(`Scenario ${scenarioId} ${phase} assertion ${index + 1} expected JSON.`);
      const resolved = jsonPointerValue(responseData.json, assertion.path ?? '');
      exists = resolved.exists;
      actual = resolved.value;
    } else if (assertion.source === 'header') {
      if (typeof assertion.name !== 'string' || !assertion.name.trim()) fail(`Scenario ${scenarioId} ${phase} assertion ${index + 1} requires a header name.`);
      actual = responseData.headers.get(assertion.name);
      exists = actual !== null;
    } else {
      actual = responseData.text;
    }
    let passed = false;
    switch (assertion.op) {
      case 'exists': passed = exists === (assertion.value ?? true); break;
      case 'equals': passed = exists && JSON.stringify(actual) === JSON.stringify(assertion.value); break;
      case 'oneOf': passed = exists && Array.isArray(assertion.value) && assertion.value.some((candidate) => JSON.stringify(candidate) === JSON.stringify(actual)); break;
      case 'type': passed = exists && allowedJsonTypes.has(assertion.value) && valueType(actual) === assertion.value; break;
      case 'matches':
        if (typeof assertion.value !== 'string' || assertion.value.length > 500) fail(`Scenario ${scenarioId} ${phase} assertion ${index + 1} has an invalid regex.`);
        passed = exists && typeof actual === 'string' && new RegExp(assertion.value).test(actual);
        break;
      case 'includes': passed = exists && typeof actual === 'string' && typeof assertion.value === 'string' && actual.includes(assertion.value); break;
      default: passed = false;
    }
    if (!passed) throw new Error(`Scenario ${scenarioId} ${phase} semantic assertion ${index + 1} failed.`);
  });
}

function validateAssertionDeclarations(assertions, scenarioId, phase) {
  if (!Array.isArray(assertions) || assertions.length === 0 || assertions.length > 24) fail(`Scenario ${scenarioId} ${phase} must declare 1-24 semantic assertions.`);
  for (const assertion of assertions) {
    if (!assertion || !['json', 'header', 'text'].includes(assertion.source) || !allowedAssertionOps.has(assertion.op)) fail(`Scenario ${scenarioId} ${phase} has an invalid assertion.`);
  }
}

function validateRequestShape(spec, scenarioId, phase) {
  if (!spec || typeof spec.path !== 'string' || typeof spec.method !== 'string' || !Array.isArray(spec.expectedStatuses)) fail(`Scenario ${scenarioId} ${phase} has an invalid request shape.`);
  const method = spec.method.toUpperCase();
  if (!allowedMethods.has(method)) fail(`Scenario ${scenarioId} ${phase} uses an unsupported method.`);
  if (spec.expectedStatuses.length === 0 || !spec.expectedStatuses.every((status) => Number.isInteger(status) && status >= 100 && status <= 599)) fail(`Scenario ${scenarioId} ${phase} must declare bounded HTTP status expectations.`);
  const auth = spec.auth ?? 'none';
  if (!['none', 'userA', 'userB', 'admin'].includes(auth)) fail(`Scenario ${scenarioId} ${phase} has an invalid auth selector.`);
  if (auth === 'admin' && !adminToken) fail(`Scenario ${scenarioId} ${phase} requires MOCKMATE_TEST_ADMIN_TOKEN.`);
  validateAssertionDeclarations(spec.assertions, scenarioId, phase);
  return { method, auth, targetUrl: exactTargetUrl(scenarioId, spec.path) };
}

function prepareRequest(spec, scenarioId, phase) {
  const { method, auth, targetUrl } = validateRequestShape(spec, scenarioId, phase);
  const headers = { Accept: 'application/json', Origin: origin };
  if (auth !== 'none') headers.Authorization = `Bearer ${tokens[auth]}`;
  if (spec.idempotencyKey) headers['Idempotency-Key'] = spec.idempotencyKey;
  let requestBody;
  let uploadBuffer;
  let jsonBuffer;
  if (spec.multipart) {
    const { fileEnv, fileField, filename, contentType, fields = {} } = spec.multipart;
    if (!['RESUME_FIXTURE_PATH', 'CLEARSPEAK_FIXTURE_PATH'].includes(fileEnv) || !['resume', 'audio'].includes(fileField) || typeof filename !== 'string' || typeof contentType !== 'string') fail(`Scenario ${scenarioId} ${phase} has an invalid multipart declaration.`);
    const fixturePath = requireValue(fileEnv);
    const stat = fs.statSync(fixturePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_UPLOAD_BYTES) fail(`Scenario ${scenarioId} ${phase} multipart fixture must be 1-${MAX_UPLOAD_BYTES} bytes.`);
    uploadBuffer = fs.readFileSync(fixturePath);
    const form = new FormData();
    form.append(fileField, new Blob([uploadBuffer], { type: contentType }), filename);
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 4096) fail(`Scenario ${scenarioId} ${phase} has an invalid multipart field.`);
      form.append(key, value);
    }
    requestBody = form;
  } else if (spec.body !== undefined) {
    jsonBuffer = Buffer.from(JSON.stringify(spec.body));
    if (jsonBuffer.byteLength > MAX_RESPONSE_BYTES) fail(`Scenario ${scenarioId} ${phase} JSON body is oversized.`);
    headers['Content-Type'] = 'application/json';
    requestBody = jsonBuffer;
  }
  const prepared = { method, targetUrl, headers, requestBody, cleanup: undefined };
  prepared.cleanup = () => {
    uploadBuffer?.fill(0);
    jsonBuffer?.fill(0);
    prepared.requestBody = undefined;
    uploadBuffer = undefined;
    jsonBuffer = undefined;
    requestBody = undefined;
  };
  return prepared;
}

async function executeRequest(spec, scenarioId, phase) {
  const prepared = prepareRequest(spec, scenarioId, phase);
  let responseData;
  try {
    responseData = await boundedRequest(prepared.targetUrl, { method: prepared.method, headers: prepared.headers, redirect: 'manual', body: prepared.requestBody }, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    });
  } finally {
    prepared.cleanup();
  }
  try {
    const text = responseData.body.toString('utf8');
    let json;
    if (text) {
      try { json = JSON.parse(text); } catch { json = undefined; }
    }
    if (!spec.expectedStatuses.includes(responseData.status)) throw new Error(`Scenario ${scenarioId} ${phase} returned unexpected status ${responseData.status}.`);
    validateAssertions(spec.assertions, { json, headers: responseData.headers, text }, scenarioId, phase);
    const canonical = (spec.canonicalPaths ?? []).map((pointer) => jsonPointerValue(json, pointer).value);
    return { status: responseData.status, canonical, json };
  } finally {
    responseData.body.fill(0);
  }
}

async function executeAbandonedRequest(spec, scenarioId, phase) {
  const prepared = prepareRequest(spec, scenarioId, phase);
  try {
    const response = await boundedAbandonedRequest(prepared.targetUrl, {
      method: prepared.method,
      headers: prepared.headers,
      redirect: 'manual',
      body: prepared.requestBody,
    }, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (!spec.expectedStatuses.includes(response.status)) throw new Error(`Scenario ${scenarioId} ${phase} returned unexpected status ${response.status}.`);
    return { status: response.status };
  } finally {
    prepared.cleanup();
  }
}

function executionPlan(scenario) {
  const execution = scenario.execution ?? { mode: 'single', attempts: 1 };
  if (!['single', 'parallel', 'sequential'].includes(execution.mode)) fail(`Scenario ${scenario.id} has an invalid execution mode.`);
  const attempts = execution.attempts ?? 1;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) fail(`Scenario ${scenario.id} must use 1-5 bounded attempts.`);
  if (scenario.family === 'concurrency' && (execution.mode !== 'parallel' || attempts < 2 || !scenario.verification)) fail(`Concurrency scenario ${scenario.id} requires 2-5 parallel attempts and a semantic state verification probe.`);
  if (scenario.family === 'replay' && (execution.mode !== 'sequential' || attempts < 2 || !scenario.verification)) fail(`Replay scenario ${scenario.id} requires 2-5 sequential attempts and a semantic state verification probe.`);
  if (scenario.family !== 'concurrency' && scenario.family !== 'replay' && execution.mode !== 'single') fail(`Scenario ${scenario.id} may use repeated execution only for concurrency/replay families.`);
  return { mode: execution.mode, attempts };
}

function validateCapturePlacement(rawScenario, plan) {
  if (rawScenario.verification?.captures !== undefined) fail(`Scenario ${rawScenario.id} verification cannot declare captures.`);
  if (rawScenario.captures !== undefined && !captureSchemaEnabled) fail(`Scenario ${rawScenario.id} capture declarations require schemaVersion 4.`);
  if (rawScenario.captures !== undefined && (plan.mode !== 'single' || plan.attempts !== 1 || rawScenario.family === 'concurrency' || rawScenario.family === 'replay')) {
    fail(`Scenario ${rawScenario.id} may capture only from an ordinary single successful request.`);
  }
}

async function requestScenario(rawScenario) {
  if (!rawScenario || typeof rawScenario.id !== 'string' || typeof rawScenario.family !== 'string' || typeof rawScenario.operation !== 'string' || typeof rawScenario.path !== 'string' || typeof rawScenario.method !== 'string') fail('Scenario manifest contains an invalid scenario shape.');
  const plan = executionPlan(rawScenario);
  validateCapturePlacement(rawScenario, plan);

  const scenario = resolveRequestSpec(rawScenario, { allowCaptures: true });
  scenario.id = rawScenario.id;
  scenario.family = rawScenario.family;
  scenario.operation = rawScenario.operation;
  scenario.method = rawScenario.method;
  scenario.auth = rawScenario.auth;
  scenario.expectedStatuses = rawScenario.expectedStatuses;

  validateOperationContract(scenario);
  validateRequestShape(scenario, scenario.id, 'request');

  const statuses = [];
  const canonical = [];
  let captureJson;

  if (plan.mode === 'parallel') {
    const attempts = await Promise.all(Array.from({ length: plan.attempts }, (_, index) => executeRequest(scenario, scenario.id, `parallel attempt ${index + 1}`)));
    statuses.push(...attempts.map((attempt) => attempt.status));
    canonical.push(...attempts.map((attempt) => attempt.canonical));
  } else if (rawScenario.family === 'replay') {
    const abandoned = await executeAbandonedRequest(scenario, scenario.id, 'abandoned first response');
    statuses.push(abandoned.status);
    for (let index = 1; index < plan.attempts; index += 1) {
      const attempt = await executeRequest(scenario, scenario.id, `recovery attempt ${index + 1}`);
      statuses.push(attempt.status);
      canonical.push(attempt.canonical);
    }
  } else {
    for (let index = 0; index < plan.attempts; index += 1) {
      const attempt = await executeRequest(scenario, scenario.id, `${plan.mode} attempt ${index + 1}`);
      statuses.push(attempt.status);
      canonical.push(attempt.canonical);
      if (plan.attempts === 1) captureJson = attempt.json;
    }
  }

  if (rawScenario.captures !== undefined) {
    if (captureJson === undefined) throw new Error(`Scenario ${scenario.id} capture source was not valid JSON.`);
    captureStore.captureFromResponse(scenario.id, rawScenario.captures, captureJson);
  }
  captureJson = undefined;

  let verificationStatus;
  if (rawScenario.verification) {
    const verificationSpec = resolveRequestSpec(rawScenario.verification, { allowCaptures: false });
    validateRequestShape(verificationSpec, scenario.id, 'post-state verification');
    const verification = await executeRequest(verificationSpec, scenario.id, 'post-state verification');
    verificationStatus = verification.status;
  }

  if (plan.attempts > 1) {
    if (typeof scenario.idempotencyKey !== 'string' || scenario.idempotencyKey.length < 8 || scenario.idempotencyKey.length > 128) fail(`Scenario ${scenario.id} requires a stable bounded idempotency identity.`);
    if (!Array.isArray(scenario.canonicalPaths) || scenario.canonicalPaths.length === 0 || scenario.canonicalPaths.length > 12) fail(`Scenario ${scenario.id} requires bounded canonical response paths.`);
    if (canonical.length === 0 || !canonical.every((value) => JSON.stringify(value) === JSON.stringify(canonical[0]))) throw new Error(`Scenario ${scenario.id} canonical responses diverged.`);
    const verificationAssertions = resolveAssertions(rawScenario.verification.assertions);
    const provesOneEffect = verificationAssertions.some((assertion) => assertion.op === 'equals' && assertion.value === 1);
    if (!provesOneEffect) fail(`Scenario ${scenario.id} post-state oracle must prove exactly one authoritative effect.`);
  }

  results.push({ id: scenario.id, family: scenario.family, executionMode: plan.mode, attempts: plan.attempts, statuses, verificationStatus, passed: true });
}

async function boundedPreflight(pathname, options) {
  return boundedRequest(exactOriginUrl(originUrl, pathname), options, { timeoutMs: REQUEST_TIMEOUT_MS, maxResponseBytes: MAX_RESPONSE_BYTES });
}

async function preflight() {
  const health = await boundedPreflight('/api/health', { headers: { Accept: 'application/json', Origin: origin }, redirect: 'manual' });
  try {
    if (health.status !== 200) throw new Error(`Preview health returned ${health.status}.`);
    let body;
    try { body = JSON.parse(health.body.toString('utf8')); } catch { throw new Error('Preview health did not return valid JSON.'); }
    if (body?.mode !== 'preview' || body?.authority !== 'configured' || body?.previewTargetId !== previewTargetId || body?.supabaseProjectRef !== supabaseProjectRef || body?.gitHeadSha !== expectedHeadSha) {
      throw new Error('Preview health authority does not match the explicitly authorized origin, project, target and Git head.');
    }
  } finally { health.body.fill(0); }

  const unauthorized = await boundedPreflight('/api/auth/test', { headers: { Accept: 'application/json', Origin: origin }, redirect: 'manual' });
  try {
    if (unauthorized.status !== 401) throw new Error(`Protected unauthenticated probe returned ${unauthorized.status}; expected 401.`);
  } finally { unauthorized.body.fill(0); }

  const hostileOrigin = 'https://mockmate-hostile-origin.invalid';
  const hostile = await boundedPreflight('/api/health', { headers: { Accept: 'application/json', Origin: hostileOrigin }, redirect: 'manual' });
  try {
    const allowOrigin = hostile.headers.get('access-control-allow-origin');
    if (allowOrigin === hostileOrigin || allowOrigin === '*') throw new Error('Hostile origin was accepted by CORS.');
  } finally { hostile.body.fill(0); }

  const preflightResponse = await boundedPreflight('/api/health', {
    method: 'OPTIONS', headers: { Origin: hostileOrigin, 'Access-Control-Request-Method': 'GET' }, redirect: 'manual',
  });
  try {
    const allowOrigin = preflightResponse.headers.get('access-control-allow-origin');
    if (allowOrigin === hostileOrigin || allowOrigin === '*') throw new Error('Hostile CORS preflight was accepted.');
  } finally { preflightResponse.body.fill(0); }
}

let runError;
try {
  await preflight();
  for (const scenario of manifest.scenarios) await requestScenario(scenario);
} catch (error) {
  runError = error;
} finally {
  captureStore.clear();
}

if (runError) {
  console.error(`[HOSTED_PREVIEW_ACCEPTANCE_FAILED] ${runError instanceof Error ? runError.message : 'Unknown failure'}`);
  process.exit(1);
}

const evidence = {
  schemaVersion: manifest.schemaVersion,
  generatedAt: new Date().toISOString(),
  expectedHeadSha,
  previewOriginHost: originUrl.hostname,
  previewTargetId,
  supabaseProjectRef,
  scenarioManifestSha256: crypto.createHash('sha256').update(fs.readFileSync(scenarioFile)).digest('hex'),
  results,
  summary: { total: results.length, passed: results.filter((result) => result.passed).length },
};

const artifactPath = path.resolve(process.env.HOSTED_ACCEPTANCE_EVIDENCE_FILE || 'artifacts/p0-8-hosted-preview-acceptance.json');
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
const digest = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
console.log(`[HOSTED_PREVIEW_ACCEPTANCE_OK] ${results.length} scenarios passed semantic/state acceptance; evidence_sha256=${digest}`);
