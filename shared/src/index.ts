import { z } from 'zod';

// ============================================================================
// COMMON CONTRACTS & ERROR CODES
// ============================================================================

export const ApiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'CONTRACT_RESPONSE_INVALID',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR'
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: ApiErrorCodeSchema.optional(),
  details: z.unknown().optional(),
}).strict();
export type ApiErrorType = z.infer<typeof ApiErrorSchema>;

export const CanonicalSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.literal(true),
  data: dataSchema
}).strict();

export const CanonicalErrorSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema
}).strict();

export const EvaluationStatusSchema = z.enum(['scored', 'insufficient_evidence', 'not_tested']);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const ReportGenerationStateSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ReportGenerationState = z.infer<typeof ReportGenerationStateSchema>;

export const EvidenceConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type EvidenceConfidence = z.infer<typeof EvidenceConfidenceSchema>;

// ============================================================================
// INTERVIEW DIMENSION KEYS & SESSION CONTROLS
// ============================================================================

export const DimensionKeySchema = z.enum([
  'PROBLEM_FRAMING',
  'SYSTEMS_THINKING',
  'TRADEOFF_CLARITY',
  'UNCERTAINTY_HANDLING',
  'AI_COLLABORATION',
  'STAKEHOLDER_FLUENCY',
  'DECISION_QUALITY',
  'INTELLECTUAL_HONESTY',
  'RECOVERY_QUALITY',
  'NARRATIVE_COHERENCE'
]);
export type DimensionKey = z.infer<typeof DimensionKeySchema>;

