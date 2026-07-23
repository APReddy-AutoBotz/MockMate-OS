import {
  AdaptivePolicySchema,
  QuestionKindSchema,
  InterviewStageSchema,
  ChallengeEventTypeSchema,
  TurnEvaluationSchema,
  DEFAULT_ADAPTIVE_POLICY,
  normalizeQuestionBlueprint,
  ReasoningModeSchema,
  ReasoningMode,
} from 'mockmate-shared';
import { MODE_POLICIES, getModePolicy } from '../config/modePolicies';
import { APPROVED_DIMENSIONS } from '../config/evaluationConfig';
import { sanitizeAndVerifyEvaluation, isExactSubstring, normalizeWhitespace } from '../services/turnEvaluatorService';
import { computeAdaptiveDecision, constructNextQuestion } from '../services/adaptiveInterviewController';
import { aggregateTurnEvidence } from '../services/evidenceAggregationService';

describe('P0-2 Adaptive Engine Shared Contracts & Mode Policies', () => {
  it('enforces strict AdaptivePolicy bounds', () => {
    const valid = AdaptivePolicySchema.parse({
      enabled: true,
      maxTurns: 8,
      maxProbesPerRoot: 1,
      maxChallenges: 2,
      requireReflection: true,
    });
    expect(valid.maxTurns).toBe(8);

    expect(() => AdaptivePolicySchema.parse({ ...valid, maxTurns: 15 })).toThrow();
    expect(() => AdaptivePolicySchema.parse({ ...valid, maxProbesPerRoot: 3 })).toThrow();
    expect(() => AdaptivePolicySchema.parse({ ...valid, maxChallenges: 5 })).toThrow();
  });

  it('validates QuestionKind, InterviewStage, and ChallengeEventType enums', () => {
    expect(QuestionKindSchema.parse('root')).toBe('root');
    expect(QuestionKindSchema.parse('probe')).toBe('probe');
    expect(QuestionKindSchema.parse('challenge')).toBe('challenge');
    expect(QuestionKindSchema.parse('reflection')).toBe('reflection');

    expect(InterviewStageSchema.parse('framing')).toBe('framing');
    expect(InterviewStageSchema.parse('challenge')).toBe('challenge');

    expect(ChallengeEventTypeSchema.parse('assumption_challenge')).toBe('assumption_challenge');
    expect(ChallengeEventTypeSchema.parse('scale_change')).toBe('scale_change');
  });

  it('defines deterministic mode policies for all 9 reasoning modes', () => {
    const modes: ReasoningMode[] = [
      'classic_behavioral',
      'classic_technical',
      'narrative_reasoning',
      'problem_framing',
      'tradeoff_decision',
      'stakeholder_pressure',
      'ai_collaboration_review',
      'uncertainty_handling',
      'adversarial_pushback',
    ];

    for (const mode of modes) {
      const policy = getModePolicy(mode);
      expect(policy.mode).toBe(mode);
      expect(policy.activeDimensions.length).toBeGreaterThanOrEqual(4);
      expect(policy.stageSequence.length).toBeGreaterThanOrEqual(3);
      expect(policy.maxProbesPerRoot).toBeGreaterThanOrEqual(0);
      expect(policy.maxProbesPerRoot).toBeLessThanOrEqual(2);
      expect(policy.maxChallenges).toBeGreaterThanOrEqual(0);
      expect(policy.maxChallenges).toBeLessThanOrEqual(3);
      expect(policy.completionRules.maxTurnsCap).toBeLessThanOrEqual(12);

      // Verify active dimensions exist in APPROVED_DIMENSIONS
      for (const dim of policy.activeDimensions) {
        expect(APPROVED_DIMENSIONS[dim]).toBeDefined();
        expect(APPROVED_DIMENSIONS[dim].anchors[0]).toBeDefined();
        expect(APPROVED_DIMENSIONS[dim].anchors[4]).toBeDefined();
      }
    }
  });

  it('normalizes legacy P0-1 question blueprints into canonical P0-2 shape', () => {
    const rawLegacy = {
      id: 'q_legacy_1',
      question: 'Explain React state.',
      expectedSignals: ['Signal 1'],
      personaFocus: 'p1',
    };

    const normalized = normalizeQuestionBlueprint(rawLegacy);
    expect(normalized.id).toBe('q_legacy_1');
    expect(normalized.questionKind).toBe('root');
    expect(normalized.rootQuestionId).toBe('q_legacy_1');
    expect(normalized.stage).toBe('framing');
  });
});

