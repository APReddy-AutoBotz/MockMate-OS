import type { AccentScoreV1 } from 'mockmate-shared';
import type { AccentScoreV2 } from 'mockmate-shared/accent-evidence';

export type AccentAttemptScore = AccentScoreV1 | AccentScoreV2;

export const isAccentScoreV2 = (score: AccentAttemptScore): score is AccentScoreV2 =>
  score.contractVersion === 'accent-score.v2';

export const accentResultHeading = (score: AccentAttemptScore): string => {
  if (!isAccentScoreV2(score)) return 'Scoring unavailable';
  return score.evidenceProvenance === 'user_recording_scored'
    ? 'Recording feedback'
    : 'Not enough evidence to score';
};

export const accentResultIntro = (score: AccentAttemptScore): string => {
  if (!isAccentScoreV2(score)) {
    return 'No real-speech scorer is authorized for this attempt. No pronunciation or target-style score was created.';
  }
  if (score.evidenceProvenance === 'user_recording_evaluated_unscored') {
    return 'The authorized scorer evaluated this recording, but the evidence did not meet the policy threshold for a precise score.';
  }
  return 'These dimension scores come only from evidence that met the server-owned confidence policy for this recording.';
};

export const accentHistoryProvenanceLabel = (provenance: string): string => {
  switch (provenance) {
    case 'synthetic_fixture_scored':
      return 'Synthetic fixture score';
    case 'user_recording_scored':
      return 'User recording · evidence-scored';
    case 'user_recording_evaluated_unscored':
      return 'User recording · evaluated, no score';
    case 'user_recording_unscored':
      return 'User recording · scorer unavailable';
    default:
      return 'Derived attempt';
  }
};

export const accentDimensionScoreLabel = (
  dimension: { score: number | null; evidenceStatus: string },
): string => dimension.score === null ? 'No score' : String(dimension.score);

export const accentHistoryEvidenceLabel = (statuses: Record<string, string>): string => {
  const values = Object.values(statuses);
  if (!values.length) return 'none';
  if (values.every(status => status === 'unsupported')) return 'unsupported';
  if (values.every(status => status === 'insufficient' || status === 'unsupported')) return 'insufficient';
  if (values.every(status => status === 'sufficient' || status === 'limited')) return 'scored';
  return 'mixed';
};