export const DifficultySchema = z.enum(['starter', 'intermediate', 'expert']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const TimePerQuestionSchema = z.enum(['45s', '90s', '120s', 'none']);
export type TimePerQuestion = z.infer<typeof TimePerQuestionSchema>;

export const DeliveryModeSchema = z.enum(['exam', 'coach']);
export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;

export const ReasoningModeSchema = z.enum([
  'classic_behavioral',
  'classic_technical',
  'narrative_reasoning',
  'problem_framing',
  'tradeoff_decision',
  'stakeholder_pressure',
  'ai_collaboration_review',
  'uncertainty_handling',
  'adversarial_pushback'
]);
export type ReasoningMode = z.infer<typeof ReasoningModeSchema>;

export const SourceModeSchema = z.enum(['job_description', 'question_bank', 'resume']);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const SessionControlsSchema = z.object({
  difficulty: DifficultySchema,
  totalQuestions: z.number(),
  includeBehavioral: z.boolean(),
  includeCoding: z.boolean(),
  timePerQuestion: TimePerQuestionSchema,
  deliveryMode: DeliveryModeSchema,
  reasoningMode: ReasoningModeSchema,
  sourceMode: SourceModeSchema.optional(),
  targetCompetencies: z.array(z.string()).optional(),
  targetDimensions: z.array(DimensionKeySchema).optional(),
}).strict();
export type SessionControls = z.infer<typeof SessionControlsSchema>;

// ============================================================================
// QUESTION BLUEPRINT & JD INSIGHTS
// ============================================================================

export const QuestionBlueprintSchema = z.object({
  id: z.string(),
  phase: z.string(),
  difficulty: z.string(),
  question: z.string(),
  expectedSignals: z.array(z.string()),
  personaFocus: z.string(),
  type: z.string().optional(),
  failureModes: z.array(z.string()).optional(),
  evaluationCriteria: z.array(z.string()).optional(),
  rubric: z.record(z.string(), z.string()).optional(),
  sourceBullets: z.array(z.string()).optional(),
  language: z.string().optional(),
  timeAllocation: z.number().optional(),
  relatedDimensions: z.array(DimensionKeySchema).optional(),
}).strict();
export type QuestionBlueprint = z.infer<typeof QuestionBlueprintSchema>;

export const JDInsightsSchema = z.object({
  source: z.string().optional(),
  role: z.string().optional(),
  level: z.string().optional(),
  mustHaveSkills: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  softSkills: z.array(z.string()).optional(),
  competencyWeights: z.record(z.string(), z.number()).optional(),
}).strict();
export type JDInsights = z.infer<typeof JDInsightsSchema>;

// ============================================================================
// INTERVIEW PLAN & CONTEXT
// ============================================================================

export const InterviewPlanSchema = z.object({
  meta: z.object({
    intent: z.string(),
    controls: SessionControlsSchema,
  }).strict(),
  jdInsights: JDInsightsSchema,
  questionSet: z.array(QuestionBlueprintSchema).min(1),
}).strict();
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export const InterviewSessionContextSchema = z.object({
  candidateRole: z.string(),
  intentText: z.string(),
  selectedPanelIDs: z.array(z.string()),
  controls: SessionControlsSchema,
  interviewPlan: InterviewPlanSchema,
  sessionType: z.enum(['structured', 'conversational']),
  competencyWeights: z.array(z.unknown()).optional(),
  jdInsights: JDInsightsSchema.optional(),
}).strict();
export type InterviewSessionContext = z.infer<typeof InterviewSessionContextSchema>;

export const InterviewTurnSchema = z.object({
  id: z.string(),
  interviewer: z.string(),
  question: z.string(),
  candidateResponse: z.string().optional(),
  timestamp: z.number().optional(),
}).strict();
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

// ============================================================================
// RAW PROVIDER PLAN SCHEMAS (NO Z.ANY)
// ============================================================================

export const RawQuestionBlueprintSchema = z.object({
  id: z.string().optional(),
  phase: z.string().optional(),
  difficulty: z.string().optional(),
  question: z.string(),
  expectedSignals: z.array(z.string()).optional(),
  personaFocus: z.string().optional(),
  type: z.string().optional(),
  failureModes: z.array(z.string()).optional(),
  evaluationCriteria: z.array(z.string()).optional(),
  rubric: z.record(z.string(), z.string()).optional(),
  sourceBullets: z.array(z.string()).optional(),
  language: z.string().optional(),
  timeAllocation: z.number().optional(),
  relatedDimensions: z.array(z.string()).optional(),
}).passthrough();

export const RawInterviewPlanSchema = z.object({
  meta: z.object({
    intent: z.string().optional(),
    controls: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  jdInsights: z.record(z.string(), z.unknown()).optional(),
  questionSet: z.array(RawQuestionBlueprintSchema),
}).passthrough();

// ============================================================================
// REPORT CONTRACTS
// ============================================================================

export const DimensionScoreSchema = z.object({
  dimension: DimensionKeySchema,
  dimensionName: z.string().optional(),
  score_status: EvaluationStatusSchema,
  anchor_score: z.number().nullable(),
  normalized_score: z.number().nullable(),
  reason: z.string(),
  evidence: z.array(z.string()),
  confidence: EvidenceConfidenceSchema,
}).strict();
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const EvaluationModelEnum = z.enum([
  'mockmate_v1_canonical',
  'gemini_flash_2.5_canonical',
  'groq_llama3_canonical',
  'deterministic_fallback_unscored',
  'v1_dimensions',
  'unknown'
]);
export type EvaluationModel = z.infer<typeof EvaluationModelEnum>;

export const ReadinessStatusEnum = z.enum([
  'INTERVIEW_READY',
  'ALMOST_READY',
  'NOT_READY',
  'NOT_ASSESSED'
]);
export type ReadinessStatus = z.infer<typeof ReadinessStatusEnum>;

export const AdvisoryPanelSchema = z.object({
  name: z.string(),
  assessment: z.string(),
  hireRecommendation: z.boolean().nullable(),
}).strict();
export type AdvisoryPanel = z.infer<typeof AdvisoryPanelSchema>;

export const BiggestRiskSchema = z.object({
  title: z.string(),
  observation: z.string(),
  mitigation: z.string(),
}).strict();
export type BiggestRisk = z.infer<typeof BiggestRiskSchema>;

export const RedoNowSchema = z.object({
  question: z.string(),
  instruction: z.string(),
}).strict();
export type RedoNow = z.infer<typeof RedoNowSchema>;

export const MicroDrillSchema = z.object({
  weakness: z.string(),
  drill_prompt: z.string(),
  focus_point: z.string(),
}).strict();
export type MicroDrill = z.infer<typeof MicroDrillSchema>;

export const CoachPackSchema = z.object({
  title: z.string(),
  redoNow: z.union([RedoNowSchema, z.string()]),
  micro_drills: z.array(z.union([MicroDrillSchema, z.string()])),
}).strict();
export type CoachPack = z.infer<typeof CoachPackSchema>;

export const TrajectoryReplaySchema = z.object({
  summary: z.string(),
  keyMoments: z.array(z.string()),
}).strict();
export type TrajectoryReplay = z.infer<typeof TrajectoryReplaySchema>;

export const AuditFindingsSchema = z.object({
  biasDetected: z.boolean(),
  notes: z.string(),
}).strict();
export type AuditFindings = z.infer<typeof AuditFindingsSchema>;

export const PrioritizedActionSchema = z.object({
  action: z.string(),
  impact: z.string(),
}).strict();
export type PrioritizedAction = z.infer<typeof PrioritizedActionSchema>;

export const ProviderMetadataSchema = z.object({
  provider: z.string(),
  model: z.string(),
  tokens: z.number().optional(),
}).strict();
export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;

export const QuestionPerformanceSchema = z.object({
  question_text: z.string(),
  question_phase: z.string().optional(),
  user_transcript: z.string(),
  max_impact_response: z.string().optional(),
  feedback: z.string(),
  strengths: z.array(z.string()).optional(),
  improvements: z.array(z.string()).optional(),
}).strict();
export type QuestionPerformance = z.infer<typeof QuestionPerformanceSchema>;

export const FinalReportSchema = z.object({
  overallSummary: z.string(),
  evaluationModel: EvaluationModelEnum,
  readiness: z.object({
    status: ReadinessStatusEnum,
    reasoning: z.string(),
  }).strict(),
  quantitativeAnalysis: z.object({
    dimension_scores: z.array(DimensionScoreSchema),
  }).strict(),
  advisoryPanel: z.array(AdvisoryPanelSchema),
  questionPerformance: z.array(QuestionPerformanceSchema),
  biggestRiskArea: BiggestRiskSchema.nullable().optional(),
  coachPack: CoachPackSchema.nullable().optional(),
  trajectoryReplay: z.array(TrajectoryReplaySchema),
  auditLayer: z.array(AuditFindingsSchema),
  simplifiedScore: z.number().nullable(),
  topStrength: z.string().optional(),
  topWeakness: z.string().optional(),
  estimatedSessionsToReady: z.number().nullable().optional(),
  quickWins: z.array(z.string()),
  prioritizedActions: z.array(PrioritizedActionSchema),
  providerMetadata: ProviderMetadataSchema.optional(),
}).strict();
export type FinalReport = z.infer<typeof FinalReportSchema>;

// ============================================================================
// RAW PROVIDER REPORT CONTRACTS
// ============================================================================

export const RawDimensionScoreSchema = z.object({
  dimension: z.string().optional(),
  dimensionName: z.string().optional(),
  score_status: z.string().optional(),
  anchor_score: z.number().nullable().optional(),
  normalized_score: z.number().nullable().optional(),
  reason: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  confidence: z.string().optional(),
}).passthrough();

export const RawFinalReportSchema = z.object({
  overallSummary: z.string(),
  evaluationModel: z.string().optional(),
  readiness: z.object({
    status: z.string().optional(),
    reasoning: z.string().optional(),
  }).passthrough().optional(),
  quantitativeAnalysis: z.object({
    dimension_scores: z.array(RawDimensionScoreSchema).optional(),
  }).passthrough().optional(),
  advisoryPanel: z.array(z.object({
    name: z.string().optional(),
    assessment: z.string().optional(),
    hireRecommendation: z.boolean().nullable().optional(),
  }).passthrough()).optional(),
  questionPerformance: z.array(z.object({
    question_text: z.string().optional(),
    question_phase: z.string().optional(),
    user_transcript: z.string().optional(),
    max_impact_response: z.string().optional(),
    feedback: z.string().optional(),
    strengths: z.array(z.string()).optional(),
    improvements: z.array(z.string()).optional(),
  }).passthrough()).optional(),
  biggestRiskArea: z.object({
    title: z.string().optional(),
    observation: z.string().optional(),
    mitigation: z.string().optional(),
  }).passthrough().optional(),
  coachPack: z.object({
    title: z.string().optional(),
    redoNow: z.union([
      z.string(),
      z.object({ question: z.string().optional(), instruction: z.string().optional() }).passthrough()
    ]).optional(),
    micro_drills: z.array(z.union([
      z.string(),
      z.object({ weakness: z.string().optional(), drill_prompt: z.string().optional(), focus_point: z.string().optional() }).passthrough()
    ])).optional(),
  }).passthrough().optional(),
  trajectoryReplay: z.array(z.object({
    summary: z.string().optional(),
    keyMoments: z.array(z.string()).optional(),
  }).passthrough()).optional(),
  auditLayer: z.array(z.object({
    biasDetected: z.boolean().optional(),
    notes: z.string().optional(),
  }).passthrough()).optional(),
  simplifiedScore: z.number().nullable().optional(),
  topStrength: z.string().optional(),
  topWeakness: z.string().optional(),
  estimatedSessionsToReady: z.number().nullable().optional(),
  quickWins: z.array(z.string()).optional(),
  prioritizedActions: z.array(z.object({
    action: z.string().optional(),
    impact: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();
export type RawFinalReport = z.infer<typeof RawFinalReportSchema>;

// ============================================================================
// CANONICAL API REQUEST / RESPONSE SCHEMAS FOR INTERVIEW ROUTE
// ============================================================================

export const CalibrateRequestSchema = z.object({
  role: z.string(),
  jobDescription: z.string().optional(),
}).strict();

export const CalibrateResponseSchema = z.object({
  recommendedPanelIDs: z.array(z.string()),
  recommendedRole: z.string(),
  matchReasons: z.record(z.string(), z.string()).optional(),
  suggestedControls: SessionControlsSchema.optional(),
  jdInsights: JDInsightsSchema.optional(),
}).strict();
export type CalibrateResponse = z.infer<typeof CalibrateResponseSchema>;

export const PlanGenerationRequestSchema = z.object({
  role: z.string(),
  intent: z.string(),
  controls: SessionControlsSchema,
  jdText: z.string().optional(),
  resumeText: z.string().optional(),
}).strict();

export const InterviewSessionStartRequestSchema = z.object({
  context: InterviewSessionContextSchema,
}).strict();

export const InterviewSessionStartResponseSchema = z.object({
  sessionId: z.string(),
  openingMessage: z.string(),
  firstQuestion: QuestionBlueprintSchema,
  questionIndex: z.number(),
  totalQuestions: z.number(),
}).strict();
export type InterviewSessionStartResponse = z.infer<typeof InterviewSessionStartResponseSchema>;

export const AnswerSubmissionRequestSchema = z.object({
  questionId: z.string(),
  expectedQuestionIndex: z.number(),
  answerKind: z.enum(['answered', 'skipped']),
  answerText: z.string().optional(),
}).strict();

export const AnswerSubmissionResponseSchema = z.object({
  completedTurnId: z.string(),
  nextQuestion: QuestionBlueprintSchema.nullable(),
  isLastQuestion: z.boolean(),
  questionIndex: z.number(),
  totalQuestions: z.number(),
}).strict();
export type AnswerSubmissionResponse = z.infer<typeof AnswerSubmissionResponseSchema>;

export const HintRequestSchema = z.object({
  questionText: z.string(),
  expectedSignals: z.array(z.string()),
}).strict();

export const HintResponseSchema = z.object({
  hint: z.string(),
}).strict();
export type HintResponse = z.infer<typeof HintResponseSchema>;

export const IdealResponseRequestSchema = z.object({
  questionText: z.string(),
  expectedSignals: z.array(z.string()),
  userAnswer: z.string().optional(),
}).strict();

export const IdealResponseResponseSchema = z.object({
  idealResponse: z.string(),
}).strict();
export type IdealResponseResponse = z.infer<typeof IdealResponseResponseSchema>;

export const ReportFetchResponseSchema = z.object({
  sessionId: z.string(),
  status: ReportGenerationStateSchema,
  report: FinalReportSchema.nullable(),
}).strict();
export type ReportFetchResponse = z.infer<typeof ReportFetchResponseSchema>;

export const CodeAnalysisRequestSchema = z.object({
  blueprint: QuestionBlueprintSchema.optional(),
  code: z.string(),
}).strict();

export const CodeSimulationRequestSchema = z.object({
  code: z.string(),
  language: z.string(),
}).strict();

export const AccountDeletionResponseSchema = z.object({
  success: z.boolean().default(true),
  message: z.string().optional(),
}).strict();
export type AccountDeletionResponse = z.infer<typeof AccountDeletionResponseSchema>;

export const CodeSimulationResponseSchema = z.object({
  status: z.enum(['success', 'unavailable']),
  stdout: z.string(),
  stderr: z.string(),
}).strict();
export type CodeSimulationResponse = z.infer<typeof CodeSimulationResponseSchema>;

// ============================================================================
// RESUME SCHEMAS
// ============================================================================

export const ResumeDataSchema = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedinUrl: z.string().optional(),
    portfolioUrl: z.string().optional(),
  }).strict(),
  summary: z.string().optional(),
  skills: z.array(z.object({
    category: z.string(),
    items: z.array(z.string())
  }).strict()).optional(),
  experience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    bullets: z.array(z.string()),
  }).strict()).optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    tools: z.array(z.string()),
    url: z.string().optional(),
  }).strict()).optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    year: z.string().optional(),
  }).strict()).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    year: z.string().optional(),
  }).strict()).optional(),
  awards: z.array(z.object({
    title: z.string(),
    description: z.string(),
  }).strict()).optional(),
  metadata: z.object({
    parseScore: z.number().optional(),
    jdScore: z.number().optional(),
    contentScore: z.number().optional(),
  }).strict().optional(),
}).strict();
export type ResumeData = z.infer<typeof ResumeDataSchema>;

