import { canonicalJsonValue, hashArtifactContent } from '../clearspeak/artifactAuthority';

describe('ClearSpeak artifact canonicalization', () => {
  it('is stable across JSONB-style key reordering and nested objects', () => {
    const generated = { topicTag: 'Atlas', nested: { z: 1, a: 2 }, keyVocab: ['Atlas'] };
    const jsonbReload = { keyVocab: ['Atlas'], nested: { a: 2, z: 1 }, topicTag: 'Atlas' };
    expect(hashArtifactContent(generated)).toBe(hashArtifactContent(jsonbReload));
    expect(Object.keys(canonicalJsonValue(generated))).toEqual(['keyVocab', 'nested', 'topicTag']);
  });
});
