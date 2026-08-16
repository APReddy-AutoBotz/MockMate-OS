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
const rootLayout = read('mobile/src/app/_layout.tsx');
const onboarding = read('mobile/src/app/onboarding.tsx');
const supabaseClient = read('mobile/src/services/supabaseClient.ts');
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
requireText(dashboard, 'mockmate_pending_grounded_interview_v1', 'Dashboard account data cleanup');
rejectText(dashboard, 'mockmate_pending_grounding_v1', 'Dashboard stale grounding recovery cleanup');
requireText(dashboard, 'LOCAL_APP_DATA_KEYS.map((key) => AsyncStorage.removeItem(key))', 'Dashboard sign-out local account isolation');
requireText(dashboard, 'some local MockMate data could not be removed', 'Dashboard sign-out cleanup truthfulness');
requireBefore(
  dashboard,
  'await signOut();',
  'LOCAL_APP_DATA_KEYS.map((key) => AsyncStorage.removeItem(key))',
  'Dashboard sign-out authority ordering',
);
rejectText(dashboard, 'getAccessToken', 'Dashboard account authority');
rejectText(dashboard, 'API_BASE', 'Dashboard account authority');

requireText(supabaseClient, 'getCurrentUserId', 'Mobile authenticated local owner resolver');
requireText(onboarding, 'getCurrentUserId', 'Mobile profile ownership');
requireText(onboarding, 'userId,', 'Mobile profile ownership');
requireBefore(
  onboarding,
  'const userId = await getCurrentUserId();',
  "await AsyncStorage.setItem('mockmate_user_profile', JSON.stringify(profile));",
  'Mobile profile ownership ordering',
);
requireText(rootLayout, 'profile.userId === currentUser.id', 'Mobile auth-change local ownership');
requireText(rootLayout, 'LOCAL_USER_DATA_KEYS.map((key) => AsyncStorage.removeItem(key))', 'Mobile auth-change local ownership');
requireText(rootLayout, 'if (!ownsLocalProfile)', 'Mobile missing-profile orphan cleanup');
requireBefore(
  rootLayout,
  "const stored = await AsyncStorage.getItem('mockmate_user_profile');",
  'if (!ownsLocalProfile)',
  'Mobile ownership inspection before orphan cleanup',
);
requireText(rootLayout, 'mockmate_pending_grounded_interview_v1', 'Mobile auth-change grounded recovery isolation');
requireText(rootLayout, 'isolationError', 'Mobile auth-change fail-closed isolation');
requireText(rootLayout, 'authGeneration', 'Mobile auth-change stale callback guard');
requireText(rootLayout, 'await precedingIsolation;', 'Mobile auth-change serialized isolation');
requireBefore(
  rootLayout,
  'await precedingIsolation;',
  "const stored = await AsyncStorage.getItem('mockmate_user_profile');",
  'Mobile auth-change isolation serialization',
);

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

requireText(interview, "@react-native-async-storage/async-storage", 'Interview durable grounding recovery');
requireText(interview, 'mockmate_pending_grounded_interview_v1', 'Interview durable grounding recovery');
requireText(interview, 'CareerContextSnapshotSchema.safeParse', 'Interview durable grounding recovery');
requireText(interview, 'PENDING_GROUNDING_ALLOWED_KEYS', 'Interview durable grounding recovery');
requireText(interview, 'MAX_PENDING_GROUNDING_STORAGE_BYTES', 'Interview durable grounding recovery');
requireText(interview, 'persistPendingGroundingRecovery', 'Interview durable grounding recovery');
requireText(interview, 'restorePendingGroundingRecovery', 'Interview durable grounding recovery');
requireText(interview, 'AsyncStorage.getItem(PENDING_GROUNDING_STORAGE_KEY)', 'Interview durable grounding recovery');
requireText(interview, 'AsyncStorage.setItem(PENDING_GROUNDING_STORAGE_KEY, serialized)', 'Interview durable grounding recovery');
requireText(interview, 'AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY)', 'Interview durable grounding recovery');
requireText(interview, 'setGroundingRecoveryChecked(true)', 'Interview durable grounding recovery');
rejectText(
  interview,
  'finally {\n          if (active) setGroundingRecoveryChecked(true);',
  'Interview fail-closed recovery inspection',
);
requireText(interview, 'if (!groundingRecoveryChecked)', 'Interview recovery gate');
requireBefore(
  interview,
  'if (!groundingRecoveryChecked)',
  "apiClient.get('/career-context', CareerContextGetResponseSchema)",
  'Interview recovery gate before mutable Career Context read',
);
requireText(interview, 'setUseCareerContext(true)', 'Interview durable grounding restoration');
requireText(interview, 'Abandon pending grounded launch', 'Interview explicit recovery abandonment');
requireText(interview, 'Retry or abandon the saved grounded launch before loading mutable Career Context.', 'Interview immutable recovery boundary');
requireBefore(
  interview,
  'await persistPendingGroundingRecovery(pending);',
  'return materializePendingGrounding(pending);',
  'Interview fresh lineage persistence ordering',
);
requireBefore(
  interview,
  "const started = await apiClient.post(",
  'await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);',
  'Interview session success before durable recovery cleanup',
);
requireBefore(
  interview,
  'await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);',
  'pendingGroundingRef.current = null;',
  'Interview durable recovery cleanup before in-memory release',
);
requireBefore(
  interview,
  'await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);',
  'setPlan(generatedPlan);',
  'Interview durable recovery cleanup before local session progression',
);
requireText(
  interview,
  'Retry the exact grounded launch before continuing.',
  'Interview durable cleanup failure must fail closed',
);
rejectText(
  interview,
  'The server session remains authoritative.',
  'Interview cleanup failure must not permit local session progression',
);
for (const forbiddenPersistedAuthority of ['rawText', 'audioBytes', 'transcript', 'answerText', 'accessToken', 'providerKey', 'modelId', 'serviceRole']) {
  if (interview.includes(`'${forbiddenPersistedAuthority}',`) || interview.includes(`\"${forbiddenPersistedAuthority}\",`)) {
    fail(`Interview durable grounding recovery allowlist contains forbidden field: ${forbiddenPersistedAuthority}`);
  }
}

requireText(interview, 'sessionEpochRef.current += 1', 'Interview stale-response guard');
requireText(interview, 'requestEpoch !== sessionEpochRef.current', 'Interview stale-response guard');
rejectText(interview, 'Interview practice is not available in this internal build.', 'Interview');
rejectText(interview, 'fetch(', 'Interview');

if (!process.exitCode) {
  console.log('Mobile governed parity guard passed.');
}
