import { createBlankInterviewSetupDraft, InterviewSetupDraft } from 'mockmate-shared';

/** Canonical Resume-to-Interview draft when the user has not authorized grounding. */
export function createUngroundedResumeInterviewDraft(
  targetRole: string,
  intentText: string,
  jdText?: string,
): InterviewSetupDraft {
  const draft = createBlankInterviewSetupDraft(targetRole, intentText);
  if (jdText) draft.jdText = jdText;
  return draft;
}
