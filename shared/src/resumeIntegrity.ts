import { z } from 'zod';
import { ATSDiagnosticsResultSchema, ResumeDataSchema } from './index';

export const RESUME_REWRITE_INTEGRITY_POLICY_VERSION = 'resume-rewrite-integrity.v2' as const;

export const ResumeParseResponseSchema = z.object({
  success: z.literal(true),
  rawText: z.string().max(500_000),
  resumeData: ResumeDataSchema,
}).strict();
export type ResumeParseResponse = z.infer<typeof ResumeParseResponseSchema>;

export const ResumeScoreRequestSchema = z.object({
  resumeData: ResumeDataSchema,
  rawText: z.string().max(500_000).optional().default(''),
  jdText: z.string().max(20_000).optional().default(''),
}).strict();
export type ResumeScoreRequest = z.infer<typeof ResumeScoreRequestSchema>;

export const ResumeSuggestRequestSchema = z.object({
  resumeData: ResumeDataSchema,
  jdText: z.string().max(20_000).optional().default(''),
}).strict();
export type ResumeSuggestRequest = z.infer<typeof ResumeSuggestRequestSchema>;

export const ResumeRewriteIntegrityCheckSchema = z.enum([
  'source_location_matched',
  'no_new_numeric_fact',
  'no_metric_placeholder',
  'no_new_contact_or_url',
  'no_unsupported_technical_fact',
  'no_unsupported_source_token',
]);
export type ResumeRewriteIntegrityCheck = z.infer<typeof ResumeRewriteIntegrityCheckSchema>;

export const ResumeRewriteIntegritySchema = z.object({
  policyVersion: z.literal(RESUME_REWRITE_INTEGRITY_POLICY_VERSION),
  outcome: z.literal('passed'),
  checks: z.array(ResumeRewriteIntegrityCheckSchema).length(6),
}).strict();
export type ResumeRewriteIntegrity = z.infer<typeof ResumeRewriteIntegritySchema>;

export const GovernedResumeBulletSuggestionSchema = z.object({
  expIdx: z.number().int().nonnegative(),
  bulletIdx: z.number().int().nonnegative(),
  original: z.string().trim().min(1).max(2_000),
  suggested: z.string().trim().min(1).max(2_000),
  integrity: ResumeRewriteIntegritySchema,
}).strict();
export type GovernedResumeBulletSuggestion = z.infer<typeof GovernedResumeBulletSuggestionSchema>;

export const GovernedResumeSummarySuggestionSchema = z.object({
  original: z.string().max(4_000),
  suggested: z.string().trim().min(1).max(4_000),
  integrity: ResumeRewriteIntegritySchema,
}).strict();
export type GovernedResumeSummarySuggestion = z.infer<typeof GovernedResumeSummarySuggestionSchema>;

export const GovernedResumeSuggestionResponseSchema = z.object({
  success: z.literal(true),
  bulletSuggestions: z.array(GovernedResumeBulletSuggestionSchema),
  summarySuggestion: GovernedResumeSummarySuggestionSchema.nullable(),
  jdUsed: z.boolean(),
  integrityPolicyVersion: z.literal(RESUME_REWRITE_INTEGRITY_POLICY_VERSION),
  filteredSuggestionCount: z.number().int().nonnegative(),
}).strict();
export type GovernedResumeSuggestionResponse = z.infer<typeof GovernedResumeSuggestionResponseSchema>;

export const GovernedJDMatchResultSchema = z.object({
  scoreStatus: z.enum(['scored', 'insufficient_coverage']),
  jdMatchScore: z.number().min(0).max(100).nullable(),
  matchedSkills: z.array(z.string()),
  deterministicMissingSkills: z.array(z.string()),
  llmMissingHardSkills: z.array(z.string()),
  llmMissingSoftSkills: z.array(z.string()),
}).strict().superRefine((value, ctx) => {
  if (value.scoreStatus === 'scored' && value.jdMatchScore === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Scored JD matches require a numeric score.', path: ['jdMatchScore'] });
  }
  if (value.scoreStatus === 'insufficient_coverage' && value.jdMatchScore !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Insufficient JD coverage must not claim a numeric score.', path: ['jdMatchScore'] });
  }
});
export type GovernedJDMatchResult = z.infer<typeof GovernedJDMatchResultSchema>;

export const GovernedResumeScoreResponseSchema = z.object({
  success: z.literal(true),
  atsDiagnostics: ATSDiagnosticsResultSchema,
  jdMatch: GovernedJDMatchResultSchema.nullable(),
}).strict();
export type GovernedResumeScoreResponse = z.infer<typeof GovernedResumeScoreResponseSchema>;
