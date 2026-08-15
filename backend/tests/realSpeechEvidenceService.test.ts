import crypto from 'crypto';
import {
  REAL_SPEECH_SCORING_TIMEOUT_MS,
  scoreUserAccentRecording,
  scoreWithGovernedAccentAdapter,
  type AccentRealSpeechContextV1,
  type GovernedAccentScoringAdapterV1,
} from '../clearspeak/realSpeechEvidenceService';

const context: AccentRealSpeechContextV1 = {
  attemptId: '20000000-0000-4000-8000-000000000001',
  promptId: '20000000-0000-4000-8000-000000000002',
  promptVersion: 1,
  promptContentHash: 'a'.repeat(64),
  profileId: 'en-GB-general-v1',
  profileVersion: 1,
  referenceSetVersion: 'uk-general-reference.v1',
  durationMs: 1600,
  mimeType: 'audio/webm',
};
const audio = Buffer.from('deterministic-user-audio-fixture');

const dimension = (
  candidateScore: number | null,
  confidence: number,
  evidenceStatus: 'sufficient' | 'limited' | 'insufficient' | 'unsupported',
  ref: string,
  coachingAction: string | null = null,
  contradictions: string[] = [],
) => ({
  evidenceStatus,
  confidence,
  candidateScore,
  summary: candidateScore === null ? 'Evidence is unavailable for this dimension.' : 'Bounded evidence supports this dimension.',
  evidenceRefs: candidateScore === null ? [] : [ref],
  contradictions,
  coachingAction,
});

const evidenceFor = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: 'accent-scorer-evidence.v1',
  attemptId: context.attemptId,
  promptId: context.promptId,
  promptVersion: context.promptVersion,
  promptContentHash: context.promptContentHash,
  profileId: context.profileId,
  profileVersion: context.profileVersion,
  referenceSetVersion: context.referenceSetVersion,
  adapterId: 'mock-governed-scorer',
  adapterVersion: 'v1',
  providerExecutionState: 'partial',
  audioEvidence: {
    sha256: crypto.createHash('sha256').update(audio).digest('hex'),
    durationMs: context.durationMs,
    mimeType: context.mimeType,
    byteLength: audio.length,
  },
  dimensions: {
    intelligibility: dimension(91, 0.93, 'sufficient', 'intelligibility.segment.1'),
    pronunciation: dimension(74, 0.7, 'limited', 'pronunciation.segment.1', 'Repeat the marked segment against the selected reference.'),
    prosody: dimension(null, 0, 'unsupported', 'unused'),
    fluency: dimension(79, 0.83, 'sufficient', 'fluency.window.1', 'Repeat at a steady pace using the marked fluency window.'),
    targetStyle: dimension(null, 0, 'unsupported', 'unused'),
  },
  ...overrides,
});

const adapter = (evidence: unknown): GovernedAccentScoringAdapterV1 => ({
  adapterId: 'mock-governed-scorer',
  adapterVersion: 'v1',
  score: jest.fn(async () => evidence),
});

