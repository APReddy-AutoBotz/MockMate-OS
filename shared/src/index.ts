import { z } from 'zod';

// ==========================================
// COMMON
// ==========================================

export const ApiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  details: z.any().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// Authenticated API result/error envelope
export const ApiResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: ApiErrorSchema.optional(),
  });

export const EvaluationStatusSchema = z.enum(['scored', 'insufficient_evidence', 'not_tested', 'error']);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const EvidenceConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type EvidenceConfidence = z.infer<typeof EvidenceConfidenceSchema>;

// ==========================================
// INTERVIEW
// ==========================================

export const InterviewDeliveryModeSchema = z.enum(['exam', 'coach']);
export type InterviewDeliveryMode = z.infer<typeof InterviewDeliveryModeSchema>;

export const InterviewReasoningModeSchema = z.enum([
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
export type InterviewReasoningMode = z.infer<typeof InterviewReasoningModeSchema>;

export const SessionControlsSchema = z.object({
  difficulty: z.enum(['starter', 'intermediate', 'expert']).optional(), // Optional for compat
  totalQuestions: z.number().optional(),
  includeBehavioral: z.boolean().optional(),
  includeCoding: z.boolean().optional(),
  timePerQuestion: z.enum(['45s', '90s', '120s', 'none']).optional(),
  deliveryMode: InterviewDeliveryModeSchema,
  reasoningMode: InterviewReasoningModeSchema,
  sourceMode: z.enum(['job_description', 'question_bank']).optional(),
});
export type SessionControls = z.infer<typeof SessionControlsSchema>;

export const DimensionKeySchema = z.string();
export type DimensionKey = z.infer<typeof DimensionKeySchema>;

export const QuestionBlueprintSchema = z.object({
  id: z.string().optional(),
  phase: z.string().optional(),
  difficulty: z.string().optional(),
  type: z.string().optional(),
  question: z.string(),
  expectedSignals: z.array(z.string()).optional(),
  failureModes: z.array(z.string()).optional(),
  evaluationCriteria: z.array(z.string()).optional(),
  personaFocus: z.string().optional(),
  rubric: z.record(z.any()).optional(),
  sourceBullets: z.array(z.string()).optional(),
  estTimeSec: z.number().optional(),
  language: z.string().optional(),
  timeAllocation: z.number().optional(),
});
export type QuestionBlueprint = z.infer<typeof QuestionBlueprintSchema>;

export const JDInsightsSchema = z.object({
  source: z.string().optional(),
  role: z.string().optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.string()]).optional(),
  mustHaveSkills: z.array(z.string()).optional(),
  niceToHave: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  softSkills: z.array(z.string()).optional(),
  competencyWeights: z.record(z.number()).optional(),
});
export type JDInsights = z.infer<typeof JDInsightsSchema>;

export const InterviewPlanSchema = z.object({
  meta: z.object({
    mode: z.string().optional(),
    candidateRole: z.string().optional(),
    language: z.string().optional(),
    controls: SessionControlsSchema.optional(),
    estimatedDuration: z.string().optional(),
    focusAreas: z.array(z.string()).optional(),
  }).optional(),
  jdInsights: JDInsightsSchema.optional(),
  questionSet: z.array(QuestionBlueprintSchema),
  orderingNotes: z.string().optional(),
  adaptSpec: z.any().optional(),
  coachPack: z.any().optional(),
  researchLinks: z.any().optional(),
});
export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;

export const InterviewSessionContextSchema = z.object({
  candidateRole: z.string().optional(),
  intentText: z.string().optional(),
  selectedPanelIDs: z.array(z.string()).optional(),
  jdInsights: JDInsightsSchema.optional(),
  competencyWeights: z.record(z.number()).optional(),
  interviewPlan: InterviewPlanSchema.optional(),
  controls: SessionControlsSchema.optional(),
  companyName: z.string().optional(),
  companyUrl: z.string().optional(),
  companyBrief: z.string().optional(),
  targetStarBullets: z.array(z.string()).optional(),
  sessionType: z.enum(['structured', 'conversational']).optional(),
  sessionId: z.string().optional(),
});
export type InterviewSessionContext = z.infer<typeof InterviewSessionContextSchema>;

export const InterviewSessionStartRequestSchema = z.object({
  context: InterviewSessionContextSchema,
});
export type InterviewSessionStartRequest = z.infer<typeof InterviewSessionStartRequestSchema>;

export const InterviewSessionStartResponseSchema = z.object({
  sessionId: z.string(),
  openingMessage: z.string(),
  firstQuestion: QuestionBlueprintSchema,
  questionIndex: z.number(),
  totalQuestions: z.number(),
});
export type InterviewSessionStartResponse = z.infer<typeof InterviewSessionStartResponseSchema>;

export const InterviewAnswerRequestSchema = z.object({
  questionId: z.string(),
  answerText: z.string(),
});
export type InterviewAnswerRequest = z.infer<typeof InterviewAnswerRequestSchema>;

export const InterviewAnswerResponseSchema = z.object({
  completedTurnId: z.string(),
  nextQuestion: QuestionBlueprintSchema.nullable(),
  isLastQuestion: z.boolean(),
  questionIndex: z.number(),
  totalQuestions: z.number(),
});
export type InterviewAnswerResponse = z.infer<typeof InterviewAnswerResponseSchema>;

