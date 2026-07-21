import { z } from 'zod';

// ==========================================
// CORE / BASE TYPES
// ==========================================
export const DimensionKeySchema = z.enum([
  'problem_solving',
  'communication',
  'technical_depth',
  'collaboration',
  'leadership',
  'ambiguity_navigation',
  'system_design',
  'code_quality',
  'adaptability',
  'delivery'
]);
export type DimensionKey = z.infer<typeof DimensionKeySchema>;

export const EvaluationStatusSchema = z.enum(['not_evaluated', 'insufficient_evidence', 'evaluated']);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const EvidenceConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type EvidenceConfidence = z.infer<typeof EvidenceConfidenceSchema>;

// ==========================================
// INTERVIEW CONTROLS & CONTEXT
// ==========================================
export const SessionControlsSchema = z.object({
  difficulty: z.enum(['starter', 'intermediate', 'expert']),
  totalQuestions: z.number(),
  includeBehavioral: z.boolean(),
  includeCoding: z.boolean(),
  timePerQuestion: z.string(),
  deliveryMode: z.enum(['exam', 'coach']),
  reasoningMode: z.enum([
    'classic_behavioral',
    'classic_technical',
    'narrative_reasoning',
    'problem_framing',
    'tradeoff_decision',
    'stakeholder_pressure',
    'ai_collaboration_review',
    'uncertainty_handling',
    'adversarial_pushback'
  ]),
  sourceMode: z.enum(['job_description', 'question_bank', 'resume']).optional(),
  targetCompetencies: z.array(z.string()).optional(),
  targetDimensions: z.array(DimensionKeySchema).optional(),
});
export type SessionControls = z.infer<typeof SessionControlsSchema>;

export const QuestionBlueprintSchema = z.object({
  id: z.string(),
  phase: z.string(),
  difficulty: z.string(),
  question: z.string(),
  expectedSignals: z.array(z.string()),
  personaFocus: z.string(),
  type: z.string().optional(),
  relatedCompetency: z.string().optional(),
  relatedDimensions: z.array(DimensionKeySchema).optional(),
});
export type QuestionBlueprint = z.infer<typeof QuestionBlueprintSchema>;

export const InterviewPlanSchema = z.object({
  meta: z.object({
    intent: z.string(),
    controls: SessionControlsSchema,
  }),
  jdInsights: z.string(),
  questionSet: z.array(QuestionBlueprintSchema).min(1),
  focusAreas: z.array(z.string()).optional(),
  personas: z.array(z.string()).optional(),
  adaptiveRules: z.array(z.string()).optional(),
});
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export const InterviewSessionContextSchema = z.object({
  candidateRole: z.string(),
  intentText: z.string(),
  selectedPanelIDs: z.array(z.string()),
  controls: SessionControlsSchema,
  interviewPlan: InterviewPlanSchema,
  sessionType: z.string(),
  resumeText: z.string().optional(),
  jobDescription: z.string().optional(),
  companyContext: z.string().optional(),
  timezone: z.string().optional(),
});
export type InterviewSessionContext = z.infer<typeof InterviewSessionContextSchema>;

