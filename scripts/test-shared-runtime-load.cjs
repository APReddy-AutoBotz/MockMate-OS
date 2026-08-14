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

const assertAccentEvidenceModule = (accentEvidence, mode) => {
  assert.equal(
    typeof accentEvidence.AccentScorerEvidenceV1Schema?.safeParse,
    'function',
    `accent-evidence scorer contract must be runtime-loadable from ${mode}`,
  );
  assert.equal(
    typeof accentEvidence.AccentScoreV2Schema?.safeParse,
    'function',
    `accent-score.v2 contract must be runtime-loadable from ${mode}`,
  );
  assert.equal(
    accentEvidence.AccentRealSpeechPolicyV1?.scoringPolicyVersion,
    'real-speech-policy.v1',
    `real speech policy must be exported in ${mode}`,
  );
};

const cjsResumeIntegrity = require('mockmate-shared/resume-integrity');
const cjsAccentEvidence = require('mockmate-shared/accent-evidence');
assertResumeIntegrityModule(cjsResumeIntegrity, 'CommonJS require');
assertAccentEvidenceModule(cjsAccentEvidence, 'CommonJS require');

(async () => {
  const esmResumeIntegrity = await import('mockmate-shared/resume-integrity');
  const esmAccentEvidence = await import('mockmate-shared/accent-evidence');
  assertResumeIntegrityModule(esmResumeIntegrity, 'ES module import');
  assertAccentEvidenceModule(esmAccentEvidence, 'ES module import');
  console.log('[Shared Runtime Load] resume-integrity + accent-evidence loaded through require + import.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
