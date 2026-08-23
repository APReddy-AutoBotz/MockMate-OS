import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const serviceWorkerPath = path.join(distRoot, 'sw.js');
const htmlPath = path.join(distRoot, 'index.html');

assert.ok(fs.existsSync(serviceWorkerPath), 'PWA build must emit dist/sw.js');
assert.ok(fs.existsSync(htmlPath), 'PWA build must emit dist/index.html');

const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const precacheUrls = [...serviceWorker.matchAll(/url:\s*["']([^"']+)["']/g)].map(match => match[1]);

assert.ok(precacheUrls.includes('index.html'), 'PWA precache must include the app-shell index.html');
assert.ok(precacheUrls.includes('manifest.webmanifest'), 'PWA precache must include the generated manifest');
assert.ok(precacheUrls.includes('index.css'), 'PWA precache must include the local design-system stylesheet');
assert.ok(precacheUrls.some(url => /^assets\/.*\.js$/.test(url)), 'PWA precache must include an emitted JavaScript asset');
assert.ok(precacheUrls.some(url => /^assets\/.*\.css$/.test(url)), 'PWA precache must include the compiled CSS asset');
assert.doesNotMatch(html, /cdn\.tailwindcss\.com/i, 'Production HTML must not depend on the Tailwind CDN');
assert.match(html, /href=["']\/index\.css["']/, 'Production HTML must load the local design-system stylesheet');
assert.match(html, /manifest\.webmanifest/, 'Production HTML must reference the governed generated manifest');

console.log(`PWA app-shell build guard passed (${precacheUrls.length} precached assets).`);
