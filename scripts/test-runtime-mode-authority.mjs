import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [backend, backendAuth, backendUsage, backendPersistence, browser, mobileMode, mobileApi, mobileAuth, eas] = await Promise.all([
  readFile('backend/config/runtimeConfig.ts', 'utf8'),
  readFile('backend/middleware/authMiddleware.ts', 'utf8'),
  readFile('backend/services/usageService.ts', 'utf8'),
  readFile('backend/supabaseAdmin.ts', 'utf8'),
  readFile('services/runtimeConfig.ts', 'utf8'),
  readFile('mobile/src/services/runtimeMode.ts', 'utf8'),
  readFile('mobile/src/services/apiBase.ts', 'utf8'),
  readFile('mobile/src/services/supabaseClient.ts', 'utf8'),
  readFile('mobile/eas.json', 'utf8').then(JSON.parse),
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
assert.match(browser, /throw new Error\('Runtime configuration is invalid \(CONFIGURATION_INVALID\)\.'\)/,
  'unknown browser mode must fail closed');
assert.match(mobileMode, /if \(isDevelopmentBuild\) return 'development';[\s\S]*throw configurationError\(\)/,
  'missing mobile mode may infer development only in a development build');
assert.match(mobileMode, /mobileRuntimeMode === 'development' && isMobileDevelopmentBuild/,
  'mobile mock auth must require canonical development in a development build');
assert.match(mobileApi, /isMobileProductionLike && parsed\.protocol !== 'https:'/,
  'mobile release-like API traffic must require HTTPS');
assert.match(mobileAuth, /allowMockAuth && !canUseMobileMockAuth/,
  'mobile mock auth must fail outside trusted development authority');
assert.match(mobileAuth, /parsed\.username \|\| parsed\.password/,
  'mobile Supabase URL must reject username- and password-bearing userinfo');
assert.match(browser, /!url\.username && !url\.password/,
  'browser URL validation must reject username- and password-bearing userinfo');
assert.match(backend, /!url\.username && !url\.password/,
  'backend URL validation must reject username- and password-bearing userinfo');

for (const mode of ['preview', 'production']) {
  assert.equal(eas.build[mode].env.EXPO_PUBLIC_RUNTIME_MODE, mode);
  assert.equal(eas.build[mode].env.EXPO_PUBLIC_ENABLE_MOCK_AUTH, 'false');
}

console.log('Cross-surface runtime-mode authority tests passed');
