import type { AccentScoreV1 } from 'mockmate-shared';
import type { AccentScoreV2 } from 'mockmate-shared/accent-evidence';
import {
  accentDimensionScoreLabel,
  accentHistoryEvidenceLabel,
  accentHistoryProvenanceLabel,
  accentResultHeading,
  accentResultIntro,
} from '../accentResultPresentation';

const v1Unavailable = {
  contractVersion: 'accent-score.v1',
  evidenceProvenance: 'user_recording_unscored',
} as AccentScoreV1;

const v2Scored = {
  contractVersion: 'accent-score.v2',
  evidenceProvenance: 'user_recording_scored',
} as AccentScoreV2;

const v2EvaluatedUnscored = {
  contractVersion: 'accent-score.v2',
  evidenceProvenance: 'user_recording_evaluated_unscored',
} as AccentScoreV2;

describe('ClearSpeak accent result presentation', () => {
  it('distinguishes provider-unavailable from real-speech scored output', () => {
    expect(accentResultHeading(v1Unavailable)).toBe('Scoring unavailable');
    expect(accentResultHeading(v2Scored)).toBe('Recording feedback');
    expect(accentResultIntro(v1Unavailable)).toMatch(/Feedback scoring was unavailable/i);
    expect(accentResultIntro(v2Scored)).toMatch(/enough reliable information/i);
  });

  it('distinguishes evaluated low-evidence output from provider unavailability', () => {
    expect(accentResultHeading(v2EvaluatedUnscored)).toBe('Not enough evidence to score');
    expect(accentResultIntro(v2EvaluatedUnscored)).toMatch(/could not support a reliable score/i);
    expect(accentHistoryProvenanceLabel('user_recording_evaluated_unscored')).toBe('Recording · not enough information');
  });

  it('never turns a null dimension into zero', () => {
    expect(accentDimensionScoreLabel({ score: null, evidenceStatus: 'insufficient' })).toBe('Not scored');
    expect(accentDimensionScoreLabel({ score: 0, evidenceStatus: 'sufficient' })).toBe('0/100');
  });

  it('labels history provenance without presenting synthetic fixtures as user speech evidence', () => {
    expect(accentHistoryProvenanceLabel('synthetic_fixture_scored')).toBe('Practice example');
    expect(accentHistoryProvenanceLabel('user_recording_scored')).toBe('Recording feedback');
    expect(accentHistoryProvenanceLabel('user_recording_unscored')).toBe('Recording · feedback unavailable');
  });

  it('summarizes mixed evidence without implying unsupported dimensions were scored', () => {
    expect(accentHistoryEvidenceLabel({ intelligibility: 'unsupported', pronunciation: 'unsupported' })).toBe('Feedback was unavailable');
    expect(accentHistoryEvidenceLabel({ intelligibility: 'insufficient', pronunciation: 'unsupported' })).toBe('Not enough information to score');
    expect(accentHistoryEvidenceLabel({ intelligibility: 'sufficient', pronunciation: 'limited' })).toBe('Scored feedback available');
    expect(accentHistoryEvidenceLabel({ intelligibility: 'sufficient', pronunciation: 'unsupported' })).toBe('Some feedback available');
  });
});
