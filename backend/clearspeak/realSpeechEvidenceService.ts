import crypto from 'crypto';
import {
  AccentRealSpeechPolicyV1,
  AccentScoreV2Schema,
  AccentScorerEvidenceV1Schema,
  type AccentEvidenceDimensionKey,
  type AccentScoreV2,
  type AccentScorerEvidenceV1,
} from 'mockmate-shared/accent-evidence';

export interface AccentRealSpeechContextV1 {
  attemptId: string;
  promptId: string;
  promptVersion: number;
  promptContentHash: string;
  profileId: 'en-GB-general-v1' | 'en-US-general-v1';
  profileVersion: 1;
  referenceSetVersion: string;
  durationMs: number;
  mimeType: 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg';
}

export interface GovernedAccentScoringAdapterV1 {
  readonly adapterId: string;
  readonly adapterVersion: string;
  score(input: {
    context: Readonly<AccentRealSpeechContextV1>;
    audio: Buffer;
  }): Promise<unknown>;
}

export type AccentRealSpeechOutcomeV1 =
  | { status: 'unavailable'; reason: 'no_authorized_real_speech_adapter' }
  | { status: 'evaluated'; score: AccentScoreV2; evidenceSha256: string };

const dimensionOrder: AccentEvidenceDimensionKey[] = [
  'intelligibility',
  'pronunciation',
  'prosody',
  'fluency',
  'targetStyle',
];

const forbiddenIdentityOrEmploymentClaim = /\b(?:native(?:[- ]speaker)?|non[- ]?native|nationality|ethnicity|ethnic|mother tongue|native language|employment|employab\w*|hireab\w*|hiring|correct accent|wrong accent|superior accent|infer(?:red|ring)? (?:identity|origin|nationality|language))\b/i;

const assertNeutralEvidenceText = (value: string, label: string) => {
  if (forbiddenIdentityOrEmploymentClaim.test(value)) {
    throw new Error(`Accent evidence ${label} contains a forbidden identity or employment inference`);
  }
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
};

const stableSha256 = (value: unknown) => crypto
  .createHash('sha256')
  .update(JSON.stringify(stableValue(value)))
  .digest('hex');