export const ATSDiagnosticIssueSchema = z.object({
  id: z.string(),
  message: z.string(),
}).strict();

export const ATSDiagnosticsResultSchema = z.object({
  score: z.number(),
  highConfidenceIssues: z.array(ATSDiagnosticIssueSchema),
  possibleRiskIssues: z.array(ATSDiagnosticIssueSchema),
}).strict();
export type ATSDiagnosticsResult = z.infer<typeof ATSDiagnosticsResultSchema>;

export const JDMatchResultSchema = z.object({
  jdMatchScore: z.number(),
  matchedSkills: z.array(z.string()),
  deterministicMissingSkills: z.array(z.string()),
  llmMissingHardSkills: z.array(z.string()),
  llmMissingSoftSkills: z.array(z.string()),
}).strict();
export type JDMatchResult = z.infer<typeof JDMatchResultSchema>;

export const ResumeScoreResponseSchema = z.object({
  success: z.boolean(),
  atsDiagnostics: ATSDiagnosticsResultSchema,
  jdMatch: JDMatchResultSchema.nullable(),
}).strict();
export type ResumeScoreResponse = z.infer<typeof ResumeScoreResponseSchema>;

export const ResumeSuggestionResponseSchema = z.object({
  success: z.boolean(),
  bulletSuggestions: z.array(z.string()),
  summarySuggestion: z.string().optional(),
  jdUsed: z.boolean(),
}).strict();
export type ResumeSuggestionResponse = z.infer<typeof ResumeSuggestionResponseSchema>;

