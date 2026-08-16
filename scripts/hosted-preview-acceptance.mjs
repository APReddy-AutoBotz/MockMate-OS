import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

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
  originUrl = new URL(origin);
} catch {
  fail('MOCKMATE_PREVIEW_ORIGIN must be an absolute URL.');
}
if (originUrl.protocol !== 'https:' || originUrl.username || originUrl.password || originUrl.port || originUrl.pathname !== '/' || originUrl.search || originUrl.hash || !originUrl.hostname.endsWith('.vercel.app')) {
  fail('MOCKMATE_PREVIEW_ORIGIN must be an exact HTTPS Vercel origin.');
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

const requiredFamilies = new Set([
  'runtime', 'pwa', 'auth', 'resume', 'clearspeak', 'interview', 'career-context',
  'account-deletion', 'admin-privacy', 'concurrency', 'replay', 'cross-user-isolation',
]);
if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
  fail('Scenario manifest must use schemaVersion 2 and contain scenarios.');
}
if (JSON.stringify(manifest).includes('__CONTROLLER_REPLACE__')) {
  fail('Scenario manifest still contains controller placeholders.');
}
for (const family of requiredFamilies) {
  if (!manifest.scenarios.some((scenario) => scenario.family === family)) fail(`Scenario manifest is missing required family: ${family}.`);
}

const tokens = { userA: userAToken, userB: userBToken, admin: adminToken };
const results = [];
const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const allowedAssertionOps = new Set(['exists', 'equals', 'oneOf', 'type', 'matches', 'includes']);
const allowedJsonTypes = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);

function exactTargetUrl(scenarioId, scenarioPath) {
  if (!scenarioPath.startsWith('/') || scenarioPath.startsWith('//') || scenarioPath.includes('\\')) {
    fail(`Scenario ${scenarioId} path must be a single-slash relative path on the authorized origin.`);
  }
  let resolved;
  try {
    resolved = new URL(scenarioPath, originUrl);
  } catch {
    fail(`Scenario ${scenarioId} path is not a valid relative URL.`);
  }
  if (resolved.origin !== originUrl.origin || resolved.username || resolved.password) {
    fail(`Scenario ${scenarioId} resolved outside the authorized origin.`);
  }
  return resolved;
}

function jsonPointerValue(document, pointer) {
  if (pointer === '') return { exists: true, value: document };
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return { exists: false, value: undefined };
  let current = document;
  for (const rawPart of pointer.slice(1).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { exists: false, value: undefined };
    }
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
  if (!Array.isArray(assertions) || assertions.length === 0) {
    fail(`Scenario ${scenarioId} ${phase} must declare semantic assertions.`);
  }
  assertions.forEach((assertion, index) => {
    if (!assertion || !['json', 'header', 'text'].includes(assertion.source) || !allowedAssertionOps.has(assertion.op)) {
      fail(`Scenario ${scenarioId} ${phase} assertion ${index + 1} has an invalid shape.`);
    }

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
      case 'exists':
        passed = exists === (assertion.value ?? true);
        break;
      case 'equals':
        passed = exists && JSON.stringify(actual) === JSON.stringify(assertion.value);
        break;
      case 'oneOf':
        passed = exists && Array.isArray(assertion.value) && assertion.value.some((candidate) => JSON.stringify(candidate) === JSON.stringify(actual));
        break;
      case 'type':
        passed = exists && allowedJsonTypes.has(assertion.value) && valueType(actual) === assertion.value;
        break;
      case 'matches':
        if (typeof assertion.value !== 'string' || assertion.value.length > 500) fail(`Scenario ${scenarioId} ${phase} assertion ${index + 1} has an invalid regex.`);
        passed = exists && typeof actual === 'string' && new RegExp(assertion.value).test(actual);
        break;
      case 'includes':
        passed = exists && typeof actual === 'string' && typeof assertion.value === 'string' && actual.includes(assertion.value);
        break;
      default:
        passed = false;
    }
    if (!passed) throw new Error(`Scenario ${scenarioId} ${phase} semantic assertion ${index + 1} failed.`);
  });
}

function validateRequestShape(spec, scenarioId, phase) {
  if (!spec || typeof spec.path !== 'string' || typeof spec.method !== 'string' || !Array.isArray(spec.expectedStatuses)) {
    fail(`Scenario ${scenarioId} ${phase} has an invalid request shape.`);
  }
  const method = spec.method.toUpperCase();
  if (!allowedMethods.has(method)) fail(`Scenario ${scenarioId} ${phase} uses an unsupported method.`);
  if (spec.expectedStatuses.length === 0 || !spec.expectedStatuses.every((status) => Number.isInteger(status) && status >= 100 && status <= 599)) {
    fail(`Scenario ${scenarioId} ${phase} must declare bounded HTTP status expectations.`);
  }
  const auth = spec.auth ?? 'none';
  if (!['none', 'userA', 'userB', 'admin'].includes(auth)) fail(`Scenario ${scenarioId} ${phase} has an invalid auth selector.`);
  if (auth === 'admin' && !adminToken) fail(`Scenario ${scenarioId} ${phase} requires MOCKMATE_TEST_ADMIN_TOKEN.`);
  validateAssertions(spec.assertions, { json: {}, headers: new Headers(), text: '' }, scenarioId, `${phase} declaration`);
  return { method, auth, targetUrl: exactTargetUrl(scenarioId, spec.path) };
}

