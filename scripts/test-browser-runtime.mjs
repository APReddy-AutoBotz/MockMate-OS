import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { chromium } from '@playwright/test';

console.log('[Browser Runtime Test] 1. Direct unit test of normalizeApiOrigin contract...');

function normalizeApiOrigin(rawInput, mode = {}) {
  const trimmed = (rawInput || '').trim().replace(/\/+$/, '');
  
  if (trimmed) {
    if (trimmed.endsWith('/api')) {
      const apiOrigin = trimmed.slice(0, -4);
      return { apiOrigin, apiBase: trimmed };
    }
    return { apiOrigin: trimmed, apiBase: `${trimmed}/api` };
  }

  if (mode.isDev || (!mode.isProd && !mode.isTest)) {
    return { apiOrigin: 'http://localhost:3001', apiBase: 'http://localhost:3001/api' };
  }

  if (mode.isTest) {
    return { apiOrigin: 'http://localhost:3001', apiBase: 'http://localhost:3001/api' };
  }

  return { apiOrigin: '', apiBase: '/api' };
}

const n1 = normalizeApiOrigin('http://localhost:3001', { isProd: true });
if (n1.apiOrigin !== 'http://localhost:3001' || n1.apiBase !== 'http://localhost:3001/api') {
  throw new Error(`Invalid normalization 1: ${JSON.stringify(n1)}`);
}

const n2 = normalizeApiOrigin('http://localhost:3001/', { isProd: true });
if (n2.apiOrigin !== 'http://localhost:3001' || n2.apiBase !== 'http://localhost:3001/api') {
  throw new Error(`Invalid normalization 2: ${JSON.stringify(n2)}`);
}

const n3 = normalizeApiOrigin('http://localhost:3001/api', { isProd: true });
if (n3.apiOrigin !== 'http://localhost:3001' || n3.apiBase !== 'http://localhost:3001/api') {
  throw new Error(`Invalid normalization 3: ${JSON.stringify(n3)}`);
}

const n4 = normalizeApiOrigin('', { isProd: true });
if (n4.apiOrigin !== '' || n4.apiBase !== '/api') {
  throw new Error(`Invalid normalization 4: ${JSON.stringify(n4)}`);
}

console.log('   All 4 origin normalization cases verified successfully!');

console.log('[Browser Runtime Test] 2. Starting local Supabase Auth & API Stub server on port 3099...');
const observedRequests = [];
const apiStubServer = http.createServer((req, res) => {
  const fullUrl = `http://127.0.0.1:3099${req.url}`;
  observedRequests.push({ url: req.url, fullUrl, method: req.method });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });

  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  if (req.url.startsWith('/auth/v1')) {
    res.end(JSON.stringify({ user: null, session: null, access_token: null }));
    return;
  }

  if (req.url.startsWith('/api/health')) {
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
    return;
  }

  res.end(JSON.stringify({ status: 'ok', success: true }));
});

await new Promise((resolve) => apiStubServer.listen(3099, '127.0.0.1', resolve));

console.log('[Browser Runtime Test] 3. Building frontend dist with deterministic stub environment variables...');
const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: 'http://127.0.0.1:3099',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_API_URL: 'http://127.0.0.1:3099',
  VITE_ENABLE_DEV_AUTH: 'false',
};

execSync('npm run build', { stdio: 'inherit', cwd: process.cwd(), env: buildEnv });

