import { ACCENT_PROFILES } from '../../../backend/clearspeak/accentProfiles';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('ClearSpeak accent profile surface', () => {
  it('ships both General UK English and General US English learner-selected targets', () => {
    expect(ACCENT_PROFILES.map(profile => ({
      id: profile.profileId,
      locale: profile.locale,
      name: profile.displayName,
    }))).toEqual([
      { id: 'en-GB-general-v1', locale: 'en-GB', name: 'General UK English' },
      { id: 'en-US-general-v1', locale: 'en-US', name: 'General US English' },
    ]);
  });

  it('keeps the accent UI explicit about consent, evidence, and the four practice modes', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'components/clearspeak/AccentPracticeV1.tsx'), 'utf8');

    for (const label of ['Word', 'Phrase', 'Sentence', 'Free response']) {
      expect(source).toContain(`'${label}'`);
    }
    expect(source).toContain('I consent — start microphone');
    expect(source).toContain('realSpeechScoringAvailable');
    expect(source).toContain('raw audio is never retained');
    expect(source).toContain('Feedback scoring is unavailable right now');
    expect(source).toContain('Practice again');
    expect(source).toContain('Confirm delete');
    expect(source).toContain("item.result.profileId.includes('GB') ? 'UK' : 'US'");
  });

  it('wires accent practice from the dashboard without stale synthetic labeling or fabricated metrics', () => {
    const dashboard = fs.readFileSync(path.join(process.cwd(), 'components/clearspeak/ClearSpeakDashboard.tsx'), 'utf8');

    expect(dashboard).toContain("import AccentPracticeV1 from './AccentPracticeV1'");
    expect(dashboard).toContain("if (view === 'accent') return <AccentPracticeV1");
    expect(dashboard).toContain('Practice UK / US reference styles');
    expect(dashboard).toContain('Hard words practiced');
    expect(dashboard).toContain('progress.hardWordCount');
    expect(dashboard).not.toContain('synthetic V1');
    expect(dashboard).not.toContain('Filler words');
  });
});