describe('P0-5 governed real-speech evidence service', () => {
  it('fails closed when no real speech adapter has been explicitly authorized', async () => {
    await expect(scoreUserAccentRecording(context, audio)).resolves.toEqual({
      status: 'unavailable',
      reason: 'no_authorized_real_speech_adapter',
    });
  });

  it('bounds adapter execution below the two-minute database lease', async () => {
    expect(REAL_SPEECH_SCORING_TIMEOUT_MS).toBeLessThan(120_000);
    const hangingAdapter: GovernedAccentScoringAdapterV1 = {
      adapterId: 'mock-governed-scorer',
      adapterVersion: 'v1',
      score: jest.fn(async () => new Promise<never>(() => undefined)),
    };
    await expect(scoreWithGovernedAccentAdapter(context, audio, hangingAdapter, { timeoutMs: 10 }))
      .rejects.toThrow(/timed out/i);
  });

  it('scores only dimensions that satisfy the server-owned confidence threshold', async () => {
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidenceFor()));
    expect(result.score.contractVersion).toBe('accent-score.v2');
    expect(result.score.evidenceProvenance).toBe('user_recording_scored');
    expect(result.score.dimensions.intelligibility.score).toBe(91);
    expect(result.score.dimensions.intelligibility.summary).toMatch(/validated evidence met the server threshold/i);
    expect(result.score.dimensions.intelligibility.summary).not.toMatch(/bounded evidence supports/i);
    expect(result.score.dimensions.pronunciation.score).toBeNull();
    expect(result.score.dimensions.pronunciation.evidenceStatus).toBe('insufficient');
    expect(result.score.dimensions.pronunciation.evidenceRefs).toEqual([]);
    expect(result.score.dimensions.pronunciation.summary).toMatch(/did not meet the server confidence threshold/i);
    expect(result.score.dimensions.pronunciation.summary).not.toMatch(/supports this dimension/i);
    expect(result.score.dimensions.fluency.score).toBe(79);
    expect(result.score.dimensions.targetStyle.score).toBeNull();
    expect((result.score as any).overallScore).toBeUndefined();
  });

  it.each([
    ['insufficient', /insufficient to score/i],
    ['unsupported', /not supported by the available evidence/i],
  ] as const)('sanitizes provider-declared %s summaries before persistence/rendering', async (status, expectedSummary) => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.prosody = {
      ...dimension(null, 0.2, status, 'unused'),
      summary: 'Your pronunciation clearly matches the target.',
    };
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    expect(result.score.dimensions.prosody.score).toBeNull();
    expect(result.score.dimensions.prosody.evidenceRefs).toEqual([]);
    expect(result.score.dimensions.prosody.summary).toMatch(expectedSummary);
    expect(result.score.dimensions.prosody.summary).not.toMatch(/clearly matches the target/i);
  });

  it('never persists or renders provider free-form scored summaries or coaching copy', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.intelligibility.summary = 'Provider-specific scored explanation.';
    evidence.dimensions.fluency.summary = 'Another provider-specific explanation.';
    evidence.dimensions.fluency.coachingAction = 'Provider-specific coaching instruction.';
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    const userFacingResult = JSON.stringify(result.score);
    expect(userFacingResult).not.toContain('Provider-specific scored explanation.');
    expect(userFacingResult).not.toContain('Another provider-specific explanation.');
    expect(userFacingResult).not.toContain('Provider-specific coaching instruction.');
    expect(result.score.dimensions.intelligibility.summary).toMatch(/server threshold/i);
    expect(result.score.coaching.every(item => item.action.includes('provider-specific') === false)).toBe(true);
  });

  it('returns evaluated-unscored when all provider evidence remains below scoring authority', async () => {
    const evidence = evidenceFor() as any;
    evidence.providerExecutionState = 'completed';
    for (const key of Object.keys(evidence.dimensions)) {
      evidence.dimensions[key] = dimension(null, 0.25, 'insufficient', 'unused');
    }
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    expect(result.score.evidenceProvenance).toBe('user_recording_evaluated_unscored');
    expect(Object.values(result.score.dimensions).every(item => item.score === null)).toBe(true);
    expect(result.score.coaching).toEqual([]);
  });

  it('keeps contradictory dimension evidence unscored while other dimensions may score', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.pronunciation = dimension(
      null,
      0.45,
      'insufficient',
      'unused',
      null,
      ['alignment and timing signals disagree'],
    );
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    expect(result.score.dimensions.pronunciation).toMatchObject({
      score: null,
      evidenceStatus: 'insufficient',
      evidenceRefs: [],
    });
    expect(result.score.coaching.some(item => item.dimension === 'pronunciation')).toBe(false);
    expect(result.score.dimensions.intelligibility.score).toBe(91);
  });

  it('rejects contradictory evidence that attempts to emit a precise score', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.pronunciation = {
      ...dimension(90, 0.95, 'sufficient', 'pronunciation.segment.1', 'Act on conflicting evidence.'),
      contradictions: ['two normalized signals disagree'],
    };
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/contradictory evidence/i);
  });

  it('keeps result identity deterministic for an identical evidence envelope', async () => {
    const evidence = evidenceFor();
    const first = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    const second = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    expect(second.evidenceSha256).toBe(first.evidenceSha256);
    expect(second.score.resultId).toBe(first.score.resultId);
  });

  it('rejects evidence bound to a different recording hash', async () => {
    const evidence = evidenceFor() as any;
    evidence.audioEvidence.sha256 = 'b'.repeat(64);
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/lineage does not match/i);
  });

  it('binds lineage to pre-adapter bytes and isolates adapter buffer mutation', async () => {
    const originalAudio = Buffer.from(audio);
    const mutatingAdapter: GovernedAccentScoringAdapterV1 = {
      adapterId: 'mock-governed-scorer',
      adapterVersion: 'v1',
      score: jest.fn(async input => {
        input.audio.fill(0x78);
        const evidence = evidenceFor() as any;
        evidence.audioEvidence.sha256 = crypto.createHash('sha256').update(input.audio).digest('hex');
        evidence.audioEvidence.byteLength = input.audio.length;
        return evidence;
      }),
    };
    await expect(scoreWithGovernedAccentAdapter(context, audio, mutatingAdapter))
      .rejects.toThrow(/lineage does not match/i);
    expect(audio).toEqual(originalAudio);
  });

  it('rejects evidence bound to a stale prompt or profile selector', async () => {
    const evidence = evidenceFor({ promptVersion: 2 });
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/lineage does not match/i);
  });

  it('rejects provider payloads with unknown top-level keys', async () => {
    const evidence = evidenceFor({ model: 'provider-controlled-model' });
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence))).rejects.toThrow();
  });

  it('rejects identity/native-ness inference in provider summaries', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.intelligibility.summary = 'This sounds like a native speaker.';
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/forbidden identity or employment inference/i);
  });

  it('rejects direct employment inference in provider summaries', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.intelligibility.summary = 'This recording limits your employment prospects.';
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/forbidden identity or employment inference/i);
  });

  it.each([
    'The speaker sounds British.',
    'The speaker is from India.',
    'Your accent sounds Canadian.',
    'You have an Indian accent.',
    'Your accent resembles British speech.',
    'Your accent resembles speech from India.',
  ])('rejects direct nationality/origin inference: %s', async summary => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.intelligibility.summary = summary;
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/forbidden identity or employment inference/i);
  });

  it('rejects employment inference in provider coaching', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.fluency.coachingAction = 'Improve this to become more hireable.';
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/forbidden identity or employment inference/i);
  });

  it('rejects identity inference inside contradiction metadata', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.pronunciation = dimension(
      null,
      0.4,
      'insufficient',
      'unused',
      null,
      ['one signal infers nationality differently'],
    );
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/forbidden identity or employment inference/i);
  });

  it('grounds server-owned coaching only in dimensions that survive the server policy', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.pronunciation.confidence = 0.95;
    evidence.dimensions.pronunciation.coachingAction = null;
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    expect(result.score.coaching.map(item => item.dimension)).toEqual(['pronunciation', 'fluency', 'intelligibility']);
    expect(result.score.coaching[0].evidenceRefs).toEqual(['pronunciation.segment.1']);
    expect(result.score.coaching[0].action).toMatch(/selected practice reference/i);
  });

  it('rejects empty and oversized audio before invoking an adapter', async () => {
    const mock = adapter(evidenceFor());
    await expect(scoreWithGovernedAccentAdapter(context, Buffer.alloc(0), mock)).rejects.toThrow(/non-empty audio/i);
    await expect(scoreWithGovernedAccentAdapter(context, Buffer.alloc(5 * 1024 * 1024 + 1), mock)).rejects.toThrow(/exceeds the bounded size/i);
    expect(mock.score).not.toHaveBeenCalled();
  });
});