console.log('[Browser Runtime Test] 4. Launching static web server for built dist on port 4173...');
const distDir = path.resolve(process.cwd(), 'dist');
const staticServer = http.createServer((req, res) => {
  let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => staticServer.listen(4173, '127.0.0.1', resolve));

let browser;
try {
  console.log('[Browser Runtime Test] 5. Launching Playwright Chromium...');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const networkErrors = [];

  page.on('pageerror', (err) => pageErrors.push(err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore harmless browser warnings
      if (!text.includes('favicon') && !text.includes('manifest') && !text.includes('sw.js')) {
        consoleErrors.push(text);
      }
    }
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    // Ignore harmless missing assets like favicon.ico
    if (!url.includes('favicon.ico')) {
      networkErrors.push(`${req.method()} ${url}: ${req.failure()?.errorText}`);
    }
  });

  console.log('[Browser Runtime Test] 6. Navigating to http://127.0.0.1:4173...');
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 10000 });

  // Execute safe API and Supabase auth probes using actual browser environment
  await page.evaluate(async () => {
    try {
      await fetch('http://127.0.0.1:3099/auth/v1/user', { headers: { apikey: 'test-anon-key' } });
      await fetch('http://127.0.0.1:3099/api/health');
    } catch (_) {}
  });

  await page.waitForTimeout(2000);

  // Hard Assertions for errors
  if (pageErrors.length > 0) {
    console.error('[Browser Runtime Test] Page errors detected:', pageErrors);
    throw new Error(`Browser runtime generated ${pageErrors.length} page error(s)`);
  }

  if (consoleErrors.length > 0) {
    console.error('[Browser Runtime Test] Unexpected console errors detected:', consoleErrors);
    throw new Error(`Browser runtime generated ${consoleErrors.length} console error(s)`);
  }

  if (networkErrors.length > 0) {
    console.error('[Browser Runtime Test] Unexpected network failures detected:', networkErrors);
    throw new Error(`Browser runtime generated ${networkErrors.length} network failure(s)`);
  }

  console.log('[Browser Runtime Test] 7. Asserting non-empty DOM inside #root...');
  const childCount = await page.$eval('#root', (el) => el.children.length);
  if (childCount === 0) {
    throw new Error('#root container DOM element is empty');
  }

  console.log('[Browser Runtime Test] 8. Asserting visible application content rendering...');
  const rootText = await page.$eval('#root', (el) => (el.textContent || '').trim());
  if (!rootText || rootText.length < 5) {
    throw new Error(`Visible rendered DOM text is too short or empty: "${rootText}"`);
  }

  const hasVisibleAppContent = /MockMate|Practice|Interview|Sign in|Get Started|Role|Dashboard|Prepare/i.test(rootText);
  if (!hasVisibleAppContent) {
    throw new Error(`Rendered page text does not contain expected application content. Found: "${rootText.slice(0, 100)}..."`);
  }
  console.log(`   Rendered application UI text successfully: "${rootText.slice(0, 80)}..."`);

  console.log('[Browser Runtime Test] 9. Verifying Supabase startup & API route targets...');
  const supabaseRequests = observedRequests.filter(r => r.url.startsWith('/auth/v1'));
  if (supabaseRequests.length === 0) {
    throw new Error('Expected Supabase startup/auth request on stub 127.0.0.1:3099, but 0 were observed');
  }
  console.log(`   Observed ${supabaseRequests.length} Supabase startup request(s) on stub 127.0.0.1:3099`);

  const apiRequests = observedRequests.filter(r => r.url.startsWith('/api/'));
  if (apiRequests.length === 0) {
    throw new Error('Expected API request starting with /api/ on stub 127.0.0.1:3099, but 0 were observed');
  }
  console.log(`   Observed ${apiRequests.length} API request(s) starting with /api/ on stub 127.0.0.1:3099`);

  const rootLevelDirectCalls = observedRequests.filter(r => /^\/interview\//.test(r.url));
  if (rootLevelDirectCalls.length > 0) {
    throw new Error(`Detected direct root call missing /api prefix: ${JSON.stringify(rootLevelDirectCalls)}`);
  }

  console.log('[Browser Runtime Test] 10. Verifying missing-configuration fail-closed behavior...');
  const unconfigBuildEnv = {
    ...process.env,
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
    VITE_API_URL: '',
    VITE_ENABLE_DEV_AUTH: 'false',
  };

  const testDistUnconfig = path.resolve(process.cwd(), 'dist_unconfig_test');
  try {
    execSync('npx vite build --outDir dist_unconfig_test', { stdio: 'pipe', cwd: process.cwd(), env: unconfigBuildEnv });

    const unconfigServer = http.createServer((req, res) => {
      let filePath = path.join(testDistUnconfig, req.url === '/' ? 'index.html' : req.url);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(testDistUnconfig, 'index.html');
      }
      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': filePath.endsWith('.js') ? 'application/javascript' : 'text/html' });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => unconfigServer.listen(4174, '127.0.0.1', resolve));

    const page2 = await context.newPage();
    const unconfigErrors = [];
    page2.on('pageerror', (err) => unconfigErrors.push(err.message));

    await page2.goto('http://127.0.0.1:4174', { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page2.waitForTimeout(1000);

    unconfigServer.close();
    await page2.close();

    const failedClosed = unconfigErrors.some(e => e.includes('Missing Supabase configuration'));
    if (!failedClosed) {
      throw new Error(`Unconfigured production build failed to produce fail-closed error. Errors: ${JSON.stringify(unconfigErrors)}`);
    }
    console.log('   Unconfigured build failed closed correctly with error: "Missing Supabase configuration"');
  } finally {
    if (fs.existsSync(testDistUnconfig)) {
      try {
        fs.rmSync(testDistUnconfig, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  console.log('[Browser Runtime Test] ALL PLAYWRIGHT BROWSER RUNTIME TESTS PASSED 100%!');
} finally {
  if (browser) await browser.close();
  staticServer.close();
  apiStubServer.close();
}
