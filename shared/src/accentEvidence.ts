import { z } from 'zod';

export const AccentEvidenceDimensionKeySchema = z.enum([
  'intelligibility',
  'pronunciation',
  'prosody',
  'fluency',
  'targetStyle',
]);
export type AccentEvidenceDimensionKey = z.infer<typeof AccentEvidenceDimensionKeySchema>;

export const AccentEvidenceStatusV1Schema = z.enum([
  'sufficient',
  'limited',
  'insufficient',
  'unsupported',
]);
export type AccentEvidenceStatusV1 = z.infer<typeof AccentEvidenceStatusV1Schema>;

export const AccentProviderExecutionStateV1Schema = z.enum([
  'completed',
  'partial',
]);
export type AccentProviderExecutionStateV1 = z.infer<typeof AccentProviderExecutionStateV1Schema>;

export const AccentEvidenceProvenanceV2Schema = z.enum([
  'user_recording_scored',
  'user_recording_evaluated_unscored',
]);
export type AccentEvidenceProvenanceV2 = z.infer<typeof AccentEvidenceProvenanceV2Schema>;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const AdapterIdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/);
const VersionIdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
const AccentProfileIdV1Schema = z.enum(['en-GB-general-v1', 'en-US-general-v1']);

export const AccentAudioEvidenceV1Schema = z.object({
  sha256: Sha256Schema,
  durationMs: z.number().int().min(250).max(120000),
  mimeType: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']),
  byteLength: z.number().int().positive().max(5 * 1024 * 1024),
}).strict();
export type AccentAudioEvidenceV1 = z.infer<typeof AccentAudioEvidenceV1Schema>;

export const AccentDimensionEvidenceV1Schema = z.object({
  evidenceStatus: AccentEvidenceStatusV1Schema,
  confidence: z.number().min(0).max(1),
  candidateScore: z.number().int().min(0).max(100).nullable(),
  summary: z.string().min(1).max(400),
  evidenceRefs: z.array(z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,79}$/)).max(12),
  contradictions: z.array(z.string().min(1).max(200)).max(8),
  coachingAction: z.string().min(1).max(400).nullable(),
}).strict().superRefine((value, ctx) => {
  const scoreable = value.evidenceStatus === 'sufficient' || value.evidenceStatus === 'limited';
  const contradictory = value.contradictions.length > 0;
  if (contradictory && value.evidenceStatus !== 'insufficient') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceStatus'],
      message: 'Contradictory evidence must be marked insufficient',
    });
  }
  if (contradictory && value.candidateScore !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateScore'],
      message: 'Contradictory evidence cannot contain a candidate score',
    });
  }
  if (contradictory && value.coachingAction !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coachingAction'],
      message: 'Contradictory evidence cannot produce evidence-specific coaching',
    });
  }
  if (!scoreable && value.candidateScore !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateScore'],
      message: 'Insufficient or unsupported evidence cannot contain a candidate score',
    });
  }
  if (!scoreable && value.evidenceRefs.length !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceRefs'],
      message: 'Insufficient or unsupported evidence cannot expose positive evidence references',
    });
  }
  if (!scoreable && value.coachingAction !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coachingAction'],
      message: 'Unsupported evidence cannot produce evidence-specific coaching',
    });
  }
  if (scoreable && value.candidateScore === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateScore'],
      message: 'Scoreable evidence requires a bounded candidate score',
    });
  }
  if (scoreable && value.evidenceRefs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceRefs'],
      message: 'Scoreable evidence requires at least one evidence reference',
    });
  }
});
export type AccentDimensionEvidenceV1 = z.infer<typeof AccentDimensionEvidenceV1Schema>;

const AccentEvidenceDimensionsV1Schema = z.object({
  intelligibility: AccentDimensionEvidenceV1Schema,
  pronunciation: AccentDimensionEvidenceV1Schema,
  prosody: AccentDimensionEvidenceV1Schema,
  fluency: AccentDimensionEvidenceV1Schema,
  targetStyle: AccentDimensionEvidenceV1Schema,
}).strict();

/**
 * Provider-neutral normalized output accepted from a server-authorized adapter.
 * No raw transcript, phoneme stream, audio bytes, nationality/native-language
 * inference, or provider credentials are part of this contract.
 */
export const AccentScorerEvidenceV1Schema = z.object({
  contractVersion: z.literal('accent-scorer-evidence.v1'),
  attemptId: z.string().uuid(),
  promptId: z.string().uuid(),
  promptVersion: z.number().int().positive(),
  promptContentHash: Sha256Schema,
  profileId: AccentProfileIdV1Schema,
  profileVersion: z.literal(1),
  referenceSetVersion: z.string().min(1).max(80),
  adapterId: AdapterIdentifierSchema,
  adapterVersion: VersionIdentifierSchema,
  providerExecutionState: AccentProviderExecutionStateV1Schema,
  audioEvidence: AccentAudioEvidenceV1Schema,
  dimensions: AccentEvidenceDimensionsV1Schema,
}).strict().superRefine((value, ctx) => {
  const statuses = Object.values(value.dimensions).map(dimension => dimension.evidenceStatus);
  const scoreableCount = statuses.filter(status => status === 'sufficient' || status === 'limited').length;
  if (value.providerExecutionState === 'partial' && scoreableCount === statuses.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['providerExecutionState'],
      message: 'Partial scorer execution must leave at least one dimension unscored',
    });
  }
});
export type AccentScorerEvidenceV1 = z.infer<typeof AccentScorerEvidenceV1Schema>;

