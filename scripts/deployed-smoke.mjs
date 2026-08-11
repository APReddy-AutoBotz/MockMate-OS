const rawTarget = process.env.DEPLOY_URL || process.argv[2];

if (!rawTarget) {
  console.log('No remote target supplied; running the target-agnostic contract against the disposable local server.');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('npm',['run','smoke:production'],{stdio:'inherit',shell:process.platform==='win32'});
  process.exit(result.status ?? 1);
}
if (!/^https:\/\//.test(rawTarget) || process.env.AUTHORIZE_HOSTED_PREVIEW_SMOKE !== 'true') {
  console.error('Remote smoke is blocked: HTTPS target and explicit AP authorization are required.');
  process.exit(2);
}

const target = rawTarget.replace(/\/+$/, '');

async function request(path, options = {}) {
  const res = await fetch(`${target}${path}`, options);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep plain text body.
  }
  return { status: res.status, body };
}

function expectStatus(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} expected ${expected}, received ${actual}`);
  }
}

const manifest = await request('/manifest.json');
expectStatus('GET /manifest.json', manifest.status, 200);
if (manifest.body?.display !== 'standalone') {
  throw new Error('PWA manifest display must be standalone');
}
if (!manifest.body?.icons?.some(icon => String(icon.purpose || '').includes('maskable'))) {
  throw new Error('PWA manifest needs a maskable icon');
}

const health = await request('/api/health');
expectStatus('GET /api/health', health.status, 200);
if (!health.body?.ok) throw new Error('/api/health did not return ok=true');
if (!['preview','production'].includes(health.body?.mode)) throw new Error('Target is not reporting production-like mode');

expectStatus('GET /api/me/usage without auth', (await request('/api/me/usage')).status, 401);
expectStatus('GET /api/admin/usage without auth', (await request('/api/admin/usage')).status, 401);
expectStatus(
  'POST /api/resume/score without auth',
  (await request('/api/resume/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })).status,
  401,
);

const testTokenStatus = (await request('/api/me/usage', {
  headers: { Authorization: 'Bearer test-token' },
})).status;
if (![401, 503].includes(testTokenStatus)) {
  throw new Error(`test-token must be rejected on deployed preview, received ${testTokenStatus}`);
}

console.log(`Deployed smoke checks passed for ${target}`);
