import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fail = (message) => {
  console.error(`MOBILE_GOVERNED_PARITY_FAILED: ${message}`);
  process.exitCode = 1;
};
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing required marker: ${needle}`);
};
const rejectText = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} contains forbidden legacy marker: ${needle}`);
};
const requireBefore = (source, first, second, label) => {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    fail(`${label} must keep '${first}' before '${second}'`);
  }
};

const dashboard = read('mobile/src/app/(app)/index.tsx');
const resume = read('mobile/src/app/(app)/resume.tsx');
const speak = read('mobile/src/app/(app)/speak.tsx');
const interview = read('mobile/src/app/(app)/interview.tsx');
const careerContext = read('mobile/src/app/(app)/career-context.tsx');

for (const [label, source] of [
  ['Dashboard', dashboard],
  ['Resume', resume],
  ['ClearSpeak', speak],
  ['Interview', interview],
  ['Career Context', careerContext],
]) {
  requireText(source, 'apiClient', label);
  rejectText(source, 'SUPABASE_SERVICE_ROLE_KEY', label);
  rejectText(source, 'GROQ_API_KEY', label);
  rejectText(source, 'OPENAI_API_KEY', label);
  rejectText(source, 'provider:', label);
  rejectText(source, 'model:', label);
}

rejectText(dashboard, 'fetch(', 'Dashboard account authority');
requireText(dashboard, "apiClient.delete('/me/data', AccountDeletionResponseSchema)", 'Dashboard account authority');
requireText(dashboard, 'failedTables.length > 0', 'Dashboard account authority');
rejectText(dashboard, 'getAccessToken', 'Dashboard account authority');
rejectText(dashboard, 'API_BASE', 'Dashboard account authority');

requireText(resume, 'ResumeParseResponseSchema', 'Resume');
requireText(resume, 'GovernedResumeScoreResponseSchema', 'Resume');
requireText(resume, 'atsDiagnostics', 'Resume');
rejectText(resume, 'overallScore', 'Resume');
rejectText(resume, 'analysis?.findings', 'Resume');
rejectText(resume, 'analysis.findings', 'Resume');
rejectText(resume, 'analysis?.suggestions', 'Resume');
rejectText(resume, 'analysis.suggestions', 'Resume');

requireText(speak, '/clearspeak/v1/accent/catalog', 'ClearSpeak');
requireText(speak, '/clearspeak/v1/accent/attempt-authority', 'ClearSpeak');
requireText(speak, '/clearspeak/v1/accent/attempts', 'ClearSpeak');
requireText(speak, 'AccentScoreV1Schema', 'ClearSpeak');
requireText(speak, 'AccentScoreV2Schema', 'ClearSpeak');
rejectText(speak, '/clearspeak/score', 'ClearSpeak');
rejectText(speak, 'scoreResult.composite', 'ClearSpeak');
rejectText(speak, 'scoreResult.clarity', 'ClearSpeak');

requireText(careerContext, 'CareerContextGetResponseSchema', 'Career Context');
requireText(careerContext, 'CareerContextRebuildResponseSchema', 'Career Context');
requireText(careerContext, 'CareerContextPreferenceRequestSchema', 'Career Context');
requireText(careerContext, 'CareerContextItemDecisionRequestSchema', 'Career Context');
requireText(careerContext, 'expectedContextVersion', 'Career Context');
requireText(careerContext, "error instanceof ApiError && error.status === 409", 'Career Context stale-version guard');
rejectText(careerContext, 'fetch(', 'Career Context');
rejectText(careerContext, 'supabase', 'Career Context direct persistence');

requireText(interview, '/interview/plan', 'Interview');
requireText(interview, '/interview/sessions', 'Interview');
requireText(interview, 'InterviewPlanSchema', 'Interview');
requireText(interview, 'InterviewSessionStartResponseSchema', 'Interview');
requireText(interview, 'AdaptiveAnswerSubmissionResponseSchema', 'Interview');
requireText(interview, 'FinalReportSchema', 'Interview');
requireText(interview, 'GroundingSnapshotCreateRequestSchema', 'Interview grounding');
requireText(interview, 'GroundingSnapshotCreateResponseSchema', 'Interview grounding');
requireText(interview, 'ModuleBridgeCreateRequestSchema', 'Interview grounding');
requireText(interview, 'ModuleBridgeCreateResponseSchema', 'Interview grounding');
requireText(interview, 'snapshotId: grounding.snapshot.id', 'Interview grounding');
requireText(interview, 'bridgeId: grounding.bridgeId', 'Interview grounding');
requireText(interview, 'groundingSnapshot: grounding.snapshot', 'Interview grounding');
requireText(interview, 'bridgeSessionId: grounding.bridgeId', 'Interview grounding');
requireText(interview, 'snapshotClientRequestId', 'Interview grounding replay');
requireText(interview, 'bridgeClientRequestId', 'Interview grounding replay');
requireText(interview, 'pendingGroundingRef.current', 'Interview grounding replay');
requireText(interview, 'return materializePendingGrounding(existing);', 'Interview grounding replay');
requireBefore(
  interview,
  'return materializePendingGrounding(existing);',
  "const fresh = await apiClient.get('/career-context', CareerContextGetResponseSchema);",
  'Interview immutable replay ordering',
);
requireText(interview, "item.sensitivity === 'standard'", 'Interview grounding privacy');
requireText(interview, 'sessionEpochRef.current += 1', 'Interview stale-response guard');
requireText(interview, 'requestEpoch !== sessionEpochRef.current', 'Interview stale-response guard');
rejectText(interview, 'Interview practice is not available in this internal build.', 'Interview');
rejectText(interview, 'fetch(', 'Interview');

if (!process.exitCode) {
  console.log('Mobile governed parity guard passed.');
}