import { InterviewSetupDraftSchema } from 'mockmate-shared';
import { createUngroundedResumeInterviewDraft } from '../../services/interviewSetupService';

describe('Resume to Interview ungrounded setup', () => {
  it.each(['no eligible Resume context', 'Continue Without Grounding'])(
    'creates the canonical blank draft for %s without false grounding authority',
    () => {
      const draft = createUngroundedResumeInterviewDraft(
        'Software Professional',
        'General interview based on my resume.',
        'Backend engineer role',
      );
      expect(() => InterviewSetupDraftSchema.parse(draft)).not.toThrow();
      expect(draft.groundingRequest).toBeUndefined();
      expect(draft.bridgeIntent).toBeUndefined();
      expect(draft.jdText).toBe('Backend engineer role');
    }
  );
});
