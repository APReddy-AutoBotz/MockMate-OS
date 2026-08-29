import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sharedBuild = spawnSync(npmExecutable, ['run', 'shared:build', '--silent'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
assert.equal(sharedBuild.status, 0, 'shared artifacts must build before hosted operation-authority assertions');

const {
  ACCOUNT_DELETE_FAILURE_HEADER,
  ACCOUNT_DELETE_FAILURE_VALUE,
  DEFAULT_JSON_REQUEST_BYTES,
  HostedOperationAuthorityError,
  OVERSIZED_RESUME_REQUEST_BYTES,
  jsonRequestLimitForOperation,
  operationOwnedHeaders,
  validateHostedOperationBody,
} = await import('./hosted-acceptance-operation-authority.mjs');

const expectRefused = (scenario, message) => {
  assert.throws(() => validateHostedOperationBody(scenario), HostedOperationAuthorityError, message);
};

const resumeData = { basics: { name: 'MockMate Preview QA' } };
validateHostedOperationBody({ operation: 'resume.score', body: { resumeData, rawText: 'Supported source', jdText: 'Role description' } });
validateHostedOperationBody({ operation: 'resume.suggest', body: { resumeData, jdText: 'Role description' } });
expectRefused({ operation: 'resume.suggest', body: { resumeData, rawText: 'score-only field', jdText: '' } }, 'Resume suggest must use its exact shared schema');

for (const operation of [
  'career-context.rebuild', 'career-context.state', 'career-context.decision-state',
  'interview.usage-baseline', 'interview.usage-after-concurrency', 'interview.usage-after-response-loss', 'interview.terminal',
  'clearspeak.cancel-status',
]) {
  validateHostedOperationBody({ operation });
  expectRefused({ operation, body: {} }, `${operation} must remain bodyless`);
}

validateHostedOperationBody({
  operation: 'partial-failure.malformed',
  body: { resumeData, rawText: '', jdText: '', unsupportedProbeField: 'reject-me' },
});
expectRefused({
  operation: 'partial-failure.malformed',
  body: { resumeData: {}, rawText: '', jdText: '', unsupportedProbeField: 'reject-me' },
}, 'malformed probe must not hide an already-invalid Resume body');

const oversizedRawText = 'x'.repeat(500001);
validateHostedOperationBody({ operation: 'partial-failure.oversized', body: { resumeData, rawText: oversizedRawText, jdText: '' } });
expectRefused({ operation: 'partial-failure.oversized', body: { resumeData, rawText: 'x'.repeat(500000), jdText: '' } }, 'oversized probe must actually cross the shared 500k boundary');
assert.equal(jsonRequestLimitForOperation('resume.score'), DEFAULT_JSON_REQUEST_BYTES);
assert.equal(jsonRequestLimitForOperation('partial-failure.oversized'), OVERSIZED_RESUME_REQUEST_BYTES);
assert.ok(OVERSIZED_RESUME_REQUEST_BYTES > 500001 && OVERSIZED_RESUME_REQUEST_BYTES < 2 * 1024 * 1024, 'oversized probe allowance must reach Zod while staying below Express 2 MiB authority');

const answer = {
  questionId: 'question-1',
  expectedSessionVersion: 1,
  clientSubmissionId: '10000000-0000-4000-a000-000000000099',
  answerKind: 'skipped',
};
for (const operation of ['interview.answer', 'interview.complete', 'interview.stale', 'concurrency.exactly-once', 'replay.response-loss']) {
  validateHostedOperationBody({ operation, body: answer });
}
expectRefused({ operation: 'interview.create', body: { role: 'Developer' } }, 'Interview creation must use the strict shared context wrapper');

validateHostedOperationBody({ operation: 'career-context.update', body: { personalizationEnabled: true, expectedContextVersion: 1 } });
for (const operation of ['career-context.delete', 'career-context.decision-stale']) {
  validateHostedOperationBody({ operation, body: { decision: 'revoke', expectedContextVersion: 1, clientRequestId: 'qa-decision' } });
}
const itemId = '10000000-0000-4000-a000-000000000010';
const snapshotId = '10000000-0000-4000-a000-000000000011';
validateHostedOperationBody({
  operation: 'career-context.create',
  body: {
    purpose: 'general_practice',
    includedItemIds: [itemId],
    excludedItemIds: [],
    conflictSelections: {},
    consent: {
      scope: 'one_time',
      purpose: 'general_practice',
      includedItemIds: [itemId],
      excludedItemIds: [],
      sourceModules: ['manual'],
      acknowledgedAt: '2026-08-23T00:00:00.000Z',
    },
    expectedContextVersion: 1,
    clientRequestId: 'qa-snapshot',
  },
});
validateHostedOperationBody({
  operation: 'career-context.bridge',
  body: {
    sourceModule: 'manual',
    targetModule: 'interview',
    purpose: 'general_practice',
    snapshotId,
    clientRequestId: 'qa-bridge',
  },
});

const promptSelector = {
  mode: 'word',
  profileId: 'en-GB-general-v1',
  profileVersion: 1,
  promptId: '10000000-0000-4000-a000-000000000001',
  promptVersion: 1,
  promptContentHash: 'a'.repeat(64),
  referenceSetVersion: 'synthetic-reference.v1',
  scoringPolicyVersion: 'synthetic-policy.v1',
};
validateHostedOperationBody({ operation: 'clearspeak.prompt', body: { profileId: 'en-GB-general-v1', profileVersion: 1, mode: 'word' } });
expectRefused({ operation: 'clearspeak.prompt', body: { profileId: 'en-GB-general-v1', mode: 'word', scoringPolicyVersion: 'client-owned' } }, 'prompt callers must not inject server policy');
for (const operation of ['clearspeak.authority', 'clearspeak.cancel-authority']) {
  validateHostedOperationBody({
    operation,
    body: { attemptId: '10000000-0000-4000-a000-000000000020', ...promptSelector },
  });
}
const metadata = {
  attemptId: '10000000-0000-4000-a000-000000000020',
  durationMs: 1000,
  ...promptSelector,
  submissionCapability: 'b'.repeat(64),
};
for (const operation of ['clearspeak.create', 'clearspeak.replay', 'clearspeak.cancel-submit']) {
  validateHostedOperationBody({ operation, multipart: { fields: { metadata: JSON.stringify(metadata) } } });
}
validateHostedOperationBody({ operation: 'clearspeak.cancel', body: { submissionCapability: 'b'.repeat(64) } });
expectRefused({ operation: 'clearspeak.cancel', body: { submissionCapability: 'not-a-capability' } }, 'ClearSpeak cancel must require process-local capability authority');

validateHostedOperationBody({ operation: 'partial-failure.account-delete' });
expectRefused({ operation: 'partial-failure.account-delete', body: {} }, 'deletion failure seam must not accept a body');
assert.deepEqual(operationOwnedHeaders('partial-failure.account-delete'), { [ACCOUNT_DELETE_FAILURE_HEADER]: ACCOUNT_DELETE_FAILURE_VALUE });
assert.deepEqual(operationOwnedHeaders('account.delete'), {}, 'real account deletion must not inherit preview failure headers');

console.log('P0-8 hosted operation body/request authority tests passed');