describe('P0-2 Turn Evaluator & Exact Evidence Verification', () => {
  const blueprint = normalizeQuestionBlueprint({
    id: 'q1',
    question: 'How do you handle microservices latency spikes?',
    expectedSignals: ['Caching', 'Circuit breaker', 'Trade-offs'],
    personaFocus: 'p1',
    questionKind: 'root',
    stage: 'exploration',
  });

  it('verifies exact candidate evidence substring', () => {
    const candidateText = 'I implemented a Redis caching layer to reduce DB latency by 40%.';
    const rawEval = {
      evaluationStatus: 'evaluated',
      answerSummary: 'Candidate added caching.',
      observations: [
        {
          dimension: 'SYSTEMS_THINKING',
          anchorScore: 3,
          confidence: 'high',
          evidenceExcerpt: 'implemented a Redis caching layer',
          signal: 'Caching strategy',
          rationale: 'Observed Redis cache choice.',
          stage: 'exploration',
          turnKind: 'root',
        },
      ],
      missingSignals: ['Circuit breaker'],
    };

    const verified = sanitizeAndVerifyEvaluation(rawEval, candidateText, blueprint, 'classic_technical');
    expect(verified.evaluationStatus).toBe('evaluated');
    expect(verified.observations[0].anchorScore).toBe(3);
    expect(verified.observations[0].evidenceExcerpt).toBe('implemented a Redis caching layer');
  });

  it('demotes observation score to null when quote is not an exact candidate substring', () => {
    const candidateText = 'I used a cache to speed up requests.';
    const rawEval = {
      evaluationStatus: 'evaluated',
      answerSummary: 'Candidate used caching.',
      observations: [
        {
          dimension: 'SYSTEMS_THINKING',
          anchorScore: 4,
          confidence: 'high',
          evidenceExcerpt: 'invented quotation that does not exist in candidate response',
          signal: 'Caching strategy',
          rationale: 'Fake quote',
          stage: 'exploration',
          turnKind: 'root',
        },
      ],
      missingSignals: [],
    };

    const verified = sanitizeAndVerifyEvaluation(rawEval, candidateText, blueprint, 'classic_technical');
    expect(verified.observations[0].anchorScore).toBeNull();
    expect(verified.observations[0].evidenceExcerpt).toBeNull();
  });

  it('rejects interviewer question text as candidate evidence', () => {
    const candidateText = 'We should optimize database queries and set timeouts.';
    const rawEval = {
      evaluationStatus: 'evaluated',
      answerSummary: 'Candidate discussed timeouts.',
      observations: [
        {
          dimension: 'SYSTEMS_THINKING',
          anchorScore: 3,
          confidence: 'medium',
          evidenceExcerpt: 'How do you handle microservices latency spikes?', // Question text!
          signal: 'Latency aware',
          rationale: 'Quoting question',
          stage: 'exploration',
          turnKind: 'root',
        },
      ],
      missingSignals: [],
    };

    const verified = sanitizeAndVerifyEvaluation(rawEval, candidateText, blueprint, 'classic_technical');
    expect(verified.observations[0].anchorScore).toBeNull();
  });

  it('returns insufficient_evidence for skipped answers', () => {
    const verified = sanitizeAndVerifyEvaluation({}, '[Question Skipped]', blueprint, 'classic_technical');
    expect(verified.evaluationStatus).toBe('insufficient_evidence');
    expect(verified.observations).toHaveLength(0);
  });
});