const uuidFromHash = (hex: string): string => {
  const bytes = Buffer.from(hex.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
};

const assertEvidenceBinding = (
  evidence: AccentScorerEvidenceV1,
  context: AccentRealSpeechContextV1,
  audio: Buffer,
  adapter: GovernedAccentScoringAdapterV1,
) => {
  const audioSha256 = crypto.createHash('sha256').update(audio).digest('hex');
  const expected = {
    attemptId: context.attemptId,
    promptId: context.promptId,
    promptVersion: context.promptVersion,
    promptContentHash: context.promptContentHash,
    profileId: context.profileId,
    profileVersion: context.profileVersion,
    referenceSetVersion: context.referenceSetVersion,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    audioSha256,
    durationMs: context.durationMs,
    mimeType: context.mimeType,
    byteLength: audio.length,
  };

  const actual = {
    attemptId: evidence.attemptId,
    promptId: evidence.promptId,
    promptVersion: evidence.promptVersion,
    promptContentHash: evidence.promptContentHash,
    profileId: evidence.profileId,
    profileVersion: evidence.profileVersion,
    referenceSetVersion: evidence.referenceSetVersion,
    adapterId: evidence.adapterId,
    adapterVersion: evidence.adapterVersion,
    audioSha256: evidence.audioEvidence.sha256,
    durationMs: evidence.audioEvidence.durationMs,
    mimeType: evidence.audioEvidence.mimeType,
    byteLength: evidence.audioEvidence.byteLength,
  };

  if (stableSha256(actual) !== stableSha256(expected)) {
    throw new Error('Accent scorer evidence lineage does not match authoritative recording selectors');
  }

  for (const key of dimensionOrder) {
    const dimension = evidence.dimensions[key];
    assertNeutralEvidenceText(dimension.summary, `${key} summary`);
    for (const [index, contradiction] of dimension.contradictions.entries()) {
      assertNeutralEvidenceText(contradiction, `${key} contradiction ${index + 1}`);
    }
    if (dimension.coachingAction) assertNeutralEvidenceText(dimension.coachingAction, `${key} coaching`);
  }
};

const mapDimension = (
  key: AccentEvidenceDimensionKey,
  evidence: AccentScorerEvidenceV1['dimensions'][AccentEvidenceDimensionKey],
) => {
  const minimumConfidence = AccentRealSpeechPolicyV1.minimumConfidence[key];
  const providerMarkedScoreable = evidence.evidenceStatus === 'sufficient' || evidence.evidenceStatus === 'limited';
  const meetsConfidence = providerMarkedScoreable && evidence.confidence >= minimumConfidence;
  const score = meetsConfidence ? evidence.candidateScore : null;
  const evidenceStatus = providerMarkedScoreable && !meetsConfidence
    ? 'insufficient' as const
    : evidence.evidenceStatus;

  return {
    score,
    confidence: evidence.confidence,
    evidenceStatus,
    summary: evidence.summary,
    evidenceRefs: evidence.evidenceRefs,
  };
};

export const scoreWithGovernedAccentAdapter = async (
  context: AccentRealSpeechContextV1,
  audio: Buffer,
  adapter: GovernedAccentScoringAdapterV1,
): Promise<{ score: AccentScoreV2; evidenceSha256: string }> => {
  if (!audio.length) throw new Error('Accent scoring requires non-empty audio evidence');
  if (audio.length > 5 * 1024 * 1024) throw new Error('Accent scoring audio evidence exceeds the bounded size');

  const rawEvidence = await adapter.score({ context: Object.freeze({ ...context }), audio });
  const evidence = AccentScorerEvidenceV1Schema.parse(rawEvidence);
  assertEvidenceBinding(evidence, context, audio, adapter);

  const evidenceSha256 = stableSha256(evidence);
  const dimensions = Object.fromEntries(
    dimensionOrder.map(key => [key, mapDimension(key, evidence.dimensions[key])]),
  ) as AccentScoreV2['dimensions'];
  const scoredDimensionCount = dimensionOrder.filter(key => dimensions[key].score !== null).length;

  const scoredCoachingCandidates = dimensionOrder
    .map(key => ({ key, evidence: evidence.dimensions[key], score: dimensions[key].score }))
    .filter((candidate): candidate is typeof candidate & { score: number } => candidate.score !== null && Boolean(candidate.evidence.coachingAction))
    .sort((left, right) => left.score - right.score || dimensionOrder.indexOf(left.key) - dimensionOrder.indexOf(right.key))
    .slice(0, 3);

  const coaching = scoredCoachingCandidates.map((candidate, index) => ({
    rank: index + 1,
    dimension: candidate.key,
    evidenceRefs: candidate.evidence.evidenceRefs,
    action: candidate.evidence.coachingAction!,
  }));

  const resultSeed = stableSha256({ attemptId: context.attemptId, evidenceSha256 });
  const score = AccentScoreV2Schema.parse({
    contractVersion: 'accent-score.v2',
    attemptId: context.attemptId,
    resultId: uuidFromHash(resultSeed),
    promptId: context.promptId,
    promptVersion: context.promptVersion,
    promptContentHash: context.promptContentHash,
    profileId: context.profileId,
    profileVersion: context.profileVersion,
    referenceSetVersion: context.referenceSetVersion,
    scoringPolicyVersion: AccentRealSpeechPolicyV1.scoringPolicyVersion,
    evidenceProvenance: scoredDimensionCount > 0 ? 'user_recording_scored' : 'user_recording_evaluated_unscored',
    fixture: false,
    evidenceLineage: {
      evidenceContractVersion: evidence.contractVersion,
      adapterId: evidence.adapterId,
      adapterVersion: evidence.adapterVersion,
      providerExecutionState: evidence.providerExecutionState,
      audioSha256: evidence.audioEvidence.sha256,
      evidenceSha256,
    },
    dimensions,
    coaching,
    disclaimer: 'Scores describe evidence from this recording against the learner-selected practice reference. They do not classify identity, nationality, ethnicity, native-ness, employability, or language correctness.',
  });

  return { score, evidenceSha256 };
};

/**
 * Runtime provider activation remains deliberately fail-closed. P0-5 introduces
 * the governed contract/adapter boundary without choosing, purchasing, or
 * authorizing any external speech provider. A later explicitly approved change
 * may return a concrete server-owned adapter here.
 */
export const getAuthorizedRealSpeechAdapter = (): GovernedAccentScoringAdapterV1 | null => null;

export const scoreUserAccentRecording = async (
  context: AccentRealSpeechContextV1,
  audio: Buffer,
): Promise<AccentRealSpeechOutcomeV1> => {
  const adapter = getAuthorizedRealSpeechAdapter();
  if (!adapter) return { status: 'unavailable', reason: 'no_authorized_real_speech_adapter' };
  const result = await scoreWithGovernedAccentAdapter(context, audio, adapter);
  return { status: 'evaluated', ...result };
};