// ==========================================
// INTERVIEW TURNS
// ==========================================
export const InterviewTurnSchema = z.object({
  turnId: z.string(),
  interviewer: z.string(),
  question: z.string(),
  candidateResponse: z.string().optional(),
  timestamp: z.number().optional(),
  codeSnippet: z.string().optional(),
  codeLanguage: z.string().optional(),
  codeFeedback: z.string().optional(),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

// ==========================================
// REPORT & EVALUATION
// ==========================================
export const DimensionScoreSchema = z.object({
  dimension: DimensionKeySchema,
  score_status: EvaluationStatusSchema,
  anchor_score: z.number().nullable(),
  normalized_score: z.number().nullable(),
  reason: z.string(),
  evidence: z.array(z.string()),
  confidence: EvidenceConfidenceSchema,
});
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;

export const CompetencyScoreSchema = z.object({
  competency: z.string(),
  score: z.number(),
  evidence: z.array(z.string()),
});
export type CompetencyScore = z.infer<typeof CompetencyScoreSchema>;

export const AdvisoryPanelSchema = z.object({
  consensus: z.string(),
  dissentingOpinions: z.array(z.string()),
});
export type AdvisoryPanel = z.infer<typeof AdvisoryPanelSchema>;

export const BiggestRiskSchema = z.object({
  description: z.string(),
  mitigation: z.string(),
});
export type BiggestRisk = z.infer<typeof BiggestRiskSchema>;

export const CoachPackSchema = z.object({
  focusArea: z.string(),
  exercises: z.array(z.string()),
});
export type CoachPack = z.infer<typeof CoachPackSchema>;

export const TrajectoryReplaySchema = z.object({
  summary: z.string(),
  keyMoments: z.array(z.string()),
});
export type TrajectoryReplay = z.infer<typeof TrajectoryReplaySchema>;

export const AuditFindingsSchema = z.object({
  biasDetected: z.boolean(),
  notes: z.string(),
});
export type AuditFindings = z.infer<typeof AuditFindingsSchema>;

export const PrioritizedActionSchema = z.object({
  action: z.string(),
  impact: z.string(),
});
export type PrioritizedAction = z.infer<typeof PrioritizedActionSchema>;

export const ProviderMetadataSchema = z.object({
  provider: z.string(),
  model: z.string(),
  tokens: z.number().optional(),
});
export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;

export const QuestionPerformanceSchema = z.object({
  question_text: z.string(),
  question_phase: z.string().optional(),
  user_transcript: z.string(),
  max_impact_response: z.string().optional(),
  feedback: z.string(),
  strengths: z.array(z.string()).optional(),
  improvements: z.array(z.string()).optional(),
  bars_rubric: z.any().optional(),
});
export type QuestionPerformance = z.infer<typeof QuestionPerformanceSchema>;

export const FinalReportSchema = z.object({
  overallSummary: z.string(),
  evaluationModel: z.enum(['legacy', 'v1_dimensions']),
  readiness: z.object({
    status: z.enum(['INTERVIEW_READY', 'ALMOST_READY', 'NOT_READY']),
    reasoning: z.string(),
  }),
  quantitativeAnalysis: z.object({
    competency_scores: z.array(CompetencyScoreSchema),
    dimension_scores: z.array(DimensionScoreSchema),
  }),
  advisoryPanel: AdvisoryPanelSchema,
  questionPerformance: z.array(QuestionPerformanceSchema),
  biggestRiskArea: BiggestRiskSchema.optional(),
  coachPack: CoachPackSchema,
  trajectoryReplay: TrajectoryReplaySchema.optional(),
  auditLayer: AuditFindingsSchema.optional(),
  pilotFeedback: z.any().optional(),
  simplifiedScore: z.number().nullable().optional(),
  topStrength: z.string().optional(),
  topWeakness: z.string().optional(),
  estimatedSessionsToReady: z.number().optional(),
  quickWins: z.array(z.string()).optional(),
  prioritizedActions: z.array(PrioritizedActionSchema).optional(),
  _metadata: ProviderMetadataSchema.optional(),
});
export type FinalReport = z.infer<typeof FinalReportSchema>;

export const ReportGenerationStateSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ReportGenerationState = z.infer<typeof ReportGenerationStateSchema>;

// ==========================================
// RESUME
// ==========================================

export const ResumeDataSchema = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedinUrl: z.string().optional(),
    portfolioUrl: z.string().optional(),
  }),
  summary: z.string().optional(),
  skills: z.array(z.object({
    category: z.string(),
    items: z.array(z.string())
  })).optional(),
  experience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    bullets: z.array(z.string()),
  })).optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    tools: z.array(z.string()),
    url: z.string().optional(),
  })).optional(),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    year: z.string().optional(),
  })).optional(),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    year: z.string().optional(),
  })).optional(),
  awards: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })).optional(),
  metadata: z.object({
    parseScore: z.number().optional(),
    jdScore: z.number().optional(),
    contentScore: z.number().optional(),
  }).optional(),
});
export type ResumeData = z.infer<typeof ResumeDataSchema>;

export const ATSDiagnosticsResultSchema = z.object({
  score: z.number(),
  highConfidenceIssues: z.array(z.string()),
  possibleRiskIssues: z.array(z.string()),
});
export type ATSDiagnosticsResult = z.infer<typeof ATSDiagnosticsResultSchema>;

export const JDMatchResultSchema = z.object({
  jdMatchScore: z.number(),
  matchedSkills: z.array(z.string()),
  deterministicMissingSkills: z.array(z.string()),
  llmMissingHardSkills: z.array(z.string()),
  llmMissingSoftSkills: z.array(z.string()),
});
export type JDMatchResult = z.infer<typeof JDMatchResultSchema>;

