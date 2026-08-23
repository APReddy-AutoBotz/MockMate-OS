import {
  boundedLevenshteinDistance,
  ClearSpeakScoringUnavailableError,
  isGovernedClearSpeakScoringAvailable,
  isClearSpeakScoringAvailable,
  scoreSession,
  validateTranscriptEvidence,
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

  it('keeps user-facing runtimes unavailable until atomic score authority exists', () => {
    expect(isGovernedClearSpeakScoringAvailable({ MOCKMATE_RUNTIME_MODE: 'preview', GROQ_API_KEY: 'configured' })).toBe(false);
    expect(isGovernedClearSpeakScoringAvailable({ MOCKMATE_RUNTIME_MODE: 'production', GROQ_API_KEY: 'configured' })).toBe(false);
    expect(isGovernedClearSpeakScoringAvailable({ MOCKMATE_RUNTIME_MODE: 'development', GROQ_API_KEY: 'configured' })).toBe(false);
    expect(isGovernedClearSpeakScoringAvailable({ MOCKMATE_RUNTIME_MODE: 'test', GROQ_API_KEY: 'configured' })).toBe(true);
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

  it('computes edit distance with bounded-row memory and exact results', () => {
    expect(boundedLevenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(boundedLevenshteinDistance('sitting', 'kitten')).toBe(3);
    expect(boundedLevenshteinDistance('a'.repeat(1_000), `${'a'.repeat(999)}b`)).toBe(1);
  });

  it('accepts only finite, nonnegative, monotonic timing evidence with positive spans', () => {
    expect(validateTranscriptEvidence({
      text: 'hello world',
      words: [
        { word: 'hello', start: 0, end: 0.4 },
        { word: 'world', start: 0.45, end: 0.9 },
      ],
    }).words).toHaveLength(2);

    const invalidEvidence = [
      { text: 'hello', words: [] },
      { text: 'hello world', words: [{ word: 'hello', start: 0, end: 0 }, { word: 'world', start: 0, end: 0 }] },
      { text: 'hello world', words: [{ word: 'hello', start: -1, end: 0.2 }, { word: 'world', start: 0.3, end: 0.5 }] },
      { text: 'hello world', words: [{ word: 'hello', start: 0, end: Number.NaN }, { word: 'world', start: 0.3, end: 0.5 }] },
      { text: 'hello world', words: [{ word: 'hello', start: 0, end: 0.2 }, { word: 'world', start: Number.POSITIVE_INFINITY, end: Number.POSITIVE_INFINITY }] },
      { text: 'hello world', words: [{ word: 'hello', start: 1, end: 1.2 }, { word: 'world', start: 0.3, end: 0.5 }] },
    ];
    for (const evidence of invalidEvidence) {
      expect(() => validateTranscriptEvidence(evidence)).toThrow(ClearSpeakScoringUnavailableError);
    }
  });
});
