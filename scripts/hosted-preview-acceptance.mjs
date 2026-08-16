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
if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
  fail('Scenario manifest must use schemaVersion 1 and contain scenarios.');
}
for (const family of requiredFamilies) {
  if (!manifest.scenarios.some((scenario) => scenario.family === family)) fail(`Scenario manifest is missing required family: ${family}.`);
}

const tokens = { userA: userAToken, userB: userBToken, admin: adminToken };
const results = [];

async function requestScenario(scenario) {
  if (!scenario || typeof scenario.id !== 'string' || typeof scenario.path !== 'string' || typeof scenario.method !== 'string' || !Array.isArray(scenario.expectedStatuses)) {
    fail('Scenario manifest contains an invalid scenario shape.');
  }
  if (!scenario.path.startsWith('/')) fail(`Scenario ${scenario.id} path must be relative to the authorized origin.`);
  const auth = scenario.auth ?? 'none';
  if (!['none', 'userA', 'userB', 'admin'].includes(auth)) fail(`Scenario ${scenario.id} has an invalid auth selector.`);
  if (auth === 'admin' && !adminToken) fail(`Scenario ${scenario.id} requires MOCKMATE_TEST_ADMIN_TOKEN.`);

  const headers = { Accept: 'application/json', Origin: origin };
  if (auth !== 'none') headers.Authorization = `Bearer ${tokens[auth]}`;
  if (scenario.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(new URL(scenario.path, origin), {
    method: scenario.method.toUpperCase(),
    headers,
    redirect: 'manual',
    body: scenario.body === undefined ? undefined : JSON.stringify(scenario.body),
  });
  const passed = scenario.expectedStatuses.includes(response.status);
  results.push({ id: scenario.id, family: scenario.family, status: response.status, passed });
  if (!passed) throw new Error(`Scenario ${scenario.id} returned unexpected status ${response.status}.`);
}

async function preflight() {
  const health = await fetch(new URL('/api/health', origin), { headers: { Accept: 'application/json', Origin: origin }, redirect: 'manual' });
  if (health.status !== 200) throw new Error(`Preview health returned ${health.status}.`);
  const body = await health.json();
  if (body?.mode !== 'preview' || body?.authority !== 'configured' || body?.previewTargetId !== previewTargetId || body?.supabaseProjectRef !== supabaseProjectRef) {
    throw new Error('Preview health authority does not match the explicitly authorized target.');
  }

  const unauthorized = await fetch(new URL('/api/auth/test', origin), { headers: { Accept: 'application/json', Origin: origin }, redirect: 'manual' });
  if (unauthorized.status !== 401) throw new Error(`Protected unauthenticated probe returned ${unauthorized.status}; expected 401.`);

  const hostileOrigin = 'https://mockmate-hostile-origin.invalid';
  const hostile = await fetch(new URL('/api/health', origin), { headers: { Accept: 'application/json', Origin: hostileOrigin }, redirect: 'manual' });
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
  schemaVersion: 1,
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
console.log(`[HOSTED_PREVIEW_ACCEPTANCE_OK] ${results.length} scenarios passed; evidence_sha256=${digest}`);