export const ResumeScoreResponseSchema = z.object({
  success: z.boolean(),
  atsDiagnostics: ATSDiagnosticsResultSchema,
  jdMatch: JDMatchResultSchema.nullable(),
});
export type ResumeScoreResponse = z.infer<typeof ResumeScoreResponseSchema>;

export const ResumeSuggestionResponseSchema = z.object({
  success: z.boolean(),
  bulletSuggestions: z.array(z.string()),
  summarySuggestion: z.string().optional(),
  jdUsed: z.boolean(),
});
export type ResumeSuggestionResponse = z.infer<typeof ResumeSuggestionResponseSchema>;

// ==========================================
// CLEARSPEAK
// ==========================================

export const ClearSpeakProfileSchema = z.object({
  userId: z.string(),
  targetAccent: z.string(),
  nativeLanguage: z.string(),
  focusAreas: z.array(z.string()),
  role: z.string(),
  practiceDuration: z.number(),
  level: z.enum(['1', '2', '3']),
  goal: z.string(),
  audienceContext: z.string(),
  mainStruggle: z.string(),
  comfortLanguage: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClearSpeakProfile = z.infer<typeof ClearSpeakProfileSchema>;

export const PassageTokenSchema = z.object({
  word: z.string(),
  isHardWord: z.boolean(),
  expectedPhonemes: z.array(z.string()).optional(),
});
export type PassageToken = z.infer<typeof PassageTokenSchema>;

export const ClearSpeakSessionContentSchema = z.object({
  passageData: z.array(PassageTokenSchema),
  keyVocab: z.array(z.string()),
  retrySentence: z.string().optional(),
  interviewBridgeQuestion: z.string().optional(),
  topicTag: z.string(),
  targetSkill: z.string(),
  text: z.string(),
  audioUrl: z.string().optional(),
  duration: z.number(),
  difficultyLevel: z.number(),
  repeatPhrase: z.string().optional(),
  bridgeReady: z.boolean(),
});
export type ClearSpeakSessionContent = z.infer<typeof ClearSpeakSessionContentSchema>;

export const ClearSpeakSessionScoreSchema = z.object({
  clarity: z.number(),
  pacing: z.number(),
  rhythm: z.number(),
  composite: z.number(),
  hardWordBonus: z.number(),
  feedbackTip: z.string(),
  pronunciationScore: z.number().nullable(),
  fluencyScore: z.number().nullable(),
  vocabularyScore: z.number().nullable(),
  feedback: z.string(),
  mockData: z.boolean().optional(),
  measuredWpm: z.number(),
  retrySuccess: z.boolean(),
});
export type ClearSpeakSessionScore = z.infer<typeof ClearSpeakSessionScoreSchema>;

export const ClearSpeakProgressSchema = z.object({
  sessionsCompleted: z.number(),
  averageScore: z.number(),
  improvement: z.number(),
  streak: z.number(),
  userId: z.string(),
  lastPracticeDate: z.string(),
  clarityTrend: z.array(z.number()),
  topicBestScores: z.record(z.number()),
  bestPerformingTopic: z.string(),
  hardWordCount: z.number(),
  totalSessionsCompleted: z.number(),
  updatedAt: z.string(),
});
export type ClearSpeakProgress = z.infer<typeof ClearSpeakProgressSchema>;

export const HardWordEntrySchema = z.object({
  word: z.string(),
  failCount: z.number(),
  lastFailed: z.string(),
  resolved: z.boolean(),
  lastAttemptedAt: z.string(),
});
export type HardWordEntry = z.infer<typeof HardWordEntrySchema>;

export const HardWordsLedgerSchema = z.object({
  userId: z.string(),
  entries: z.array(HardWordEntrySchema),
  updatedAt: z.string(),
});
export type HardWordsLedger = z.infer<typeof HardWordsLedgerSchema>;

export const BridgeTriggerStateSchema = z.object({
  shouldSurface: z.boolean(),
  triggered: z.boolean(),
  reason: z.string(),
  streakMet: z.boolean(),
  rollingAvgMet: z.boolean(),
});
export type BridgeTriggerState = z.infer<typeof BridgeTriggerStateSchema>;

export const ClearSpeakScoreResponseSchema = z.object({
  success: z.boolean(),
  score: ClearSpeakSessionScoreSchema,
});
export type ClearSpeakScoreResponse = z.infer<typeof ClearSpeakScoreResponseSchema>;
