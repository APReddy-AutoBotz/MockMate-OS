// Resume to Interview Grounding Journey Verification
import { createResumeGroundedInterviewDraft, completeInterviewSessionContext, InterviewPlanSchema } from '../shared/dist/index.js';

console.log('[Resume -> Interview Journey] Verifying typed draft creation and context completion...');

const snapshotId = '33333333-3333-3333-3333-333333333333';
const bridgeId = '44444444-4444-4444-4444-444444444444';

const draft = createResumeGroundedInterviewDraft(
  snapshotId,
  bridgeId,
  'Staff Engineer',
  'Interview based on resume claims'
);

if (draft.groundingRequest?.snapshotId !== snapshotId) {
  console.error('FAILED: snapshotId mismatch');
  process.exit(1);
}

const mockPlan = InterviewPlanSchema.parse({
  meta: {
    intent: 'Interview based on resume claims',
    controls: {
      difficulty: 'intermediate',
      totalQuestions: 4,
      includeBehavioral: true,
      includeCoding: false,
      timePerQuestion: '90s',
      deliveryMode: 'exam',
      reasoningMode: 'classic_behavioral',
    }
  },
  jdInsights: {
    role: 'Staff Engineer'
  },
  questionSet: [
    {
      id: 'q1',
      phase: 'scenario',
      difficulty: 'intermediate',
      question: 'Tell me about Node.js performance tuning.',
      expectedSignals: ['Signal 1'],
      personaFocus: 'p1',
      questionKind: 'root',
      rootQuestionId: 'q1',
      stage: 'framing',
      targetDimensions: ['SYSTEMS_THINKING'],
      groundingReferences: [
        {
          contextItemId: '22222222-2222-2222-2222-222222222222',
          sourceModule: 'resume',
          sourceRecordId: 'res_1',
          sourcePath: 'skills',
          label: 'Resume Skills',
          exactExcerpt: 'Node.js',
          purpose: 'resume_to_interview'
        }
      ]
    }
  ]
});

const sessionContext = completeInterviewSessionContext(
  draft,
  mockPlan,
  {
    id: snapshotId,
    purpose: 'resume_to_interview',
    contextVersion: 1,
    itemIds: ['22222222-2222-2222-2222-222222222222'],
    projection: { targetRole: 'Staff Engineer', skills: ['Node.js'] },
    conflicts: [],
    consent: { scope: 'one_time', purpose: 'resume_to_interview', includedItemIds: ['22222222-2222-2222-2222-222222222222'], excludedItemIds: [], sourceModules: ['resume'], acknowledgedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    sourceModules: ['resume']
  },
  bridgeId
);

if (!sessionContext.interviewPlan) {
  console.error('FAILED: expected interviewPlan on completed context');
  process.exit(1);
}

console.log('[Resume -> Interview Journey] PASSED: Typed draft separation & completion verified 100%!');
