import { hashInterviewPlan, jsonSafeInterviewPlan } from '../services/interviewPlanService';

describe('authoritative interview plan serialization', () => {
  const controls = {
    difficulty: 'intermediate' as const,
    totalQuestions: 1,
    includeBehavioral: true,
    includeCoding: false,
    timePerQuestion: '90s' as const,
    deliveryMode: 'exam' as const,
    reasoningMode: 'classic_behavioral' as const,
    sourceMode: 'job_description' as const,
  };

  it('hashes, returns, and reloads the same JSON-safe value when optional fields are undefined', () => {
    const providerPlan: any = {
      meta: { intent: 'Backend Engineer', controls, planSource: undefined },
      jdInsights: { role: 'Backend Engineer' },
      questionSet: [{
        id: 'q1', phase: 'scenario', difficulty: 'intermediate', question: 'Describe an outage.',
        expectedSignals: ['diagnosis'], personaFocus: 'p1', groundingReferences: undefined,
      }],
    };
    const persisted = jsonSafeInterviewPlan(providerPlan);
    const reloaded = JSON.parse(JSON.stringify(persisted));

    expect(JSON.stringify(persisted)).toBe(JSON.stringify(reloaded));
    expect(hashInterviewPlan(providerPlan)).toBe(hashInterviewPlan(reloaded));
    expect(JSON.stringify(persisted)).not.toContain('planSource');
    expect(JSON.stringify(persisted)).not.toContain('groundingReferences');

    reloaded.questionSet[0].question = 'Tampered question';
    expect(hashInterviewPlan(reloaded)).not.toBe(hashInterviewPlan(persisted));
  });
});
