import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [backend, backendAuth, backendUsage, backendPersistence, browser, mobileMode, mobileApi, mobileAuth, llmGateway, shared, eas, netlifyToml, netlifyFunctionPackage, netlifyFunctionLock] = await Promise.all([
  readFile('backend/config/runtimeConfig.ts', 'utf8'),
  readFile('backend/middleware/authMiddleware.ts', 'utf8'),
  readFile('backend/services/usageService.ts', 'utf8'),
  readFile('backend/supabaseAdmin.ts', 'utf8'),
  readFile('services/runtimeConfig.ts', 'utf8'),
  readFile('mobile/src/services/runtimeMode.ts', 'utf8'),
  readFile('mobile/src/services/apiBase.ts', 'utf8'),
  readFile('mobile/src/services/supabaseClient.ts', 'utf8'),
  readFile('backend/services/llmProviderGateway.ts', 'utf8'),
  readFile('shared/src/index.ts', 'utf8'),
  readFile('mobile/eas.json', 'utf8').then(JSON.parse),
  readFile('netlify.toml', 'utf8'),
  readFile('netlify/functions/package.json', 'utf8').then(JSON.parse),
  readFile('netlify/functions/package-lock.json', 'utf8').then(JSON.parse),
]);

const canonical = ['development', 'test', 'preview', 'production'];
for (const mode of canonical) {
  assert.match(backend, new RegExp(`requested === '${mode}'`));
  assert.match(browser, new RegExp(`requested === '${mode}'`));
  assert.match(mobileMode, new RegExp(`requestedMode === '${mode}'`));
}
assert.match(backend, /throw new ConfigurationError\(\)/, 'unknown backend mode must fail closed');
assert.doesNotMatch(backendAuth, /process\.env\.NODE_ENV/, 'auth must consume canonical runtime mode');
assert.match(backendAuth, /mode === 'test'/, 'test-token authority must require canonical test mode');
assert.doesNotMatch(backendUsage, /process\.env\.NODE_ENV/, 'quota fallback must consume canonical runtime mode');
assert.match(backendPersistence, /runtimeMode\(\) !== 'test'/, 'test persistence must require canonical test mode');
assert.doesNotMatch(backend, /GEMINI_API_KEY|GOOGLE_API_KEY|GROQ_API_KEY/,
  'production-like server startup must not require AI-provider credentials');
assert.match(llmGateway, /throw new Error\('All AI providers failed or no API keys provided\.'\)/,
  'AI provider unavailability must fail visibly at the feature boundary');
assert.match(browser, /throw new Error\('Runtime configuration is invalid \(CONFIGURATION_INVALID\)\.'\)/,
  'unknown browser mode must fail closed');
assert.match(mobileMode, /if \(isDevelopmentBuild\) return 'development';[\s\S]*throw configurationError\(\)/,
  'missing mobile mode may infer development only in a development build');
assert.match(mobileMode, /mobileRuntimeMode === 'development' && isMobileDevelopmentBuild/,
  'mobile mock auth must require canonical development in a development build');
for (const [surface, source] of [['backend', backend], ['browser', browser], ['mobile API', mobileApi], ['mobile Supabase', mobileAuth]]) {
  assert.match(source, /isValidRuntimeUrl/, `${surface} must consume canonical URL authority`);
  assert.doesNotMatch(source, /hostname === ['"](?:localhost|127\.0\.0\.1|::1|\[::1\])['"]/, `${surface} must not duplicate a literal loopback predicate`);
}
assert.match(shared, /export const isLoopbackHostname/, 'shared contracts must own canonical hostname semantics');
assert.match(mobileApi, /httpsRequired: isMobileProductionLike/,
  'mobile release-like API traffic must require HTTPS through canonical URL authority');
assert.match(mobileAuth, /allowMockAuth && !canUseMobileMockAuth/,
  'mobile mock auth must fail outside trusted development authority');
assert.match(shared, /!url\.username && !url\.password/,
  'canonical URL validation must reject username- and password-bearing userinfo');

for (const mode of ['preview', 'production']) {
  assert.equal(eas.build[mode].env.EXPO_PUBLIC_RUNTIME_MODE, mode);
  assert.equal(eas.build[mode].env.EXPO_PUBLIC_ENABLE_MOCK_AUTH, 'false');
}

assert.match(backend, /VERCEL_GIT_COMMIT_SHA[\s\S]*COMMIT_REF/,
  'backend preview authority must inspect hosting-provider Git identities');
assert.match(backend, /providerShas\.some\(value => value !== providerSha\)/,
  'conflicting hosting-provider Git identities must fail closed');
assert.match(backend, /providerSha && override && override !== providerSha/,
  'operator override must not shadow or disagree with hosting-provider Git authority');

assert.match(netlifyToml, /command = "npm ci && npm --prefix netlify\/functions ci --omit=dev && npm run build"/,
  'Netlify must install both the workspace and function adapter from committed lockfiles');
assert.doesNotMatch(netlifyToml, /\bnpm install\b|package-lock\s*=\s*false/,
  'Netlify must never bypass committed lockfiles');
assert.equal(netlifyFunctionPackage.dependencies?.['serverless-http'], '4.0.0',
  'Netlify Express adapter must be an exact committed dependency');
assert.equal(netlifyFunctionLock.lockfileVersion, 3, 'Netlify function dependency lock must use the current lock format');
assert.equal(netlifyFunctionLock.packages?.['']?.dependencies?.['serverless-http'], '4.0.0',
  'Netlify function lock root must agree with the manifest');
const lockedServerlessHttp = netlifyFunctionLock.packages?.['node_modules/serverless-http'];
assert.equal(lockedServerlessHttp?.version, '4.0.0', 'Netlify adapter version must be locked exactly');
assert.equal(lockedServerlessHttp?.resolved, 'https://registry.npmjs.org/serverless-http/-/serverless-http-4.0.0.tgz',
  'Netlify adapter lock must bind the exact registry artifact');
assert.equal(Object.keys(lockedServerlessHttp?.dependencies ?? {}).length, 0,
  'serverless-http 4.0.0 must retain its zero-runtime-dependency graph');

console.log('Cross-surface runtime-mode authority tests passed');