export const AccentEvidenceLineageV1Schema = z.object({
  evidenceContractVersion: z.literal('accent-scorer-evidence.v1'),
  adapterId: AdapterIdentifierSchema,
  adapterVersion: VersionIdentifierSchema,
  providerExecutionState: AccentProviderExecutionStateV1Schema,
  audioSha256: Sha256Schema,
  evidenceSha256: Sha256Schema,
}).strict();
export type AccentEvidenceLineageV1 = z.infer<typeof AccentEvidenceLineageV1Schema>;

export const AccentScoredDimensionV2Schema = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  evidenceStatus: AccentEvidenceStatusV1Schema,
  summary: z.string().min(1).max(400),
  evidenceRefs: z.array(z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,79}$/)).max(12),
}).strict().superRefine((value, ctx) => {
  if ((value.evidenceStatus === 'insufficient' || value.evidenceStatus === 'unsupported') && value.score !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['score'],
      message: 'Insufficient or unsupported evidence cannot have a precise score',
    });
  }
  if (value.score !== null && value.evidenceRefs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceRefs'],
      message: 'A scored dimension requires traceable evidence references',
    });
  }
});

const AccentScoredDimensionsV2Schema = z.object({
  intelligibility: AccentScoredDimensionV2Schema,
  pronunciation: AccentScoredDimensionV2Schema,
  prosody: AccentScoredDimensionV2Schema,
  fluency: AccentScoredDimensionV2Schema,
  targetStyle: AccentScoredDimensionV2Schema,
}).strict();

export const AccentScoreV2Schema = z.object({
  contractVersion: z.literal('accent-score.v2'),
  attemptId: z.string().uuid(),
  resultId: z.string().uuid(),
  promptId: z.string().uuid(),
  promptVersion: z.number().int().positive(),
  promptContentHash: Sha256Schema,
  profileId: AccentProfileIdV1Schema,
  profileVersion: z.literal(1),
  referenceSetVersion: z.string().min(1).max(80),
  scoringPolicyVersion: z.literal('real-speech-policy.v1'),
  evidenceProvenance: AccentEvidenceProvenanceV2Schema,
  fixture: z.literal(false),
  evidenceLineage: AccentEvidenceLineageV1Schema,
  dimensions: AccentScoredDimensionsV2Schema,
  coaching: z.array(z.object({
    rank: z.number().int().min(1).max(3),
    dimension: AccentEvidenceDimensionKeySchema,
    evidenceRefs: z.array(z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,79}$/)).min(1).max(12),
    action: z.string().min(1).max(400),
  }).strict()).max(3),
  disclaimer: z.string().min(1).max(600),
}).strict().superRefine((value, ctx) => {
  const scoredDimensions = Object.values(value.dimensions).filter(dimension => dimension.score !== null);
  if (scoredDimensions.length === 0 && value.evidenceProvenance !== 'user_recording_evaluated_unscored') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceProvenance'],
      message: 'A real-speech result with no scored dimensions must be labeled evaluated-unscored',
    });
  }
  if (scoredDimensions.length > 0 && value.evidenceProvenance !== 'user_recording_scored') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceProvenance'],
      message: 'A real-speech result with scored dimensions must be labeled user-recording-scored',
    });
  }
  if (scoredDimensions.length === 0 && value.coaching.length !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coaching'],
      message: 'An evaluated-unscored result cannot contain evidence-specific coaching',
    });
  }
  for (const [index, coaching] of value.coaching.entries()) {
    const dimension = value.dimensions[coaching.dimension];
    if (dimension.score === null || !coaching.evidenceRefs.every(ref => dimension.evidenceRefs.includes(ref))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coaching', index],
        message: 'Coaching must be grounded in evidence from a scored dimension',
      });
    }
  }
});
export type AccentScoreV2 = z.infer<typeof AccentScoreV2Schema>;

export const AccentRealSpeechPolicyV1 = Object.freeze({
  contractVersion: 'accent-real-speech-policy.v1' as const,
  scoringPolicyVersion: 'real-speech-policy.v1' as const,
  minimumConfidence: Object.freeze({
    intelligibility: 0.65,
    pronunciation: 0.72,
    prosody: 0.72,
    fluency: 0.65,
    targetStyle: 0.78,
  }),
});