export const InterviewTurnSchema = z.object({
  id: z.string().optional(), // For completedTurnId
  interviewer: z.string().optional(),
  question: z.string(),
  candidateResponse: z.string(),
  timestamp: z.number().optional(),
  questionBlueprint: QuestionBlueprintSchema.optional(),
  codeFeedback: z.string().optional(),
});
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;

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
  overallSummary: z.string().optional(),
  evaluationModel: z.enum(['legacy', 'v1_dimensions']).optional(),
  readiness: z.object({
    status: z.enum(['INTERVIEW_READY', 'ALMOST_READY', 'NOT_READY']),
    reasoning: z.string(),
  }).optional(),
  quantitativeAnalysis: z.object({
    competency_scores: z.any().optional(),
    dimension_scores: z.array(DimensionScoreSchema).optional(),
  }).optional(),
  advisoryPanel: z.any().optional(),
  questionPerformance: z.array(QuestionPerformanceSchema).optional(),
  biggestRiskArea: z.any().optional(),
  coachPack: z.any().optional(),
  trajectoryReplay: z.any().optional(),
  auditLayer: z.any().optional(),
  pilotFeedback: z.any().optional(),
  simplifiedScore: z.number().nullable().optional(),
  topStrength: z.string().optional(),
  topWeakness: z.string().optional(),
  estimatedSessionsToReady: z.number().optional(),
  quickWins: z.array(z.string()).optional(),
  prioritizedActions: z.any().optional(),
  _metadata: z.any().optional(),
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
  overallMatch: z.number(),
  missingKeywords: z.array(z.string()),
  formattingIssues: z.array(z.string()),
  readabilityScore: z.number(),
});
export type ATSDiagnosticsResult = z.infer<typeof ATSDiagnosticsResultSchema>;

export const JDMatchResultSchema = z.object({
  matchPercentage: z.number(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type JDMatchResult = z.infer<typeof JDMatchResultSchema>;

export const ResumeScoreResponseSchema = z.object({
  resumeData: ResumeDataSchema.optional(),
  atsDiagnostics: ATSDiagnosticsResultSchema.optional(),
  jdMatch: JDMatchResultSchema.optional(),
});
export type ResumeScoreResponse = z.infer<typeof ResumeScoreResponseSchema>;

export const ResumeSuggestionResponseSchema = z.object({
  suggestions: z.array(z.string()),
});
export type ResumeSuggestionResponse = z.infer<typeof ResumeSuggestionResponseSchema>;

// ==========================================
// CLEARSPEAK
// ==========================================

export const ClearSpeakProfileSchema = z.object({
  userId: z.string().optional(),
  targetAccent: z.string().optional(),
  nativeLanguage: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  role: z.string().optional(),
  practiceDuration: z.any().optional(),
  level: z.any().optional(),
  goal: z.string().optional(),
  audienceContext: z.string().optional(),
  mainStruggle: z.string().optional(),
  comfortLanguage: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).catchall(z.any());
export type ClearSpeakProfile = z.infer<typeof ClearSpeakProfileSchema>;

export const ClearSpeakSessionContentSchema = z.object({
  passageData: z.any().optional(),
  keyVocab: z.any().optional(),
  retrySentence: z.any().optional(),
  interviewBridgeQuestion: z.any().optional(),
  topicTag: z.string().optional(),
  targetSkill: z.string().optional(),
  text: z.string().optional(),
  audioUrl: z.string().optional(),
  duration: z.number().optional(),
  difficultyLevel: z.any().optional(),
  repeatPhrase: z.any().optional(),
  bridgeReady: z.any().optional(),
}).catchall(z.any());
export type ClearSpeakSessionContent = z.infer<typeof ClearSpeakSessionContentSchema>;

export const ClearSpeakSessionScoreSchema = z.object({
  clarity: z.number().optional(),
  pacing: z.number().optional(),
  rhythm: z.number().optional(),
  composite: z.number().optional(),
  hardWordBonus: z.number().optional(),
  feedbackTip: z.string().optional(),
  pronunciationScore: z.number().nullable().optional(),
  fluencyScore: z.number().nullable().optional(),
  vocabularyScore: z.number().nullable().optional(),
  feedback: z.string().optional(),
  mockData: z.boolean().optional(),
  measuredWpm: z.number().optional(),
  retrySuccess: z.boolean().optional(),
}).catchall(z.any());
export type ClearSpeakSessionScore = z.infer<typeof ClearSpeakSessionScoreSchema>;

export const ClearSpeakProgressSchema = z.object({
  sessionsCompleted: z.number().optional(),
  averageScore: z.number().optional(),
  improvement: z.number().optional(),
  streak: z.number().optional(),
  userId: z.string().optional(),
  lastPracticeDate: z.string().optional(),
  clarityTrend: z.any().optional(),
  topicBestScores: z.any().optional(),
  bestPerformingTopic: z.string().optional(),
  hardWordCount: z.number().optional(),
  totalSessionsCompleted: z.number().optional(),
  updatedAt: z.string().optional(),
}).catchall(z.any());
export type ClearSpeakProgress = z.infer<typeof ClearSpeakProgressSchema>;

export interface HardWordEntry { word: string; failCount: number; lastFailed?: string; resolved?: boolean; lastAttemptedAt?: string; [k: string]: any; }
export interface HardWordsLedger { userId: string; entries: HardWordEntry[]; updatedAt?: string; [k: string]: any; }

export const BridgeTriggerStateSchema = z.object({
  shouldSurface: z.boolean().optional(),
  triggered: z.boolean(),
  reason: z.string().optional(),
  streakMet: z.boolean().optional(),
  rollingAvgMet: z.boolean().optional(),
}).catchall(z.any());
export type BridgeTriggerState = z.infer<typeof BridgeTriggerStateSchema>;
