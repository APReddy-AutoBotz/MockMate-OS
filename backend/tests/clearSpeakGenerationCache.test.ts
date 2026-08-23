import type { ClearSpeakProfile, ClearSpeakSessionContent } from 'mockmate-shared';
import {
  BoundedPassageCache,
  getClearSpeakGenerationCacheKey,
} from '../clearspeak/generateService';

const profile = (userId: string): ClearSpeakProfile => ({
  userId,
  role: 'Product Manager',
  level: 2,
  goal: 'Present clearly',
  audienceContext: 'Executives',
  mainStruggle: 'Pacing',
  comfortLanguage: 'English',
  practiceDuration: 5,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
});

const content: ClearSpeakSessionContent = {
  topicTag: 'status_update',
  difficultyLevel: 2,
  targetSkill: 'Pacing',
  keyVocab: ['status', 'risk', 'delivery'],
  passageData: [{ text: 'The project is on track.', isStressed: false, pauseType: 'stop' }],
  repeatPhrase: 'The project is on track.',
  retrySentence: 'The project is on track.',
  bridgeReady: false,
  interviewBridgeQuestion: '',
};

describe('ClearSpeak generated-content cache authority', () => {
  it('uses an owner-scoped, non-reversible digest of every prompt input', () => {
    const consentedExcerpt = 'PRIVATE CONSENTED RESUME EXCERPT';
    const first = getClearSpeakGenerationCacheKey(
      profile('11111111-1111-4111-8111-111111111111'),
      `prompt:${consentedExcerpt}`,
      ['status_update'],
      { summary: consentedExcerpt, vocabulary: ['roadmap'] },
    );
    const otherOwner = getClearSpeakGenerationCacheKey(
      profile('22222222-2222-4222-8222-222222222222'),
      `prompt:${consentedExcerpt}`,
      ['status_update'],
      { summary: consentedExcerpt, vocabulary: ['roadmap'] },
    );
    const otherInput = getClearSpeakGenerationCacheKey(
      profile('11111111-1111-4111-8111-111111111111'),
      `prompt:${consentedExcerpt}:changed`,
      ['status_update'],
      { summary: consentedExcerpt, vocabulary: ['roadmap'] },
    );

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(consentedExcerpt);
    expect(otherOwner).not.toBe(first);
    expect(otherInput).not.toBe(first);
  });

  it('deletes expired entries and evicts the oldest entry at its size bound', () => {
    const cache = new BoundedPassageCache();
    cache.set('first', content, 0, 2);
    cache.set('second', { ...content, topicTag: 'second' }, 1, 2);
    cache.set('third', { ...content, topicTag: 'third' }, 2, 2);

    expect(cache.size).toBe(2);
    expect(cache.get('first', 2, 1_000)).toBeNull();
    expect(cache.get('second', 999, 1_000)?.topicTag).toBe('second');
    expect(cache.get('second', 1_001, 1_000)).toBeNull();
    expect(cache.size).toBe(1);
  });
});
