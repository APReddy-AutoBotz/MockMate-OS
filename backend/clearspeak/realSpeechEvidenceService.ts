import crypto from 'crypto';
import {
  AccentRealSpeechPolicyV1,
  AccentScoreV2Schema,
  AccentScorerEvidenceV1Schema,
  type AccentEvidenceDimensionKey,
  type AccentScoreV2,
  type AccentScorerEvidenceV1,
} from 'mockmate-shared/accent-evidence';

export const REAL_SPEECH_SCORING_TIMEOUT_MS = 90_000;

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
    signal: AbortSignal;
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
const directOriginInference = /\b(?:speaker|user|person|you|recording|voice|accent|speech|your (?:voice|accent|speech|recording))\b[^.!?\n]{0,48}\b(?:is|are|sounds?|seems?|appears?)\b[^.!?\n]{0,24}\bfrom\b/i;
const nationalityDescriptor = '(?:[a-z]{3,}(?:ish|ese|ian|ean|istani|ican)|french|dutch|greek|thai|swiss|german|israeli|iraqi|saudi|emirati|afghan|arab|filipino|nepali|bangladeshi|sri\\s+lankan|new\\s+zealander|czech|slovak|cypriot|icelander|kazakh|uzbek|kyrgyz)';
const directNationalityDescriptor = new RegExp(
  `\\b(?:speaker|user|person|you|recording|voice|accent|speech|your (?:voice|accent|speech|recording))\\b[^.!?\\n]{0,48}\\b(?:is|are|sounds?|seems?|appears?)\\b\\s*(?:(?:to be|very|quite|distinctly|typically|like)\\s+)*(?:an?\\s+)?${nationalityDescriptor}\\b`,
  'i',
);
const possessiveOrResemblanceNationalityDescriptor = new RegExp(
  `\\b(?:you|speaker|user|person|your (?:voice|accent|speech|recording)|(?:speaker|user|person)(?:'s|’s) (?:voice|accent|speech|recording))\\b[^.!?\\n]{0,32}\\b(?:have|has|carry|carries|show|shows|display|displays|demonstrate|demonstrates|resemble|resembles|match|matches)\\b[^.!?\\n]{0,20}(?:(?:an?|the)\\s+)?${nationalityDescriptor}\\b(?:\\s+(?:accent|speech|voice|pronunciation|speaker|features?|patterns?|characteristics?))?`,
  'i',
);
const resemblanceOriginInference = /\b(?:you|speaker|user|person|your (?:voice|accent|speech|recording)|(?:speaker|user|person)(?:'s|’s) (?:voice|accent|speech|recording))\b[^.!?\n]{0,40}\b(?:resemble|resembles|match|matches|mirror|mirrors)\b[^.!?\n]{0,32}\b(?:speech|voice|accent|pronunciation|features?|patterns?|characteristics?)\b[^.!?\n]{0,16}\bfrom\b/i;

const assertNeutralEvidenceText = (value: string, label: string) => {
  if (forbiddenIdentityOrEmploymentClaim.test(value)
      || directOriginInference.test(value)
      || directNationalityDescriptor.test(value)
      || possessiveOrResemblanceNationalityDescriptor.test(value)
      || resemblanceOriginInference.test(value)) {
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

const sha256Buffer = (value: Buffer) => crypto.createHash('sha256').update(value).digest('hex');

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
  authoritativeAudioSha256: string,
  authoritativeByteLength: number,
  adapter: GovernedAccentScoringAdapterV1,
) => {
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
    audioSha256: authoritativeAudioSha256,
    durationMs: context.durationMs,
    mimeType: context.mimeType,
    byteLength: authoritativeByteLength,
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

  // Provider free-form text is never persisted or rendered, but reject known
  // prohibited inferences here as an additional fail-closed adapter boundary.
  for (const key of dimensionOrder) {
    const dimension = evidence.dimensions[key];
    assertNeutralEvidenceText(dimension.summary, `${key} summary`);
    for (const [index, contradiction] of dimension.contradictions.entries()) {
      assertNeutralEvidenceText(contradiction, `${key} contradiction ${index + 1}`);
    }
    if (dimension.coachingAction) assertNeutralEvidenceText(dimension.coachingAction, `${key} coaching`);
  }
};

const scoredSummaryFor = (status: 'sufficient' | 'limited'): string => status === 'limited'
  ? 'Limited but validated evidence met the server threshold for this dimension against the selected practice reference.'
  : 'Validated evidence met the server threshold for this dimension against the selected practice reference.';

const coachingActionFor = (key: AccentEvidenceDimensionKey): string => ({
  intelligibility: 'Repeat the prompt with clear articulation and compare the marked evidence with the selected practice reference.',
  pronunciation: 'Repeat the marked segment and compare its pronunciation with the selected practice reference.',
  prosody: 'Repeat the marked segment while focusing on stress, rhythm, pauses, and intonation against the selected practice reference.',
  fluency: 'Repeat the marked window at a steady pace while reducing avoidable hesitations.',
  targetStyle: 'Repeat the marked segment and compare its pronunciation, stress, and rhythm with the learner-selected practice reference.',
}[key]);

const mapDimension = (
  key: AccentEvidenceDimensionKey,
  evidence: AccentScorerEvidenceV1['dimensions'][AccentEvidenceDimensionKey],
) => {
  const minimumConfidence = AccentRealSpeechPolicyV1.minimumConfidence[key];
  const scoreableStatus = evidence.evidenceStatus === 'sufficient' || evidence.evidenceStatus === 'limited'
    ? evidence.evidenceStatus
    : null;
  const meetsConfidence = scoreableStatus !== null && evidence.confidence >= minimumConfidence;

  if (scoreableStatus === null) {
    return {
      score: null,
      confidence: evidence.confidence,
      evidenceStatus: evidence.evidenceStatus,
      summary: evidence.evidenceStatus === 'unsupported'
        ? 'This dimension is not supported by the available evidence.'
        : 'The available evidence was insufficient to score this dimension.',
      evidenceRefs: [],
    };
  }

  if (!meetsConfidence) {
    return {
      score: null,
      confidence: evidence.confidence,
      evidenceStatus: 'insufficient' as const,
      summary: 'The available evidence did not meet the server confidence threshold for this dimension.',
      evidenceRefs: [],
    };
  }

  return {
    score: evidence.candidateScore,
    confidence: evidence.confidence,
    evidenceStatus: scoreableStatus,
    // Provider prose is deliberately not a persistence/UI authority. Only the
    // validated numeric/status/ref evidence crosses into the user-facing result.
    summary: scoredSummaryFor(scoreableStatus),
    evidenceRefs: evidence.evidenceRefs,
  };
};

type GovernedScoringOptions = { timeoutMs?: number };

export const scoreWithGovernedAccentAdapter = async (
  context: AccentRealSpeechContextV1,
  audio: Buffer,
  adapter: GovernedAccentScoringAdapterV1,
  options: GovernedScoringOptions = {},
): Promise<{ score: AccentScoreV2; evidenceSha256: string }> => {
  if (!audio.length) throw new Error('Accent scoring requires non-empty audio evidence');
  if (audio.length > 5 * 1024 * 1024) throw new Error('Accent scoring audio evidence exceeds the bounded size');

  const timeoutMs = options.timeoutMs ?? REAL_SPEECH_SCORING_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > REAL_SPEECH_SCORING_TIMEOUT_MS) {
    throw new Error('Accent scoring timeout exceeds server authority');
  }

  // Capture authoritative lineage before adapter code can observe a buffer. The
  // adapter receives a disposable copy so mutation cannot rewrite request truth.
  const authoritativeAudioSha256 = sha256Buffer(audio);
  const authoritativeByteLength = audio.length;
  const adapterAudio = Buffer.from(audio);
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error('Accent real-speech adapter timed out'));
    }, timeoutMs);
  });

  let rawEvidence: unknown;
  try {
    rawEvidence = await Promise.race([
      adapter.score({ context: Object.freeze({ ...context }), audio: adapterAudio, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    controller.abort();
    adapterAudio.fill(0);
  }

  const evidence = AccentScorerEvidenceV1Schema.parse(rawEvidence);
  assertEvidenceBinding(evidence, context, authoritativeAudioSha256, authoritativeByteLength, adapter);

  const evidenceSha256 = stableSha256(evidence);
  const dimensions = Object.fromEntries(
    dimensionOrder.map(key => [key, mapDimension(key, evidence.dimensions[key])]),
  ) as AccentScoreV2['dimensions'];
  const scoredDimensionCount = dimensionOrder.filter(key => dimensions[key].score !== null).length;

  // Ranking is server-owned and uses only validated scores. Provider coaching
  // prose never crosses into persistence/UI; actions are deterministic and
  // traceable to the scored dimension's validated evidence references.
  const coaching = dimensionOrder
    .map(key => ({ key, score: dimensions[key].score, evidenceRefs: dimensions[key].evidenceRefs }))
    .filter((candidate): candidate is typeof candidate & { score: number } => candidate.score !== null)
    .sort((left, right) => left.score - right.score || dimensionOrder.indexOf(left.key) - dimensionOrder.indexOf(right.key))
    .slice(0, 3)
    .map((candidate, index) => ({
      rank: index + 1,
      dimension: candidate.key,
      evidenceRefs: candidate.evidenceRefs,
      action: coachingActionFor(candidate.key),
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
      audioSha256: authoritativeAudioSha256,
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
