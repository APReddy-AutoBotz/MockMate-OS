import { AccentDimensionV1Schema, AccentProfileV1Schema, AccentScoreV1Schema, PracticePromptV1Schema } from 'mockmate-shared';
import { ACCENT_PROFILES } from '../clearspeak/accentProfiles';
import { deterministicSyntheticAdapter, REAL_SPEECH_PROVIDER_NOT_AUTHORIZED } from '../clearspeak/scoringAdapter';
import { ACCENT_V1_MIMES, accentCatalog, promptFor, rejectClientAuthority, validatePromptSelector } from '../clearspeak/accentV1Service';

const prompt = PracticePromptV1Schema.parse({
  contractVersion: 'practice-prompt.v1', promptId: '8bb701a7-1901-4ef0-b72f-86b93331ee5e', promptVersion: 1,
  mode: 'sentence_reading', profileId: 'en-US-general-v1', profileVersion: 1,
  referenceSetVersion: 'synthetic-reference.v1', displayText: 'Clear speech supports understanding.',
  expectedText: 'Clear speech supports understanding.', maxDurationMs: 30000, contentHash: 'a'.repeat(64),
  referenceLabel: 'Synthetic CI fixture — not human- or provider-validated pronunciation.',
});

describe('ClearSpeak accent V1 truth and authority', () => {
  it('publishes only strict, safe UK and US profile metadata', () => {
    expect(ACCENT_PROFILES.map(profile => AccentProfileV1Schema.parse(profile).locale)).toEqual(['en-GB', 'en-US']);
    expect(JSON.stringify(ACCENT_PROFILES)).not.toMatch(/provider|native score|nationality score/i);
  });

  it('produces deterministic, truth-labelled fixture results', async () => {
    const request = { attemptId: '6261081d-221b-4d1e-a227-ac938907ff3a', prompt, audio: Buffer.from('synthetic-container'), mimeType: 'audio/webm' as const };
    const first = AccentScoreV1Schema.parse(await deterministicSyntheticAdapter.score(request));
    const second = AccentScoreV1Schema.parse(await deterministicSyntheticAdapter.score(request));
    expect(first).toEqual(second);
    expect(first.fixture).toBe(true);
    expect(first.dimensions.targetStyle).not.toBe(first.dimensions.intelligibility);
    expect(REAL_SPEECH_PROVIDER_NOT_AUTHORIZED).toBe(true);
  });

  it('rejects fabricated precision without evidence', () => {
    expect(() => AccentDimensionV1Schema.parse({ score: 91, confidence: 0.1, evidenceStatus: 'insufficient', summary: 'No alignment.' })).toThrow();
    expect(AccentDimensionV1Schema.parse({ score: null, confidence: 0.1, evidenceStatus: 'insufficient', summary: 'No alignment.' }).score).toBeNull();
  });

  it('serves every practice mode from deterministic licensed-safe fixtures', () => {
    const profile = ACCENT_PROFILES[0];
    for (const mode of ['word', 'phrase', 'sentence_reading', 'free_response'] as const) {
      const generated = PracticePromptV1Schema.parse(promptFor(profile, mode));
      expect(validatePromptSelector({ ...generated, promptContentHash: generated.contentHash, scoringPolicyVersion: profile.scoringPolicyVersion })).toEqual(generated);
      expect(generated.referenceLabel).toMatch(/Synthetic CI fixture/);
    }
    expect(accentCatalog().retention).toBe('derived-results-only');
  });

  it.each(['provider', 'model', 'apiKey', 'retention', 'admin', 'fixture', 'scoringAdapter'])(
    'rejects client-selected %s authority', key => expect(() => rejectClientAuthority({ [key]: 'attacker' })).toThrow('client_authority_rejected'),
  );

  it('fails closed for stale prompt, profile, reference and scoring selectors', () => {
    const generated = promptFor(ACCENT_PROFILES[1], 'phrase');
    const valid = { ...generated, promptContentHash: generated.contentHash, scoringPolicyVersion: ACCENT_PROFILES[1].scoringPolicyVersion };
    for (const patch of [{ promptVersion: 2 }, { profileVersion: 2 }, { referenceSetVersion: 'stale' }, { scoringPolicyVersion: 'stale' }]) {
      expect(() => validatePromptSelector({ ...valid, ...patch })).toThrow();
    }
  });

  it('keeps the upload allowlist bounded to browser audio containers', () => {
    expect([...ACCENT_V1_MIMES]).toEqual(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);
    expect(ACCENT_V1_MIMES.has('audio/wav')).toBe(false);
  });
});
