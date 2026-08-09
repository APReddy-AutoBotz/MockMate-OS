import { applyAuthoritativeGrounding, generateSession } from '../clearspeak/generateService';

describe('authoritative ClearSpeak generation grounding', () => {
  const profile: any = {
    userId: '11111111-1111-1111-1111-111111111111', role: 'general_corporate', level: 2,
    goal: 'communicate clearly', mainStruggle: 'pacing', audienceContext: 'leadership',
    comfortLanguage: 'en', practiceDuration: 5, createdAt: '', updatedAt: '',
  };

  it('binds deterministic fallback content to the validated snapshot facts', async () => {
    const content = await generateSession(profile, [], 0, {
      summary: 'Led the Atlas migration and reduced processing time by thirty percent.',
      vocabulary: ['Atlas', 'migration', 'processing'],
    });
    expect(content.passageData.map(part => part.text).join(' ')).toContain('Atlas migration');
    expect(content.keyVocab).toEqual(['Atlas', 'migration', 'processing']);
    expect(content.topicTag).toContain('Resume practice');
  });

  it('transforms schema-valid generic provider content before it can be accepted as grounded', () => {
    const genericProviderContent: any = {
      topicTag: 'Weekly status update', difficultyLevel: 2, targetSkill: 'pacing',
      keyVocab: ['agenda', 'update', 'team'],
      passageData: [{ text: 'Share a concise weekly update with your team.', isStressed: false, pauseType: 'stop' }],
      repeatPhrase: 'Share a concise update', retrySentence: 'Share a concise weekly update with your team.',
      bridgeReady: false, interviewBridgeQuestion: '',
    };
    const grounded = applyAuthoritativeGrounding(genericProviderContent, profile, {
      summary: 'Led the Atlas migration and reduced processing time by thirty percent.',
      vocabulary: ['Atlas', 'migration', 'processing'],
    });

    expect(grounded).not.toEqual(genericProviderContent);
    expect(grounded.passageData.map((part: any) => part.text).join(' ')).toContain('Atlas migration');
    expect(grounded.topicTag).toBe('Resume practice: Atlas / migration');
    expect(grounded.keyVocab).toEqual(['Atlas', 'migration', 'processing']);
    expect(grounded.repeatPhrase).toContain('Atlas migration');
  });
});
