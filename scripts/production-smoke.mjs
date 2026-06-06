import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const apiPort = Number(process.env.SMOKE_API_PORT || 3055);
const baseUrl = `http://127.0.0.1:${apiPort}`;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep plain text body.
  }
  return { status: res.status, body };
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const res = await request('/api/health');
      if (res.status === 200 && res.body?.ok) return;
    } catch {
      // Server is still starting.
    }
    await wait(500);
  }
  throw new Error('API health check did not become ready');
}

async function expectStatus(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} expected ${expected}, received ${actual}`);
  }
}

async function run() {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  if (manifest.display !== 'standalone') throw new Error('PWA manifest display must be standalone');
  if (!manifest.icons?.some(icon => String(icon.purpose || '').includes('maskable'))) {
    throw new Error('PWA manifest needs a maskable icon');
  }

  const api = spawn(process.execPath, ['dist/localServer.js'], {
    cwd: new URL('../backend/', import.meta.url),
    env: {
      ...process.env,
      PORT: String(apiPort),
      NODE_ENV: 'production',
      ENABLE_DEV_AUTH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  api.stdout.on('data', chunk => { output += chunk.toString(); });
  api.stderr.on('data', chunk => { output += chunk.toString(); });

  try {
    await waitForHealth();

    await expectStatus('GET /api/me/usage without auth', (await request('/api/me/usage')).status, 401);
    await expectStatus('GET /api/admin/usage without auth', (await request('/api/admin/usage')).status, 401);
    await expectStatus(
      'POST /api/resume/score without auth',
      (await request('/api/resume/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })).status,
      401,
    );

    const devTokenStatus = (await request('/api/me/usage', {
      headers: { Authorization: 'Bearer test-token' },
    })).status;
    if (![401, 503].includes(devTokenStatus)) {
      throw new Error(`test-token must be rejected in production, received ${devTokenStatus}`);
    }

    console.log('Production smoke checks passed');
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    api.kill('SIGTERM');
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
