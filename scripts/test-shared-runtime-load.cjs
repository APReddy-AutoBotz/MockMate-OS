'use strict';

const assert = require('node:assert/strict');

const assertResumeIntegrityModule = (resumeIntegrity, mode) => {
  assert.equal(
    typeof resumeIntegrity.GovernedResumeSuggestionResponseSchema?.safeParse,
    'function',
    `resume-integrity subpath must be runtime-loadable from ${mode}`,
  );
  assert.equal(
    typeof resumeIntegrity.GovernedResumeScoreResponseSchema?.safeParse,
    'function',
    `governed resume score contract must be present in ${mode}`,
  );
  assert.match(
    resumeIntegrity.RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
    /^resume-rewrite-integrity\.v\d+$/,
    `resume integrity policy version must be exported in ${mode}`,
  );
};

const cjsModule = require('mockmate-shared/resume-integrity');
assertResumeIntegrityModule(cjsModule, 'CommonJS require');

(async () => {
  const esmModule = await import('mockmate-shared/resume-integrity');
  assertResumeIntegrityModule(esmModule, 'ES module import');
  console.log('[Shared Runtime Load] mockmate-shared/resume-integrity loaded through require + import.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
