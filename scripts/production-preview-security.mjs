import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = ['backend/server.ts','backend/middleware/authMiddleware.ts','backend/services/usageService.ts','mobile/src/services/apiBase.ts','mobile/src/services/supabaseClient.ts','vite.config.ts'];
const text = (await Promise.all(files.map(async f => `\n${f}\n${await readFile(f,'utf8')}`))).join('');
const fail = message => { throw new Error(message); };
const browserRuntimeFixture = await readFile('scripts/test-browser-runtime.mjs', 'utf8');
if (!/VITE_RUNTIME_MODE:\s*['"]test['"]/.test(browserRuntimeFixture)) fail('Browser runtime fixture must explicitly select canonical test mode');
if (!/\['preview',\s*'production'\]/.test(browserRuntimeFixture) || !browserRuntimeFixture.includes('CONFIGURATION_INVALID')) fail('Browser runtime fixture must reject loopback HTTP in preview and production');
if (/SUPABASE_SERVICE_ROLE_KEY['"]\s*:\s*JSON\.stringify|EXPO_PUBLIC_(?:.*SERVICE|.*PROVIDER|.*ADMIN)|VITE_(?:.*SERVICE_ROLE|.*PROVIDER_KEY)/.test(text)) fail('Server authority may enter a public bundle');
if (/NODE_ENV\s*===\s*['"]production['"][\s\S]{0,300}ENABLE_DEV_AUTH/.test(text)) fail('Mode policy must use canonical production-like authority');
if (!text.includes("runtimeMode() === 'development'")) fail('Dev auth is not bound to canonical development mode');
if (!text.includes("handler: 'NetworkOnly'")) fail('PWA API traffic is not network authoritative');
if (!text.includes("process.env.NODE_ENV !== 'development'")) fail('Quota fallback is not development-only');

const secret = 'never-print-this-service-role';
const rejected = spawnSync(process.execPath, ['backend/dist/localServer.js'], { encoding:'utf8', env:{
  ...process.env, NODE_ENV:'production', MOCKMATE_RUNTIME_MODE:'preview', ENABLE_DEV_AUTH:'true',
  SUPABASE_URL:'not-a-url', SUPABASE_SERVICE_ROLE_KEY:secret, ALLOWED_ORIGINS:'*', GROQ_API_KEY:'fake',
}});
const output = `${rejected.stdout}${rejected.stderr}`;
if (rejected.status === 0) fail('Malformed preview configuration started successfully');
if (output.includes(secret) || output.includes('not-a-url')) fail('Configuration rejection leaked an environment value');

for (const dir of ['dist','backend/dist']) {
  const names = await readdir(dir, { recursive:true }).catch(() => []);
  for (const name of names.filter(n => /\.(?:js|css|map)$/.test(n))) {
    const bundle = await readFile(`${dir}/${name}`,'utf8');
    if (/SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|GROQ_API_KEY/.test(bundle) && dir === 'dist') fail(`Browser bundle exposes a server-only env name: ${name}`);
  }
}
console.log('Production-preview adversarial security checks passed');