// ============================================================================
// CLEARSPEAK SCHEMAS
// ============================================================================

export const ClearSpeakLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const ClearSpeakDurationSchema = z.union([z.literal(3), z.literal(5)]);

export const HardWordEntrySchema = z.object({
  word: z.string(),
  failCount: z.number(),
  lastAttemptedAt: z.string(),
  resolved: z.boolean(),
}).strict();
export type HardWordEntry = z.infer<typeof HardWordEntrySchema>;

export const HardWordsLedgerSchema = z.object({
  userId: z.string(),
  entries: z.array(HardWordEntrySchema),
  updatedAt: z.string(),
}).strict();
export type HardWordsLedger = z.infer<typeof HardWordsLedgerSchema>;

export const ClearSpeakProfileSchema = z.object({
  userId: z.string(),
  role: z.string(),
  level: ClearSpeakLevelSchema,
  goal: z.string(),
  audienceContext: z.string(),
  mainStruggle: z.string(),
  comfortLanguage: z.string(),
  practiceDuration: ClearSpeakDurationSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type ClearSpeakProfile = z.infer<typeof ClearSpeakProfileSchema>;

export const PassageTokenSchema = z.object({
  text: z.string(),
  isStressed: z.boolean(),
  pauseType: z.enum(['none', 'short', 'stop']),
}).strict();
export type PassageToken = z.infer<typeof PassageTokenSchema>;

export const ClearSpeakSessionContentSchema = z.object({
  topicTag: z.string(),
  difficultyLevel: z.number(),
  targetSkill: z.string(),
  keyVocab: z.array(z.string()),
  passageData: z.array(PassageTokenSchema),
  repeatPhrase: z.string().optional(),
  retrySentence: z.string().optional(),
  bridgeReady: z.boolean(),
  interviewBridgeQuestion: z.string().optional(),
}).strict();
export type ClearSpeakSessionContent = z.infer<typeof ClearSpeakSessionContentSchema>;

export const ClearSpeakSessionScoreSchema = z.object({
  clarity: z.number(),
  pacing: z.number(),
  rhythm: z.number(),
  composite: z.number(),
  hardWordBonus: z.number(),
  feedbackTip: z.string(),
  measuredWpm: z.number(),
  retrySuccess: z.boolean(),
  mockData: z.boolean().optional(),
}).strict();
export type ClearSpeakSessionScore = z.infer<typeof ClearSpeakSessionScoreSchema>;

export const ClearSpeakProgressSchema = z.object({
  userId: z.string(),
  streak: z.number(),
  lastPracticeDate: z.string(),
  clarityTrend: z.array(z.number()),
  topicBestScores: z.record(z.string(), z.number()),
  bestPerformingTopic: z.string(),
  hardWordCount: z.number(),
  totalSessionsCompleted: z.number(),
  updatedAt: z.string(),
}).strict();
export type ClearSpeakProgress = z.infer<typeof ClearSpeakProgressSchema>;

export const ClearSpeakScoreResponseSchema = z.object({
  success: z.boolean(),
  score: ClearSpeakSessionScoreSchema,
}).strict();
export type ClearSpeakScoreResponse = z.infer<typeof ClearSpeakScoreResponseSchema>;

export const BridgeTriggerStateSchema = z.object({
  streakMet: z.boolean(),
  rollingAvgMet: z.boolean(),
  currentSessionStable: z.boolean(),
  bridgeReadyFlag: z.boolean(),
  shouldSurface: z.boolean(),
}).strict();
export type BridgeTriggerState = z.infer<typeof BridgeTriggerStateSchema>;

export const TranscribeAudioResponseSchema = z.object({
  transcript: z.string(),
}).strict();
export type TranscribeAudioResponse = z.infer<typeof TranscribeAudioResponseSchema>;

export const CodeAnalysisResponseSchema = z.object({
  status: z.enum(['analyzed', 'unavailable']),
  feedback: z.string(),
  passed: z.boolean().nullable(),
}).strict();
export type CodeAnalysisResponse = z.infer<typeof CodeAnalysisResponseSchema>;
