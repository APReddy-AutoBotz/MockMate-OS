import { 
  FinalReportSchema, 
  QuestionBlueprintSchema,
  ApiErrorCodeSchema,
  EvaluationStatusSchema,
  ReportGenerationStateSchema,
  SessionControlsSchema,
  JDInsightsSchema,
  RawInterviewPlanSchema,
  InterviewSessionStartResponseSchema,
  AnswerSubmissionResponseSchema,
  ATSDiagnosticsResultSchema,
  ClearSpeakProfileSchema,
  ClearSpeakSessionContentSchema,
  ClearSpeakSessionScoreSchema,
  TranscribeAudioResponseSchema,
  PlanGenerationRequestSchema,
  ApiErrorSchema
} from '../src/index';

describe('Shared Canonical Runtime Contracts', () => {
  it('validates explicit ApiErrorCode enums and rejects arbitrary strings', () => {
    expect(ApiErrorCodeSchema.safeParse('UNAUTHORIZED').success).toBe(true);
    expect(ApiErrorCodeSchema.safeParse('CONTRACT_RESPONSE_INVALID').success).toBe(true);
    expect(ApiErrorCodeSchema.safeParse('UNKNOWN_CUSTOM_CODE').success).toBe(false);
  });

  it('validates EvaluationStatus and ReportGenerationState separation', () => {
    expect(EvaluationStatusSchema.safeParse('scored').success).toBe(true);
    expect(EvaluationStatusSchema.safeParse('insufficient_evidence').success).toBe(true);
    expect(EvaluationStatusSchema.safeParse('not_tested').success).toBe(true);
    expect(EvaluationStatusSchema.safeParse('completed').success).toBe(false); // Separation rule

    expect(ReportGenerationStateSchema.safeParse('pending').success).toBe(true);
    expect(ReportGenerationStateSchema.safeParse('processing').success).toBe(true);
    expect(ReportGenerationStateSchema.safeParse('completed').success).toBe(true);
    expect(ReportGenerationStateSchema.safeParse('failed').success).toBe(true);
  });

  it('enforces strict unknown-field rejection on QuestionBlueprint', () => {
    const validQuestion = {
      id: 'q1',
      phase: 'scenario',
      difficulty: 'starter',
      question: 'Tell me about yourself',
      expectedSignals: ['communication'],
      personaFocus: 'lead'
    };
    expect(QuestionBlueprintSchema.safeParse(validQuestion).success).toBe(true);

    const questionWithExtraField = {
      ...validQuestion,
      unknownExtraProperty: 'forbidden'
    };
    expect(QuestionBlueprintSchema.safeParse(questionWithExtraField).success).toBe(false);
  });

  it('validates explicit JDInsights schema without z.any()', () => {
    const validJd = {
      source: 'job_description',
      role: 'Staff Engineer',
      level: 'L6',
      mustHaveSkills: ['TypeScript', 'Node.js'],
      niceToHave: ['GraphQL'],
      domains: ['Platform'],
      tools: ['Git', 'Docker'],
      softSkills: ['Leadership'],
      competencyWeights: { PROBLEM_FRAMING: 0.5, SYSTEMS_THINKING: 0.5 }
    };
    expect(JDInsightsSchema.safeParse(validJd).success).toBe(true);
  });

  it('validates RawInterviewPlanSchema without z.any()', () => {
    const raw = {
      meta: { intent: 'Practice' },
      jdInsights: { role: 'Engineer' },
      questionSet: [
        { question: 'What is CORS?' }
      ]
    };
    expect(RawInterviewPlanSchema.safeParse(raw).success).toBe(true);
  });

  it('validates InterviewSessionStartResponse and AnswerSubmissionResponse', () => {
    const startRes = {
      sessionId: 'sess_123',
      openingMessage: 'Welcome to the interview',
      firstQuestion: {
        id: 'q_1',
        phase: 'intro',
        difficulty: 'intermediate',
        question: 'Explain event loops.',
        expectedSignals: ['Asynchronous execution'],
        personaFocus: 'Lead Tech'
      },
      questionIndex: 0,
      totalQuestions: 5
    };
    expect(InterviewSessionStartResponseSchema.safeParse(startRes).success).toBe(true);

    const answerRes = {
      completedTurnId: 'turn_001',
      nextQuestion: null,
      isLastQuestion: true,
      questionIndex: 1,
      totalQuestions: 5
    };
    expect(AnswerSubmissionResponseSchema.safeParse(answerRes).success).toBe(true);
  });

  it('validates zero score and null score handling in FinalReport', () => {
    const baseReport = {
      overallSummary: 'Analysis complete.',
      evaluationModel: 'v1_dimensions',
      readiness: { status: 'ALMOST_READY', reasoning: 'Good work' },
      quantitativeAnalysis: {
        dimension_scores: [
          {
            dimension: 'PROBLEM_FRAMING',
            score_status: 'scored',
            anchor_score: 0,
            normalized_score: 0,
            reason: 'Zero score evaluated',
            evidence: ['Tested'],
            confidence: 'high',
            evidenceReferences: [
              { turnId: 't1', excerpt: 'ex1', stage: 'framing', questionKind: 'root', signal: 'sig1', anchorScore: 0, confidence: 'high' },
              { turnId: 't2', excerpt: 'ex2', stage: 'exploration', questionKind: 'probe', signal: 'sig2', anchorScore: 0, confidence: 'high' },
            ],
            trajectory: 'stable',
            distinctTurnCount: 2,
          },
          {
            dimension: 'TRADEOFF_CLARITY',
            score_status: 'not_tested',
            anchor_score: null,
            normalized_score: null,
            reason: 'Not tested',
            evidence: [],
            confidence: 'low',
            evidenceReferences: [],
            trajectory: null,
            distinctTurnCount: 0,
          }
        ]
      },
      advisoryPanel: [{ name: 'Lead', assessment: 'OK', hireRecommendation: true }],
      questionPerformance: [{ question_text: 'Q1', user_transcript: 'A1', feedback: 'Good' }],
      biggestRiskArea: { title: 'Risk', observation: 'Obs', mitigation: 'Mit' },
      coachPack: { title: 'Pack', redoNow: 'Q1', micro_drills: ['Drill'] },
      trajectoryReplay: [{ summary: 'Sum', keyMoments: ['M1'] }],
      auditLayer: [{ biasDetected: false, notes: 'None' }],
      simplifiedScore: null,
      quickWins: ['Win 1'],
      prioritizedActions: [{ action: 'Act 1', impact: 'high' }]
    };

    expect(FinalReportSchema.safeParse(baseReport).success).toBe(true);
  });

  it('validates ATS diagnostics with issue objects containing id and message', () => {
    const atsRes = {
      score: 85,
      highConfidenceIssues: [{ id: 'iss_1', message: 'Missing contact phone' }],
      possibleRiskIssues: [{ id: 'iss_2', message: 'Non-standard section header' }]
    };
    expect(ATSDiagnosticsResultSchema.safeParse(atsRes).success).toBe(true);
  });

  it('validates numeric ClearSpeak level/duration and session content/score', () => {
    const profile = {
      userId: 'u1',
      role: 'PM',
      level: 2,
      goal: 'Fluency',
      audienceContext: 'Executives',
      mainStruggle: 'Pacing',
      comfortLanguage: 'English',
      practiceDuration: 5,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    expect(ClearSpeakProfileSchema.safeParse(profile).success).toBe(true);

    const content = {
      topicTag: 'system_design',
      difficultyLevel: 2,
      targetSkill: 'Pacing',
      keyVocab: ['latency', 'throughput'],
      passageData: [{ text: 'System latency is low.', isStressed: true, pauseType: 'short' }],
      bridgeReady: true
    };
    expect(ClearSpeakSessionContentSchema.safeParse(content).success).toBe(true);

    const score = {
      clarity: 80,
      pacing: 85,
      rhythm: 75,
      composite: 80,
      hardWordBonus: 5,
      feedbackTip: 'Good pacing',
      measuredWpm: 140,
      retrySuccess: true
    };
    expect(ClearSpeakSessionScoreSchema.safeParse(score).success).toBe(true);
  });

  it('validates TranscribeAudioResponseSchema discriminated union for valid and invalid combinations', () => {
    // Valid cases
    expect(TranscribeAudioResponseSchema.safeParse({ status: 'transcribed', transcript: 'Hello world' }).success).toBe(true);
    expect(TranscribeAudioResponseSchema.safeParse({ status: 'unavailable', transcript: null }).success).toBe(true);

    // Invalid cases
    expect(TranscribeAudioResponseSchema.safeParse({ status: 'transcribed', transcript: null }).success).toBe(false);
    expect(TranscribeAudioResponseSchema.safeParse({ status: 'transcribed', transcript: '' }).success).toBe(false);
    expect(TranscribeAudioResponseSchema.safeParse({ status: 'unavailable', transcript: 'Fake text' }).success).toBe(false);
  });

  it('enforces non-empty selectedPanelIDs in PlanGenerationRequestSchema', () => {
    const validReq = {
      role: 'Backend Engineer',
      intent: 'Practice',
      controls: {
        difficulty: 'intermediate',
        totalQuestions: 5,
        includeBehavioral: true,
        includeCoding: true,
        timePerQuestion: '90s',
        deliveryMode: 'exam',
        reasoningMode: 'classic_technical',
        sourceMode: 'job_description'
      },
      selectedPanelIDs: ['p1', 'p3']
    };
    expect(PlanGenerationRequestSchema.safeParse(validReq).success).toBe(true);

    const emptyPanelReq = {
      ...validReq,
      selectedPanelIDs: []
    };
    expect(PlanGenerationRequestSchema.safeParse(emptyPanelReq).success).toBe(false);
  });
});
