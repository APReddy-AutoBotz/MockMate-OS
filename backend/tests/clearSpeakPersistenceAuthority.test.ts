const mockUpsert = jest.fn();
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn((_table?: string) => {
  const query: any = {};
  query.upsert = (...args: any[]) => mockUpsert(...args);
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.maybeSingle = (...args: any[]) => mockMaybeSingle(...args);
  return query;
});

jest.mock('../supabaseAdmin', () => ({
  supabaseAdmin: { from: (table: string) => mockFrom(table) },
}));

import {
  ClearSpeakPersistenceUnavailableError,
  getProfileFromStore,
  isClearSpeakMemoryFallbackAllowed,
  saveLedgerToStore,
  saveProfileToStore,
  saveProgressToStore,
} from '../clearspeak/supabaseStoreService';
import type { ClearSpeakProfile, ClearSpeakProgress, HardWordsLedger } from 'mockmate-shared';

const profile: ClearSpeakProfile = {
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'Product Manager',
  level: 2,
  goal: 'Steadier delivery',
  audienceContext: 'Executives',
  mainStruggle: 'Pacing',
  comfortLanguage: 'English',
  practiceDuration: 5,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

const progress: ClearSpeakProgress = {
  userId: profile.userId,
  streak: 1,
  lastPracticeDate: '2026-08-23',
  clarityTrend: [80],
  topicBestScores: { update: 80 },
  bestPerformingTopic: 'update',
  hardWordCount: 0,
  totalSessionsCompleted: 1,
  scoreEvidenceBasis: 'transcript_timing_heuristic',
  updatedAt: profile.updatedAt,
};

const ledger: HardWordsLedger = {
  userId: profile.userId,
  entries: [],
  updatedAt: profile.updatedAt,
};

describe('ClearSpeak persistence authority', () => {
  const originalRuntimeMode = process.env.MOCKMATE_RUNTIME_MODE;
  const originalFallback = process.env.CLEARSPEAK_ALLOW_MEMORY_STORE;
  let consoleError: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;

  beforeAll(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MOCKMATE_RUNTIME_MODE = 'preview';
    delete process.env.CLEARSPEAK_ALLOW_MEMORY_STORE;
    mockUpsert.mockResolvedValue({ data: null, error: { message: 'resolved database error' } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'resolved database error' } });
  });

  afterAll(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    if (originalRuntimeMode === undefined) delete process.env.MOCKMATE_RUNTIME_MODE;
    else process.env.MOCKMATE_RUNTIME_MODE = originalRuntimeMode;
    if (originalFallback === undefined) delete process.env.CLEARSPEAK_ALLOW_MEMORY_STORE;
    else process.env.CLEARSPEAK_ALLOW_MEMORY_STORE = originalFallback;
  });

  it('allows fallback only in tests or explicitly opted-in development', () => {
    expect(isClearSpeakMemoryFallbackAllowed({ MOCKMATE_RUNTIME_MODE: 'test' })).toBe(true);
    expect(isClearSpeakMemoryFallbackAllowed({ MOCKMATE_RUNTIME_MODE: 'development' })).toBe(false);
    expect(isClearSpeakMemoryFallbackAllowed({
      MOCKMATE_RUNTIME_MODE: 'development',
      CLEARSPEAK_ALLOW_MEMORY_STORE: 'true',
    })).toBe(true);
    expect(isClearSpeakMemoryFallbackAllowed({ MOCKMATE_RUNTIME_MODE: 'preview' })).toBe(false);
    expect(isClearSpeakMemoryFallbackAllowed({ MOCKMATE_RUNTIME_MODE: 'production' })).toBe(false);
  });

  it('treats resolved Supabase write errors as unavailable in preview', async () => {
    await expect(saveProfileToStore(profile)).rejects.toBeInstanceOf(ClearSpeakPersistenceUnavailableError);
    await expect(saveProgressToStore(progress)).rejects.toBeInstanceOf(ClearSpeakPersistenceUnavailableError);
    await expect(saveLedgerToStore(ledger)).rejects.toBeInstanceOf(ClearSpeakPersistenceUnavailableError);
  });

  it('treats resolved Supabase read errors as unavailable in preview', async () => {
    await expect(getProfileFromStore(profile.userId)).rejects.toBeInstanceOf(ClearSpeakPersistenceUnavailableError);
  });

  it('uses the memory store only under canonical test authority', async () => {
    process.env.MOCKMATE_RUNTIME_MODE = 'test';
    await expect(saveProfileToStore(profile)).resolves.toBeUndefined();
    await expect(getProfileFromStore(profile.userId)).resolves.toEqual(profile);
  });
});
