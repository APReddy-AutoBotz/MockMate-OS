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

const resume = read('mobile/src/app/(app)/resume.tsx');
const speak = read('mobile/src/app/(app)/speak.tsx');
const interview = read('mobile/src/app/(app)/interview.tsx');

for (const [label, source] of [['Resume', resume], ['ClearSpeak', speak], ['Interview', interview]]) {
  requireText(source, 'apiClient', label);
  rejectText(source, 'fetch(', label);
  rejectText(source, 'SUPABASE_SERVICE_ROLE_KEY', label);
  rejectText(source, 'GROQ_API_KEY', label);
  rejectText(source, 'OPENAI_API_KEY', label);
  rejectText(source, 'provider:', label);
  rejectText(source, 'model:', label);
}

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

requireText(interview, '/interview/plan', 'Interview');
requireText(interview, '/interview/sessions', 'Interview');
requireText(interview, 'InterviewPlanSchema', 'Interview');
requireText(interview, 'InterviewSessionStartResponseSchema', 'Interview');
requireText(interview, 'AdaptiveAnswerSubmissionResponseSchema', 'Interview');
requireText(interview, 'FinalReportSchema', 'Interview');
requireText(interview, 'sessionEpochRef.current += 1', 'Interview stale-response guard');
requireText(interview, 'requestEpoch !== sessionEpochRef.current', 'Interview stale-response guard');
rejectText(interview, 'Interview practice is not available in this internal build.', 'Interview');

if (!process.exitCode) {
  console.log('Mobile governed parity guard passed.');
}
