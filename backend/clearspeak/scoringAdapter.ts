import crypto from 'crypto';
import type { AccentScoreV1, PracticePromptV1 } from 'mockmate-shared';

export const REAL_SPEECH_PROVIDER_NOT_AUTHORIZED = true as const;

export interface AccentScoringRequest {
  attemptId: string;
  prompt: PracticePromptV1;
  audio: Buffer;
  mimeType: 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg';
}

export interface AccentScoringAdapter {
  readonly id: 'deterministic-synthetic-v1';
  score(request: AccentScoringRequest): Promise<AccentScoreV1>;
}

const dimension = (score: number, summary: string) => ({ score, confidence: 0.84, evidenceStatus: 'sufficient' as const, summary });
const unsupportedDimension = (summary: string) => ({ score: null, confidence: 0, evidenceStatus: 'unsupported' as const, summary });
const deterministicUuid = (value: string) => {
  const hex = crypto.createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const deterministicSyntheticAdapter: AccentScoringAdapter = {
  id: 'deterministic-synthetic-v1',
  async score({ attemptId, prompt, audio }) {
    if (!audio.length) throw new Error('insufficient_audio_evidence');
    const seed = crypto.createHash('sha256').update(audio).update(prompt.contentHash).digest()[0];
    const base = 55 + (seed % 26);
    return {
      contractVersion: 'accent-score.v1', attemptId,
      resultId: deterministicUuid(attemptId),
      promptId: prompt.promptId, promptVersion: prompt.promptVersion, promptContentHash: prompt.contentHash,
      profileId: prompt.profileId, profileVersion: 1, referenceSetVersion: prompt.referenceSetVersion,
      scoringPolicyVersion: 'synthetic-policy.v1', evidenceProvenance: 'synthetic_fixture_scored', fixture: true,
      dimensions: {
        intelligibility: dimension(base + 4, 'Words were distinguishable in this deterministic fixture.'),
        pronunciation: dimension(base, 'Repeat the displayed target with deliberate consonant endings.'),
        prosody: dimension(base - 3, 'Practise the marked stress and pitch movement.'),
        fluency: dimension(base + 2, 'Keep a steady pace while preserving natural pauses.'),
        targetStyle: dimension(base - 1, 'Similarity is only to the learner-selected practice reference.'),
      },
      coaching: [{ rank: 1, dimension: 'prosody', action: 'Repeat once, stressing the content words and keeping function words light.' }],
      disclaimer: 'Synthetic scoring validates product behavior only; it is not real pronunciation validation.',
    };
  },
};

/**
 * Truthful result for ordinary microphone uploads while speech inference is not
 * authorized. Container metadata proves neither speech presence nor quality,
 * so this path deliberately does not inspect or derive claims from audio bytes.
 */
export function unsupportedUserAudioResult(attemptId: string, prompt: PracticePromptV1): AccentScoreV1 {
  const unavailable = 'No authorized speech scorer is available for this recording. No pronunciation claim was made.';
  return {
    contractVersion: 'accent-score.v1', attemptId,
    resultId: deterministicUuid(`unsupported:${attemptId}`),
    promptId: prompt.promptId, promptVersion: prompt.promptVersion, promptContentHash: prompt.contentHash,
    profileId: prompt.profileId, profileVersion: 1, referenceSetVersion: prompt.referenceSetVersion,
    scoringPolicyVersion: 'scoring-unavailable.v1', evidenceProvenance: 'user_recording_unscored', fixture: false,
    dimensions: {
      intelligibility: unsupportedDimension(unavailable),
      pronunciation: unsupportedDimension(unavailable),
      prosody: unsupportedDimension(unavailable),
      fluency: unsupportedDimension(unavailable),
      targetStyle: unsupportedDimension(unavailable),
    },
    coaching: [{ rank: 1, dimension: 'pronunciation', action: 'Try again when an authorized speech scorer is available; your recording was not retained.' }],
    disclaimer: 'This user recording was not scored or retained because no authorized speech scorer is available.',
  };
}