describe('P0-2 Adaptive Controller & Decision Engine', () => {
  const currentQ = normalizeQuestionBlueprint({
    id: 'root_1',
    question: 'How do you design a high-throughput queue?',
    expectedSignals: ['Partitioning', 'Backpressure'],
    personaFocus: 'p1',
    questionKind: 'root',
    stage: 'framing',
  });

  const nextRootQ = normalizeQuestionBlueprint({
    id: 'root_2',
    question: 'How do you handle database failover?',
    expectedSignals: ['Replication', 'Quorum'],
    personaFocus: 'p2',
    questionKind: 'root',
    stage: 'framing',
  });

  const initialState = {
    engineVersion: 'v2' as const,
    sessionVersion: 1,
    currentRootQuestionIndex: 0,
    currentTurnIndex: 0,
    currentStage: 'framing' as const,
    pendingQuestionKind: 'root' as const,
    activeRootQuestionId: 'root_1',
    probeCountForRoot: 0,
    challengeCount: 0,
    adaptivePolicy: DEFAULT_ADAPTIVE_POLICY,
    dimensionState: {} as any,
  };

  it('issues a probe when required signals are missing and probe budget is available', () => {
    const turnEval = TurnEvaluationSchema.parse({
      evaluationStatus: 'evaluated',
      answerSummary: 'Initial answer without backpressure.',
      observations: [],
      missingSignals: ['Backpressure'],
      recommendedProbe: 'How do you prevent producer buffer overflow?',
    });

    const decision = computeAdaptiveDecision({
      mode: 'classic_technical',
      state: initialState,
      currentQuestion: currentQ,
      evaluation: turnEval,
      remainingRootQuestions: [nextRootQ],
    });

    expect(decision.action).toBe('ask_probe');
    expect(decision.nextQuestionKind).toBe('probe');

    const constructed = constructNextQuestion(decision, {
      mode: 'classic_technical',
      state: initialState,
      currentQuestion: currentQ,
      evaluation: turnEval,
      remainingRootQuestions: [nextRootQ],
    });

    expect(constructed.nextQuestion?.questionKind).toBe('probe');
    expect(constructed.nextQuestion?.question).toContain('producer buffer overflow');
  });

  it('introduces a challenge event when sufficient initial reasoning is observed', () => {
    const turnEval = TurnEvaluationSchema.parse({
      evaluationStatus: 'evaluated',
      answerSummary: 'Strong initial architecture explanation.',
      observations: [
        {
          dimension: 'SYSTEMS_THINKING',
          anchorScore: 3,
          confidence: 'high',
          evidenceExcerpt: 'partitioned by customer ID',
          signal: 'Partitioning',
          rationale: 'Clear partitioning strategy.',
          stage: 'framing',
          turnKind: 'root',
        },
      ],
      missingSignals: [],
      recommendedProbe: null,
    });

    const decision = computeAdaptiveDecision({
      mode: 'classic_technical',
      state: initialState,
      currentQuestion: currentQ,
      evaluation: turnEval,
      remainingRootQuestions: [nextRootQ],
    });

    expect(decision.action).toBe('introduce_challenge');
    expect(decision.nextQuestionKind).toBe('challenge');

    const constructed = constructNextQuestion(decision, {
      mode: 'classic_technical',
      state: initialState,
      currentQuestion: currentQ,
      evaluation: turnEval,
      remainingRootQuestions: [nextRootQ],
    });

    expect(constructed.nextQuestion?.questionKind).toBe('challenge');
    expect(constructed.challengeEvent).toBeDefined();
    expect(constructed.challengeEvent?.type).toBeDefined();
  });

  it('enforces maximum turn cap and completes session', () => {
    const maxedState = {
      ...initialState,
      currentTurnIndex: 8,
      adaptivePolicy: { ...DEFAULT_ADAPTIVE_POLICY, maxTurns: 8 },
    };

    const decision = computeAdaptiveDecision({
      mode: 'classic_technical',
      state: maxedState,
      currentQuestion: currentQ,
      evaluation: TurnEvaluationSchema.parse({
        evaluationStatus: 'evaluated',
        answerSummary: 'Good answer.',
        observations: [],
        missingSignals: [],
        recommendedProbe: null,
      }),
      remainingRootQuestions: [nextRootQ],
    });

    expect(decision.action).toBe('complete_session');

    const constructed = constructNextQuestion(decision, {
      mode: 'classic_technical',
      state: maxedState,
      currentQuestion: currentQ,
      evaluation: {} as any,
      remainingRootQuestions: [nextRootQ],
    });

    expect(constructed.nextQuestion).toBeNull();
  });
});