async function executeRequest(spec, scenarioId, phase) {
  const method = spec.method.toUpperCase();
  if (!allowedMethods.has(method)) fail(`Scenario ${scenarioId} ${phase} uses an unsupported method.`);
  if (!Array.isArray(spec.expectedStatuses) || spec.expectedStatuses.length === 0 || !spec.expectedStatuses.every((status) => Number.isInteger(status) && status >= 100 && status <= 599)) {
    fail(`Scenario ${scenarioId} ${phase} must declare bounded HTTP status expectations.`);
  }
  const targetUrl = exactTargetUrl(scenarioId, spec.path);
  const auth = spec.auth ?? 'none';
  if (!['none', 'userA', 'userB', 'admin'].includes(auth)) fail(`Scenario ${scenarioId} ${phase} has an invalid auth selector.`);
  if (auth === 'admin' && !adminToken) fail(`Scenario ${scenarioId} ${phase} requires MOCKMATE_TEST_ADMIN_TOKEN.`);
  if (!Array.isArray(spec.assertions) || spec.assertions.length === 0) fail(`Scenario ${scenarioId} ${phase} must declare semantic assertions.`);

  const headers = { Accept: 'application/json', Origin: origin };
  if (auth !== 'none') headers.Authorization = `Bearer ${tokens[auth]}`;
  if (spec.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(targetUrl, {
    method,
    headers,
    redirect: 'manual',
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  });
  const text = await response.text();
  let json;
  if (text) {
    try { json = JSON.parse(text); } catch { json = undefined; }
  }
  if (!spec.expectedStatuses.includes(response.status)) throw new Error(`Scenario ${scenarioId} ${phase} returned unexpected status ${response.status}.`);
  validateAssertions(spec.assertions, { json, headers: response.headers, text }, scenarioId, phase);
  return { status: response.status };
}

function executionPlan(scenario) {
  const execution = scenario.execution ?? { mode: 'single', attempts: 1 };
  if (!['single', 'parallel', 'sequential'].includes(execution.mode)) fail(`Scenario ${scenario.id} has an invalid execution mode.`);
  const attempts = execution.attempts ?? 1;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) fail(`Scenario ${scenario.id} must use 1-5 bounded attempts.`);
  if (scenario.family === 'concurrency' && (execution.mode !== 'parallel' || attempts < 2 || !scenario.verification)) {
    fail(`Concurrency scenario ${scenario.id} requires 2-5 parallel attempts and a semantic state verification probe.`);
  }
  if (scenario.family === 'replay' && (execution.mode !== 'sequential' || attempts < 2 || !scenario.verification)) {
    fail(`Replay scenario ${scenario.id} requires 2-5 sequential attempts and a semantic state verification probe.`);
  }
  if (scenario.family !== 'concurrency' && scenario.family !== 'replay' && execution.mode !== 'single') {
    fail(`Scenario ${scenario.id} may use repeated execution only for concurrency/replay families.`);
  }
  return { mode: execution.mode, attempts };
}

async function requestScenario(scenario) {
  if (!scenario || typeof scenario.id !== 'string' || typeof scenario.family !== 'string' || typeof scenario.path !== 'string' || typeof scenario.method !== 'string') {
    fail('Scenario manifest contains an invalid scenario shape.');
  }
  const plan = executionPlan(scenario);
  const statuses = [];
  if (plan.mode === 'parallel') {
    const attempts = await Promise.all(Array.from({ length: plan.attempts }, (_, index) => executeRequest(scenario, scenario.id, `parallel attempt ${index + 1}`)));
    statuses.push(...attempts.map((attempt) => attempt.status));
  } else {
    for (let index = 0; index < plan.attempts; index += 1) {
      const attempt = await executeRequest(scenario, scenario.id, `${plan.mode} attempt ${index + 1}`);
      statuses.push(attempt.status);
    }
  }

  let verificationStatus;
  if (scenario.verification) {
    const verification = await executeRequest(scenario.verification, scenario.id, 'post-state verification');
    verificationStatus = verification.status;
  }

  results.push({
    id: scenario.id,
    family: scenario.family,
    executionMode: plan.mode,
    attempts: plan.attempts,
    statuses,
    verificationStatus,
    passed: true,
  });
}

async function preflight() {
  const health = await fetch(new URL('/api/health', originUrl), { headers: { Accept: 'application/json', Origin: origin }, redirect: 'manual' });
  if (health.status !== 200) throw new Error(`Preview health returned ${health.status}.`);
  const body = await health.json();
  if (body?.mode !== 'preview' || body?.authority !== 'configured' || body?.previewTargetId !== previewTargetId || body?.supabaseProjectRef !== supabaseProjectRef || body?.gitHeadSha !== expectedHeadSha) {
    throw new Error('Preview health authority does not match the explicitly authorized origin, project, target and Git head.');
  }

  const unauthorized = await fetch(new URL('/api/auth/test', originUrl), { headers: { Accept: 'application/json', Origin: origin }, redirect: 'manual' });
  if (unauthorized.status !== 401) throw new Error(`Protected unauthenticated probe returned ${unauthorized.status}; expected 401.`);

  const hostileOrigin = 'https://mockmate-hostile-origin.invalid';
  const hostile = await fetch(new URL('/api/health', originUrl), { headers: { Accept: 'application/json', Origin: hostileOrigin }, redirect: 'manual' });
  const allowOrigin = hostile.headers.get('access-control-allow-origin');
  if (allowOrigin === hostileOrigin || allowOrigin === '*') throw new Error('Hostile origin was accepted by CORS.');
}

try {
  await preflight();
  for (const scenario of manifest.scenarios) await requestScenario(scenario);
} catch (error) {
  console.error(`[HOSTED_PREVIEW_ACCEPTANCE_FAILED] ${error instanceof Error ? error.message : 'Unknown failure'}`);
  process.exit(1);
}

const evidence = {
  schemaVersion: 2,
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
