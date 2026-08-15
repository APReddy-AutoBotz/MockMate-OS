import { AccentScoreV1Schema } from 'mockmate-shared';
import { AccentScoreV2Schema } from 'mockmate-shared/accent-evidence';
import {
  accentAdapterDescriptorForScore,
  accentCatalog,
  promptFor,
  rejectClientAuthority,
} from '../clearspeak/accentV1Service';
import { unsupportedUserAudioResult } from '../clearspeak/scoringAdapter';
import { ACCENT_PROFILES } from '../clearspeak/accentProfiles';

const v2 = AccentScoreV2Schema.parse({
  contractVersion: 'accent-score.v2',
  attemptId: '30000000-0000-4000-8000-000000000001',
  resultId: '30000000-0000-4000-8000-000000000002',
  promptId: '30000000-0000-4000-8000-000000000003',
  promptVersion: 1,
  promptContentHash: 'a'.repeat(64),
  profileId: 'en-GB-general-v1',
  profileVersion: 1,
  referenceSetVersion: 'uk-general-reference.v1',
  scoringPolicyVersion: 'real-speech-policy.v1',
  evidenceProvenance: 'user_recording_scored',
  fixture: false,
  evidenceLineage: {
    evidenceContractVersion: 'accent-scorer-evidence.v1',
    adapterId: 'mock-governed-scorer',
    adapterVersion: 'v1',
    providerExecutionState: 'partial',
    audioSha256: 'b'.repeat(64),
    evidenceSha256: 'c'.repeat(64),
  },
  dimensions: {
    intelligibility: { score: 88, confidence: 0.91, evidenceStatus: 'sufficient', summary: 'Supported.', evidenceRefs: ['intelligibility.segment.1'] },
    pronunciation: { score: null, confidence: 0.2, evidenceStatus: 'insufficient', summary: 'Insufficient.', evidenceRefs: [] },
    prosody: { score: null, confidence: 0, evidenceStatus: 'unsupported', summary: 'Unsupported.', evidenceRefs: [] },
    fluency: { score: null, confidence: 0, evidenceStatus: 'unsupported', summary: 'Unsupported.', evidenceRefs: [] },
    targetStyle: { score: null, confidence: 0, evidenceStatus: 'unsupported', summary: 'Unsupported.', evidenceRefs: [] },
  },
  coaching: [{
    rank: 1,
    dimension: 'intelligibility',
    evidenceRefs: ['intelligibility.segment.1'],
    action: 'Repeat the segment and compare it with the selected reference.',
  }],
  disclaimer: 'Evidence from this recording against the selected practice reference only.',
});

describe('ClearSpeak accent adapter response envelope', () => {
  it('keeps runtime scoring availability false while no provider is authorized', () => {
    expect(accentCatalog().realSpeechScoringAvailable).toBe(false);
  });

  it('labels V1 ordinary user recordings as explicitly unavailable', () => {
    const prompt = promptFor(ACCENT_PROFILES[0], 'word');
    const v1 = AccentScoreV1Schema.parse(unsupportedUserAudioResult(
      '30000000-0000-4000-8000-000000000004',
      prompt,
    ));
    expect(accentAdapterDescriptorForScore(v1)).toEqual({
      status: 'unavailable',
      adapterId: 'scoring-unavailable-v1',
    });
  });

  it('derives authorized adapter metadata only from V2 evidence lineage', () => {
    expect(accentAdapterDescriptorForScore(v2)).toEqual({
      status: 'authorized',
      adapterId: 'mock-governed-scorer',
      adapterVersion: 'v1',
    });
  });

  it('accepts only the existing server-validated client selector vocabulary', () => {
    expect(() => rejectClientAuthority({
      attemptId: '30000000-0000-4000-8000-000000000005',
      durationMs: 1000,
      mode: 'word',
      profileId: 'en-GB-general-v1',
      profileVersion: 1,
      promptId: '30000000-0000-4000-8000-000000000006',
      promptVersion: 1,
      promptContentHash: 'a'.repeat(64),
      referenceSetVersion: 'synthetic-reference.v1',
      scoringPolicyVersion: 'synthetic-policy.v1',
    })).not.toThrow();
  });

  it.each([
    'provider',
    'model',
    'apiKey',
    'adapterId',
    'adapterVersion',
    'realSpeechAuthority',
    'confidenceThreshold',
    'fallbackBehavior',
    'evidenceProvenance',
    'evidenceLineage',
    'dimensions',
    'coaching',
    'contradictions',
    'unexpected',
  ])('rejects client-selected or unknown %s metadata', key => {
    expect(() => rejectClientAuthority({ mode: 'word', profileId: 'en-GB-general-v1', [key]: 'attacker' }))
      .toThrow('client_authority_rejected');
  });
});
