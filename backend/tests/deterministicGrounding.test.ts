import { buildDeterministicInterviewPlan } from '../services/aiService';

describe('deterministic interview grounding', () => {
  const controls: any = {
    difficulty: 'intermediate', totalQuestions: 1, includeBehavioral: true,
    includeCoding: false, timePerQuestion: '90s', deliveryMode: 'exam',
    reasoningMode: 'classic_behavioral', sourceMode: 'question_bank',
  };

  it('incorporates the exact referenced snapshot fact in fallback question text', () => {
    const reference = {
      contextItemId: '11111111-1111-4111-8111-111111111111', sourceModule: 'resume',
      sourceRecordId: 'resume-a', sourcePath: 'projects.0', label: 'Atlas migration',
      exactExcerpt: 'Led the Atlas migration and reduced processing time by 30 percent.',
      purpose: 'resume_to_interview',
    };
    const plan = buildDeterministicInterviewPlan('Engineer', 'Practice', controls, ['p1'], {
      id: '22222222-2222-4222-8222-222222222222', userId: '33333333-3333-4333-8333-333333333333',
      purpose: 'resume_to_interview', contextVersion: 1, projection: {}, conflicts: [],
      consent: { scope: 'one_time', purpose: 'resume_to_interview', includedItemIds: [reference.contextItemId], excludedItemIds: [], sourceModules: ['resume'], acknowledgedAt: new Date().toISOString() },
      sourceModules: ['resume'], groundingReferences: [reference], createdAt: new Date().toISOString(),
    } as any);
    expect(plan.questionSet[0].question).toContain('Led the Atlas migration');
    expect(plan.questionSet[0].groundingReferences).toEqual([reference]);
  });

  it('fails closed instead of attaching a reference with no usable fact', () => {
    expect(() => buildDeterministicInterviewPlan('Engineer', 'Practice', controls, ['p1'], {
      groundingReferences: [{ exactExcerpt: null, label: 'Generic label' }], projection: {},
    } as any)).toThrow('requires authoritative snapshot facts');
  });
});