describe('P0-2 Evidence Aggregation & Scorecard Rules', () => {
  it('requires evidence from at least 2 distinct turns to score a dimension', () => {
    const turnsSingle = [
      {
        turnId: 't1',
        stage: 'framing' as const,
        evaluation: TurnEvaluationSchema.parse({
          evaluationStatus: 'evaluated',
          answerSummary: 'Answer 1',
          observations: [
            {
              dimension: 'PROBLEM_FRAMING',
              anchorScore: 3,
              confidence: 'high',
              evidenceExcerpt: 'outlined system constraints',
              signal: 'Constraints mapped',
              rationale: 'Clear framing',
              stage: 'framing',
              turnKind: 'root',
            },
          ],
          missingSignals: [],
          recommendedProbe: null,
        }),
      },
    ];

    const resSingle = aggregateTurnEvidence(turnsSingle, 'problem_framing');
    const dimScoreSingle = resSingle.dimensionScores.find(d => d.dimension === 'PROBLEM_FRAMING');
    expect(dimScoreSingle?.score_status).toBe('insufficient_evidence');
    expect(dimScoreSingle?.anchor_score).toBeNull();

    // Now add second turn with evidence
    const turnsDouble = [
      ...turnsSingle,
      {
        turnId: 't2',
        stage: 'exploration' as const,
        evaluation: TurnEvaluationSchema.parse({
          evaluationStatus: 'evaluated',
          answerSummary: 'Answer 2',
          observations: [
            {
              dimension: 'PROBLEM_FRAMING',
              anchorScore: 4,
              confidence: 'high',
              evidenceExcerpt: 'separated knowns from unknowns',
              signal: 'Unknowns inventory',
              rationale: 'Rigorous framing',
              stage: 'exploration',
              turnKind: 'probe',
            },
          ],
          missingSignals: [],
          recommendedProbe: null,
        }),
      },
    ];

    const resDouble = aggregateTurnEvidence(turnsDouble, 'problem_framing');
    const dimScoreDouble = resDouble.dimensionScores.find(d => d.dimension === 'PROBLEM_FRAMING');
    expect(dimScoreDouble?.score_status).toBe('scored');
    expect(dimScoreDouble?.anchor_score).toBe(3.5);
    expect(dimScoreDouble?.normalized_score).toBe(88);
  });

  it('marks inactive dimensions for the mode as not_tested', () => {
    const res = aggregateTurnEvidence([], 'classic_behavioral');
    const techDim = res.dimensionScores.find(d => d.dimension === 'SYSTEMS_THINKING');
    expect(techDim?.score_status).toBe('not_tested');
    expect(techDim?.anchor_score).toBeNull();
  });

  it('sets readiness to NOT_ASSESSED when active dimension evidence is sparse', () => {
    const res = aggregateTurnEvidence([], 'classic_technical');
    expect(res.simplifiedScore).toBeNull();
    expect(res.readinessStatus).toBe('NOT_ASSESSED');
  });
});
