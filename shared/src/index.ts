import { z } from 'zod';

// COMMON CONTRACTS
export const ApiErrorCodeSchema = z.string();
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: ApiErrorCodeSchema.optional(),
  details: z.any().optional(),
}).strict();

export const CanonicalSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.literal(true),
  data: dataSchema
}).strict();

export const CanonicalErrorSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema
}).strict();

export const EvaluationStatusSchema = z.enum(['scored', 'insufficient_evidence', 'not_tested', 'processing', 'completed', 'failed']);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const EvidenceConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type EvidenceConfidence = z.infer<typeof EvidenceConfidenceSchema>;

// INTERVIEW DIMENSION KEYS
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

export const SessionControlsSchema = z.object({
  difficulty: z.string(),
  totalQuestions: z.number(),
  includeBehavioral: z.boolean(),
  includeCoding: z.boolean(),
  timePerQuestion: z.string(),
  deliveryMode: z.string(),
  reasoningMode: z.string(),
  sourceMode: z.string().optional(),
  targetCompetencies: z.array(z.string()).optional(),
  targetDimensions: z.array(DimensionKeySchema).optional(),
}).strict();
export type SessionControls = z.infer<typeof SessionControlsSchema>;

// QUESTION BLUEPRINT
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

// INTERVIEW PLAN
export const InterviewPlanSchema = z.object({
  meta: z.object({
    intent: z.string(),
    controls: SessionControlsSchema,
  }).strict(),
  jdInsights: z.record(z.string(), z.any()),
  questionSet: z.array(QuestionBlueprintSchema).min(1),
}).strict();
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export const InterviewSessionContextSchema = z.object({
  candidateRole: z.string(),
  intentText: z.string(),
  selectedPanelIDs: z.array(z.string()),
  controls: SessionControlsSchema,
  interviewPlan: InterviewPlanSchema,
  sessionType: z.string(),
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

// REPORT
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

export const AdvisoryPanelSchema = z.object({
  name: z.string(),
  assessment: z.string(),
  hireRecommendation: z.boolean(),
}).strict();
export type AdvisoryPanel = z.infer<typeof AdvisoryPanelSchema>;

export const BiggestRiskSchema = z.object({
  title: z.string(),
  observation: z.string(),
  mitigation: z.string(),
}).strict();
export type BiggestRisk = z.infer<typeof BiggestRiskSchema>;

export const CoachPackSchema = z.object({
  title: z.string(),
  redoNow: z.string(),
  micro_drills: z.array(z.string()),
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
  evaluationModel: z.string(),
  readiness: z.object({
    status: z.string(),
    reasoning: z.string(),
  }).strict(),
  quantitativeAnalysis: z.object({
    dimension_scores: z.array(DimensionScoreSchema),
  }).strict(),
  advisoryPanel: z.array(AdvisoryPanelSchema),
  questionPerformance: z.array(QuestionPerformanceSchema),
  biggestRiskArea: BiggestRiskSchema,
  coachPack: CoachPackSchema,
  trajectoryReplay: z.array(TrajectoryReplaySchema),
  auditLayer: z.array(AuditFindingsSchema),
  simplifiedScore: z.number().nullable(),
  topStrength: z.string().optional(),
  topWeakness: z.string().optional(),
  estimatedSessionsToReady: z.number().optional(),
  quickWins: z.array(z.string()),
  prioritizedActions: z.array(PrioritizedActionSchema),
  providerMetadata: ProviderMetadataSchema.optional(),
}).strict();
export type FinalReport = z.infer<typeof FinalReportSchema>;

export const ReportGenerationStateSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ReportGenerationState = z.infer<typeof ReportGenerationStateSchema>;

// RESUME
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

export const ATSDiagnosticsResultSchema = z.object({
  score: z.number(),
  highConfidenceIssues: z.array(z.object({ id: z.string(), message: z.string() }).strict()),
  possibleRiskIssues: z.array(z.object({ id: z.string(), message: z.string() }).strict()),
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

// CLEARSPEAK
export const ClearSpeakProfileSchema = z.object({
  userId: z.string(),
  role: z.string(),
  level: z.enum(['1', '2', '3']),
  goal: z.string(),
  audienceContext: z.string(),
  mainStruggle: z.string(),
  comfortLanguage: z.string(),
  practiceDuration: z.enum(['3', '5'] as any).transform(v => Number(v)),
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
  topicBestScores: z.record(z.number()),
  bestPerformingTopic: z.string(),
  hardWordCount: z.number(),
  totalSessionsCompleted: z.number(),
  updatedAt: z.string(),
}).strict();
export type ClearSpeakProgress = z.infer<typeof ClearSpeakProgressSchema>;

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

export const BridgeTriggerStateSchema = z.object({
  streakMet: z.boolean(),
  rollingAvgMet: z.boolean(),
  currentSessionStable: z.boolean(),
  bridgeReadyFlag: z.boolean(),
  shouldSurface: z.boolean(),
}).strict();
export type BridgeTriggerState = z.infer<typeof BridgeTriggerStateSchema>;

export const ClearSpeakScoreResponseSchema = z.object({
  success: z.boolean(),
  score: ClearSpeakSessionScoreSchema,
}).strict();
export type ClearSpeakScoreResponse = z.infer<typeof ClearSpeakScoreResponseSchema>;

// Shared Raw Plan Schema (for Phase 3)
export const RawInterviewPlanSchema = z.object({
  meta: z.object({
    intent: z.string().optional(),
    controls: z.any().optional(),
  }).optional(),
  jdInsights: z.any().optional(),
  questionSet: z.array(z.any()),
});
