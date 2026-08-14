'use strict';

const assert = require('node:assert/strict');

const resumeIntegrity = require('mockmate-shared/resume-integrity');

assert.equal(
  typeof resumeIntegrity.GovernedResumeSuggestionResponseSchema?.safeParse,
  'function',
  'resume-integrity subpath must be runtime-loadable from CommonJS backend code',
);
assert.equal(
  typeof resumeIntegrity.GovernedResumeScoreResponseSchema?.safeParse,
  'function',
  'governed resume score contract must be present at runtime',
);
assert.match(
  resumeIntegrity.RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  /^resume-rewrite-integrity\.v\d+$/,
  'resume integrity policy version must be exported at runtime',
);

console.log('[Shared Runtime Load] mockmate-shared/resume-integrity loaded successfully from CommonJS.');
