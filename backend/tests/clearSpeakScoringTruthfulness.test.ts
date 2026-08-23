import {
  ClearSpeakScoringUnavailableError,
  isClearSpeakScoringAvailable,
  scoreSession,
} from '../clearspeak/scoringService';
import type { ClearSpeakSessionContent } from 'mockmate-shared';

const content: ClearSpeakSessionContent = {
  topicTag: 'status_update',
  difficultyLevel: 1,
  targetSkill: 'Pace and pauses',
  keyVocab: ['status'],
  passageData: [{ text: 'The project is on track.', isStressed: false, pauseType: 'stop' }],
  bridgeReady: false,
};

describe('ClearSpeak scoring truthfulness and audio disposal', () => {
  const originalGroqKey = process.env.GROQ_API_KEY;

  afterEach(() => {
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
  });

  it('treats missing or whitespace-only provider configuration as unavailable', () => {
    expect(isClearSpeakScoringAvailable({})).toBe(false);
    expect(isClearSpeakScoringAvailable({ GROQ_API_KEY: '   ' })).toBe(false);
    expect(isClearSpeakScoringAvailable({ GROQ_API_KEY: 'configured' })).toBe(true);
  });

  it('fails closed without fabricated scores and zeroes the uploaded allocation', async () => {
    process.env.GROQ_API_KEY = '   ';
    const audioBuffer = Buffer.from([9, 8, 7, 6]);
    const input = {
      audioBuffer,
      content,
      userLevel: 1 as const,
      hardWords: [],
      retryAttempted: false,
    };

    await expect(scoreSession(input)).rejects.toBeInstanceOf(ClearSpeakScoringUnavailableError);
    expect([...audioBuffer]).toEqual([0, 0, 0, 0]);
    expect((input as any).audioBuffer).toBeNull();
  });
});
