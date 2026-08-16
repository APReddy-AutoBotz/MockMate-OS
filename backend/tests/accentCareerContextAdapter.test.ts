import { buildAccentEvidenceContextItems } from '../services/careerContextAdapters/clearSpeakContextAdapter';

const ATTEMPT_ID = '70000000-0000-4000-8000-000000000011';
const PROMPT_ID = '70000000-0000-4000-8000-000000000001';
const RESULT_ID = '70000000-0000-4000-8000-000000000021';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

const unsupportedDimension = (summary: string) => ({
  score: null,
  confidence: 0,
  evidenceStatus: 'unsupported' as const,
  summary,
  evidenceRefs: [],
});

const scoredResult = {
  contractVersion: 'accent-score.v2' as const,
  attemptId: ATTEMPT_ID,
  resultId: RESULT_ID,
  promptId: PROMPT_ID,
  promptVersion: 1,
  promptContentHash: SHA_A,
  profileId: 'en-GB-general-v1' as const,
  profileVersion: 1 as const,
  referenceSetVersion: 'uk-general-reference.v1',
  scoringPolicyVersion: 'real-speech-policy.v1' as const,
  evidenceProvenance: 'user_recording_scored' as const,
  fixture: false as const,
  evidenceLineage: {
    evidenceContractVersion: 'accent-scorer-evidence.v1' as const,
    adapterId: 'mockmate-test-adapter',
    adapterVersion: 'v1',
    providerExecutionState: 'completed' as const,
    audioSha256: SHA_B,
    evidenceSha256: SHA_C,
  },
  dimensions: {
    intelligibility: unsupportedDimension('No reliable intelligibility evidence was returned.'),
    pronunciation: {
      score: 72,
      confidence: 0.91,
      evidenceStatus: 'sufficient' as const,
      summary: 'Bounded pronunciation evidence supports a focused practice action.',
      evidenceRefs: ['pronunciation.segment.1'],
    },
    prosody: unsupportedDimension('No reliable prosody evidence was returned.'),
    fluency: unsupportedDimension('No reliable fluency evidence was returned.'),
    targetStyle: unsupportedDimension('No reliable target-style evidence was returned.'),
  },
  coaching: [
    {
      rank: 1,
      dimension: 'pronunciation' as const,
      evidenceRefs: ['pronunciation.segment.1'],
      action: 'Repeat the marked pronunciation window slowly, then once at normal pace.',
    },
  ],
  disclaimer: 'This practice result evaluates bounded speech evidence only and does not infer identity or employability.',
};

describe('P0-5 Accent → Career Context adapter', () => {
  it('creates only bounded development priorities from strict real V2 scored evidence', () => {
    const items = buildAccentEvidenceContextItems({ attemptId: ATTEMPT_ID, result: scoredResult });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'development_priority',
      canonicalKey: 'clearspeak.accent.development.pronunciation',
      value: {
        type: 'text',
        text: 'Repeat the marked pronunciation window slowly, then once at normal pace.',
      },
      source: {
        module: 'clearspeak',
        recordId: ATTEMPT_ID,
        fieldPath: 'result.coaching.0.pronunciation',
      },
      exactExcerpt: 'Repeat the marked pronunciation window slowly, then once at normal pace.',
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
    });

    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain('clearspeak_composite');
    expect(serialized).not.toContain('native');
    expect(serialized).not.toContain('nationality');
    expect(serialized).not.toContain('audioSha256');
    expect(serialized).not.toContain('pronunciation.segment.1');
  });

  it('rejects an attempt-id mismatch instead of rebinding evidence to another source row', () => {
    const items = buildAccentEvidenceContextItems({
      attemptId: '70000000-0000-4000-8000-000000000099',
      result: scoredResult,
    });
    expect(items).toEqual([]);
  });

  it('uses canonical array position and dimension when display ranks collide', () => {
    const duplicateRank = {
      ...scoredResult,
      dimensions: {
        ...scoredResult.dimensions,
        fluency: {
          score: 68, confidence: 0.88, evidenceStatus: 'sufficient' as const,
          summary: 'Bounded fluency evidence.', evidenceRefs: ['fluency.segment.1'],
        },
      },
      coaching: [
        scoredResult.coaching[0],
        { rank: 1, dimension: 'fluency' as const, evidenceRefs: ['fluency.segment.1'], action: 'Practice one fluent phrase at a time.' },
      ],
    };
    const items = buildAccentEvidenceContextItems({ attemptId: ATTEMPT_ID, result: duplicateRank });
    expect(items.map(item => item.source.fieldPath)).toEqual([
      'result.coaching.0.pronunciation',
      'result.coaching.1.fluency',
    ]);
  });

  it('does not turn V1/synthetic-shaped or malformed evidence into Career Context claims', () => {
    const syntheticV1 = {
      contractVersion: 'accent-score.v1',
      evidenceProvenance: 'synthetic_fixture_scored',
      fixture: true,
      overallScore: 99,
    };
    expect(buildAccentEvidenceContextItems({ attemptId: ATTEMPT_ID, result: syntheticV1 })).toEqual([]);
  });

  it('does not create a weakness or priority from evaluated-unscored V2 evidence', () => {
    const evaluatedUnscored = {
      ...scoredResult,
      resultId: '70000000-0000-4000-8000-000000000022',
      evidenceProvenance: 'user_recording_evaluated_unscored' as const,
      dimensions: {
        intelligibility: unsupportedDimension('Evidence was insufficient.'),
        pronunciation: unsupportedDimension('Evidence was insufficient.'),
        prosody: unsupportedDimension('Evidence was insufficient.'),
        fluency: unsupportedDimension('Evidence was insufficient.'),
        targetStyle: unsupportedDimension('Evidence was insufficient.'),
      },
      coaching: [],
    };

    expect(buildAccentEvidenceContextItems({ attemptId: ATTEMPT_ID, result: evaluatedUnscored })).toEqual([]);
  });
});
