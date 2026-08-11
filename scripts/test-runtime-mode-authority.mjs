import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [backend, browser, mobileMode, mobileApi, mobileAuth, eas] = await Promise.all([
  readFile('backend/config/runtimeConfig.ts', 'utf8'),
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

for (const mode of ['preview', 'production']) {
  assert.equal(eas.build[mode].env.EXPO_PUBLIC_RUNTIME_MODE, mode);
  assert.equal(eas.build[mode].env.EXPO_PUBLIC_ENABLE_MOCK_AUTH, 'false');
}

console.log('Cross-surface runtime-mode authority tests passed');
