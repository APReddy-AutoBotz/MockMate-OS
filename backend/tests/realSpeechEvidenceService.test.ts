import crypto from 'crypto';
import {
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
) => ({
  evidenceStatus,
  confidence,
  candidateScore,
  summary: candidateScore === null ? 'Evidence is unavailable for this dimension.' : 'Bounded evidence supports this dimension.',
  evidenceRefs: candidateScore === null ? [] : [ref],
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

  it('scores only dimensions that satisfy the server-owned confidence threshold', async () => {
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidenceFor()));
    expect(result.score.contractVersion).toBe('accent-score.v2');
    expect(result.score.evidenceProvenance).toBe('user_recording_scored');
    expect(result.score.dimensions.intelligibility.score).toBe(91);
    expect(result.score.dimensions.pronunciation.score).toBeNull();
    expect(result.score.dimensions.pronunciation.evidenceStatus).toBe('insufficient');
    expect(result.score.dimensions.fluency.score).toBe(79);
    expect(result.score.dimensions.targetStyle.score).toBeNull();
    expect((result.score as any).overallScore).toBeUndefined();
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

  it('rejects employment inference in provider coaching', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.fluency.coachingAction = 'Improve this to become more hireable.';
    await expect(scoreWithGovernedAccentAdapter(context, audio, adapter(evidence)))
      .rejects.toThrow(/forbidden identity or employment inference/i);
  });

  it('grounds coaching only in dimensions that survive the server policy', async () => {
    const evidence = evidenceFor() as any;
    evidence.dimensions.pronunciation.confidence = 0.95;
    const result = await scoreWithGovernedAccentAdapter(context, audio, adapter(evidence));
    expect(result.score.coaching.map(item => item.dimension)).toEqual(['pronunciation', 'fluency']);
    expect(result.score.coaching[0].evidenceRefs).toEqual(['pronunciation.segment.1']);
  });

  it('rejects empty and oversized audio before invoking an adapter', async () => {
    const mock = adapter(evidenceFor());
    await expect(scoreWithGovernedAccentAdapter(context, Buffer.alloc(0), mock)).rejects.toThrow(/non-empty audio/i);
    await expect(scoreWithGovernedAccentAdapter(context, Buffer.alloc(5 * 1024 * 1024 + 1), mock)).rejects.toThrow(/exceeds the bounded size/i);
    expect(mock.score).not.toHaveBeenCalled();
  });
});
