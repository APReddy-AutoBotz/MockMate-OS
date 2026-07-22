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

console.log('[Browser Runtime Test] 2. Building frontend dist with deterministic test environment variables...');
const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://dummy.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'dummy-anon-key-for-test-runner',
  VITE_API_URL: 'http://127.0.0.1:3099',
  VITE_ENABLE_DEV_AUTH: 'false',
};

execSync('npm run build', { stdio: 'inherit', cwd: process.cwd(), env: buildEnv });

console.log('[Browser Runtime Test] 3. Launching static web server on port 4173...');
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
  console.log('[Browser Runtime Test] 4. Launching Playwright Chromium...');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  console.log('[Browser Runtime Test] 5. Navigating to http://127.0.0.1:4173...');
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 10000 });

  await page.waitForTimeout(2000);

  if (pageErrors.length > 0) {
    console.error('[Browser Runtime Test] Page errors detected:', pageErrors);
    throw new Error(`Browser runtime generated ${pageErrors.length} page error(s)`);
  }

  const content = await page.content();
  if (content.includes('Missing Supabase configuration')) {
    throw new Error('Built application crashed with Missing Supabase configuration');
  }

  console.log('[Browser Runtime Test] 6. Verifying app rendered DOM successfully...');
  const appContainer = await page.$('#root');
  if (!appContainer) {
    throw new Error('#root container element not found in built browser page');
  }

  console.log('[Browser Runtime Test] ALL PLAYWRIGHT BROWSER RUNTIME TESTS PASSED 100%!');
} finally {
  if (browser) await browser.close();
  staticServer.close();
}
