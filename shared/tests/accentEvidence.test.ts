import {
  AccentRealSpeechPolicyV1,
  AccentScoreV2Schema,
  AccentScorerEvidenceV1Schema,
} from '../src/accentEvidence';

const ids = {
  attemptId: '10000000-0000-4000-8000-000000000001',
  resultId: '10000000-0000-4000-8000-000000000002',
  promptId: '10000000-0000-4000-8000-000000000003',
};
const hash = 'a'.repeat(64);
const evidenceHash = 'b'.repeat(64);

const supported = (score = 82, confidence = 0.9, ref = 'pronunciation.segment.1') => ({
  evidenceStatus: 'sufficient' as const,
  confidence,
  candidateScore: score,
  summary: 'Bounded evidence supports this dimension.',
  evidenceRefs: [ref],
  coachingAction: 'Repeat the marked segment and compare it with the selected reference.',
});
const unsupported = () => ({
  evidenceStatus: 'unsupported' as const,
  confidence: 0,
  candidateScore: null,
  summary: 'This dimension is not supported by the available evidence.',
  evidenceRefs: [],
  coachingAction: null,
});

const partialEvidence = () => ({
  contractVersion: 'accent-scorer-evidence.v1' as const,
  attemptId: ids.attemptId,
  promptId: ids.promptId,
  promptVersion: 1,
  promptContentHash: hash,
  profileId: 'en-GB-general-v1' as const,
  profileVersion: 1 as const,
  referenceSetVersion: 'uk-general-reference.v1',
  adapterId: 'test-governed-adapter',
  adapterVersion: 'v1',
  providerExecutionState: 'partial' as const,
  audioEvidence: {
    sha256: hash,
    durationMs: 1800,
    mimeType: 'audio/webm' as const,
    byteLength: 4000,
  },
  dimensions: {
    intelligibility: supported(88, 0.91, 'intelligibility.segment.1'),
    pronunciation: supported(82, 0.9, 'pronunciation.segment.1'),
    prosody: unsupported(),
    fluency: supported(78, 0.82, 'fluency.window.1'),
    targetStyle: unsupported(),
  },
});

const scoredResult = () => ({
  contractVersion: 'accent-score.v2' as const,
  attemptId: ids.attemptId,
  resultId: ids.resultId,
  promptId: ids.promptId,
  promptVersion: 1,
  promptContentHash: hash,
  profileId: 'en-GB-general-v1' as const,
  profileVersion: 1 as const,
  referenceSetVersion: 'uk-general-reference.v1',
  scoringPolicyVersion: 'real-speech-policy.v1' as const,
  evidenceProvenance: 'user_recording_scored' as const,
  fixture: false as const,
  evidenceLineage: {
    evidenceContractVersion: 'accent-scorer-evidence.v1' as const,
    adapterId: 'test-governed-adapter',
    adapterVersion: 'v1',
    providerExecutionState: 'partial' as const,
    audioSha256: hash,
    evidenceSha256: evidenceHash,
  },
  dimensions: {
    intelligibility: { score: 88, confidence: 0.91, evidenceStatus: 'sufficient' as const, summary: 'Supported.', evidenceRefs: ['intelligibility.segment.1'] },
    pronunciation: { score: 82, confidence: 0.9, evidenceStatus: 'sufficient' as const, summary: 'Supported.', evidenceRefs: ['pronunciation.segment.1'] },
    prosody: { score: null, confidence: 0, evidenceStatus: 'unsupported' as const, summary: 'Unsupported.', evidenceRefs: [] },
    fluency: { score: 78, confidence: 0.82, evidenceStatus: 'sufficient' as const, summary: 'Supported.', evidenceRefs: ['fluency.window.1'] },
    targetStyle: { score: null, confidence: 0, evidenceStatus: 'unsupported' as const, summary: 'Unsupported.', evidenceRefs: [] },
  },
  coaching: [{
    rank: 1,
    dimension: 'pronunciation' as const,
    evidenceRefs: ['pronunciation.segment.1'],
    action: 'Repeat the marked segment and compare it with the selected reference.',
  }],
  disclaimer: 'Scores describe evidence from this recording against the selected practice reference; they do not classify identity, native-ness, employability, or correctness.',
});

describe('P0-5 governed accent evidence contracts', () => {
  it('accepts partial provider evidence with independently unsupported dimensions', () => {
    expect(AccentScorerEvidenceV1Schema.parse(partialEvidence()).providerExecutionState).toBe('partial');
  });

  it('rejects provider-owned unknown keys', () => {
    const value = partialEvidence() as any;
    value.provider = 'client-controlled-provider';
    expect(() => AccentScorerEvidenceV1Schema.parse(value)).toThrow();
  });

  it('rejects candidate scores without sufficient/limited evidence', () => {
    const value = partialEvidence() as any;
    value.dimensions.targetStyle = { ...unsupported(), candidateScore: 91 };
    expect(() => AccentScorerEvidenceV1Schema.parse(value)).toThrow(/cannot contain a candidate score/i);
  });

  it('rejects fabricated evidence references and coaching on unsupported dimensions', () => {
    const value = partialEvidence() as any;
    value.dimensions.prosody = {
      ...unsupported(),
      evidenceRefs: ['prosody.fake.1'],
      coachingAction: 'Invented coaching',
    };
    expect(() => AccentScorerEvidenceV1Schema.parse(value)).toThrow();
  });

  it('rejects a partial execution that actually scores every dimension', () => {
    const value = partialEvidence() as any;
    value.dimensions.prosody = supported(75, 0.8, 'prosody.window.1');
    value.dimensions.targetStyle = supported(73, 0.81, 'target-style.window.1');
    expect(() => AccentScorerEvidenceV1Schema.parse(value)).toThrow(/partial scorer execution/i);
  });

  it('accepts a real-speech v2 result with no overall/native-accent score', () => {
    const parsed = AccentScoreV2Schema.parse(scoredResult());
    expect(parsed.evidenceProvenance).toBe('user_recording_scored');
    expect((parsed as any).overallScore).toBeUndefined();
    expect((parsed as any).nativeAccentScore).toBeUndefined();
  });

  it('rejects coaching that cites another dimension evidence', () => {
    const value = scoredResult() as any;
    value.coaching[0].evidenceRefs = ['fluency.window.1'];
    expect(() => AccentScoreV2Schema.parse(value)).toThrow(/coaching must be grounded/i);
  });

  it('rejects a v2 result with no scored dimensions', () => {
    const value = scoredResult() as any;
    for (const key of Object.keys(value.dimensions)) {
      value.dimensions[key] = { score: null, confidence: 0, evidenceStatus: 'unsupported', summary: 'Unsupported.', evidenceRefs: [] };
    }
    value.coaching = [];
    expect(() => AccentScoreV2Schema.parse(value)).toThrow(/at least one scored dimension/i);
  });

  it('keeps policy confidence thresholds server-owned and dimension-specific', () => {
    expect(AccentRealSpeechPolicyV1.minimumConfidence.targetStyle).toBeGreaterThan(AccentRealSpeechPolicyV1.minimumConfidence.intelligibility);
    expect(AccentRealSpeechPolicyV1.scoringPolicyVersion).toBe('real-speech-policy.v1');
  });
});
