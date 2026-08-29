const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();

jest.mock('../supabaseAdmin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
  isSupabaseConfigured: true,
}));

import { getCachedResult, hashExactJson, setCachedResult } from '../services/cacheService';

describe('owned AI cache boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const query = {
      select: mockSelect,
      eq: mockEq,
      is: mockIs,
      maybeSingle: mockMaybeSingle,
      upsert: mockUpsert,
    };
    mockFrom.mockReturnValue(query);
    mockSelect.mockReturnValue(query);
    mockEq.mockReturnValue(query);
    mockIs.mockReturnValue(query);
    mockMaybeSingle.mockResolvedValue({
      data: { payload: { success: true }, expires_at: null },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('keeps exact request identity stable across object-key order', () => {
    expect(hashExactJson({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(hashExactJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('preserves meaningful string case and whitespace in exact request identity', () => {
    expect(hashExactJson({ text: 'Senior Engineer' })).not.toBe(hashExactJson({ text: 'senior engineer' }));
    expect(hashExactJson({ text: 'Senior  Engineer' })).not.toBe(hashExactJson({ text: 'Senior Engineer' }));
  });

  it('requires matching owner metadata when reading an owned cache entry', async () => {
    await expect(getCachedResult('resume_score_governed_v2', 'request-key', { userId: 'user-a' }))
      .resolves.toEqual({ success: true });

    expect(mockEq).toHaveBeenCalledWith('cache_key', 'resume_score_governed_v2:request-key');
    expect(mockEq).toHaveBeenCalledWith('kind', 'resume_score_governed_v2');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(mockIs).not.toHaveBeenCalled();
  });

  it('keeps shared cache reads restricted to unowned rows', async () => {
    await getCachedResult('resume_suggest_governed_v1', 'request-key');
    expect(mockIs).toHaveBeenCalledWith('user_id', null);
  });

  it('writes owner metadata with derived user cache data', async () => {
    await setCachedResult(
      'resume_score_governed_v2',
      'request-key',
      { success: true },
      24,
      { userId: 'user-a' },
    );

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      cache_key: 'resume_score_governed_v2:request-key',
      kind: 'resume_score_governed_v2',
      payload: { success: true },
      user_id: 'user-a',
    }));
  });
});
