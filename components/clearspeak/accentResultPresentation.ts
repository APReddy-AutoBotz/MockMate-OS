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
    return 'Feedback scoring was unavailable for this attempt, so no pronunciation or target-style score was created.';
  }
  if (score.evidenceProvenance === 'user_recording_evaluated_unscored') {
    return 'The recording could not support a reliable score. Try again in a quieter setting or use a longer response.';
  }
  return 'Scores appear only where this recording provided enough reliable information.';
};

export const accentHistoryProvenanceLabel = (provenance: string): string => {
  switch (provenance) {
    case 'synthetic_fixture_scored':
      return 'Practice example';
    case 'user_recording_scored':
      return 'Recording feedback';
    case 'user_recording_evaluated_unscored':
      return 'Recording · not enough information';
    case 'user_recording_unscored':
      return 'Recording · feedback unavailable';
    default:
      return 'Derived attempt';
  }
};

export const accentDimensionScoreLabel = (
  dimension: { score: number | null; evidenceStatus: string },
): string => dimension.score === null ? 'Not scored' : `${dimension.score}/100`;

export const accentHistoryEvidenceLabel = (statuses: Record<string, string>): string => {
  const values = Object.values(statuses);
  if (!values.length) return 'No feedback recorded';
  if (values.every(status => status === 'unsupported')) return 'Feedback was unavailable';
  if (values.every(status => status === 'insufficient' || status === 'unsupported')) return 'Not enough information to score';
  if (values.every(status => status === 'sufficient' || status === 'limited')) return 'Scored feedback available';
  return 'Some feedback available';
};
