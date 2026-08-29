/**
 * ClearSpeak Supabase persistence layer.
 *
 * Stores profiles, progress, and hard-word ledgers with the server-side
 * Supabase service-role client. In-memory persistence is available only to the
 * canonical test runtime or when a developer explicitly opts in locally.
 */

import { supabaseAdmin } from '../supabaseAdmin';
import { runtimeMode } from '../config/runtimeConfig';
import type {
  ClearSpeakProfile,
  ClearSpeakProgress,
  HardWordsLedger,
} from 'mockmate-shared';

const TABLE_PROFILES = 'clearspeak_profiles';
const TABLE_PROGRESS = 'clearspeak_progress';
const TABLE_LEDGER = 'clearspeak_ledgers';

const fallbackProfiles = new Map<string, ClearSpeakProfile>();
const fallbackProgress = new Map<string, ClearSpeakProgress>();
const fallbackLedger = new Map<string, HardWordsLedger>();

export const CLEAR_SPEAK_PERSISTENCE_UNAVAILABLE_MESSAGE =
  'ClearSpeak persistence is temporarily unavailable.';

export class ClearSpeakPersistenceUnavailableError extends Error {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly status = 503;
  readonly cause: unknown;

  constructor(cause?: unknown) {
    super(CLEAR_SPEAK_PERSISTENCE_UNAVAILABLE_MESSAGE);
    this.name = 'ClearSpeakPersistenceUnavailableError';
    this.cause = cause;
  }
}

export function isClearSpeakMemoryFallbackAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const mode = runtimeMode(env);
    return mode === 'test' ||
      (mode === 'development' && env.CLEARSPEAK_ALLOW_MEMORY_STORE === 'true');
  } catch {
    return false;
  }
}

function allowFallbackOrThrow(operation: string, cause: unknown): void {
  if (!isClearSpeakMemoryFallbackAllowed()) {
    console.error(`[ClearSpeak/Supabase] ${operation} failed; authoritative persistence is unavailable.`);
    throw new ClearSpeakPersistenceUnavailableError(cause);
  }
  console.warn(`[ClearSpeak/Supabase] ${operation} failed; using the non-authoritative test/development store.`);
}

export async function saveProfileToStore(profile: ClearSpeakProfile): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    const { error } = await supabaseAdmin.from(TABLE_PROFILES).upsert({
      user_id: profile.userId,
      role: profile.role,
      level: profile.level,
      goal: profile.goal,
      audience_context: profile.audienceContext,
      main_struggle: profile.mainStruggle,
      comfort_language: profile.comfortLanguage,
      practice_duration: profile.practiceDuration,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (err: unknown) {
    allowFallbackOrThrow('save profile', err);
    fallbackProfiles.set(profile.userId, profile);
  }
}

export async function getProfileFromStore(userId: string): Promise<ClearSpeakProfile | null> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    const { data, error } = await supabaseAdmin.from(TABLE_PROFILES).select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      userId: data.user_id,
      role: data.role,
      level: data.level,
      goal: data.goal,
      audienceContext: data.audience_context || '',
      mainStruggle: data.main_struggle,
      comfortLanguage: data.comfort_language || 'en',
      practiceDuration: data.practice_duration || 5,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } as ClearSpeakProfile;
  } catch (err: unknown) {
    allowFallbackOrThrow('get profile', err);
    return fallbackProfiles.get(userId) || null;
  }
}

const defaultProgress = (userId: string): ClearSpeakProgress => ({
  userId,
  streak: 0,
  lastPracticeDate: '',
  clarityTrend: [],
  topicBestScores: {},
  bestPerformingTopic: '',
  hardWordCount: 0,
  totalSessionsCompleted: 0,
  scoreEvidenceBasis: null,
  updatedAt: new Date().toISOString(),
});

export async function getProgressFromStore(userId: string): Promise<ClearSpeakProgress> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    const { data, error } = await supabaseAdmin.from(TABLE_PROGRESS).select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data
      ? ({
          userId: data.user_id,
          streak: data.streak || 0,
          lastPracticeDate: data.last_practice_date || '',
          clarityTrend: data.clarity_trend || [],
          topicBestScores: data.topic_best_scores || {},
          bestPerformingTopic: data.best_performing_topic || '',
          hardWordCount: data.hard_word_count || 0,
          totalSessionsCompleted: data.total_sessions_completed || 0,
          scoreEvidenceBasis: data.score_evidence_basis === 'transcript_timing_heuristic'
            ? 'transcript_timing_heuristic'
            : null,
          updatedAt: data.updated_at,
        } as ClearSpeakProgress)
      : defaultProgress(userId);
  } catch (err: unknown) {
    allowFallbackOrThrow('get progress', err);
    return fallbackProgress.get(userId) || defaultProgress(userId);
  }
}

export async function saveProgressToStore(progress: ClearSpeakProgress): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    const { error } = await supabaseAdmin.from(TABLE_PROGRESS).upsert({
      user_id: progress.userId,
      streak: progress.streak,
      last_practice_date: progress.lastPracticeDate,
      clarity_trend: progress.clarityTrend,
      topic_best_scores: progress.topicBestScores,
      best_performing_topic: progress.bestPerformingTopic,
      hard_word_count: progress.hardWordCount,
      total_sessions_completed: progress.totalSessionsCompleted,
      score_evidence_basis: progress.scoreEvidenceBasis,
      updated_at: progress.updatedAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (err: unknown) {
    allowFallbackOrThrow('save progress', err);
    fallbackProgress.set(progress.userId, progress);
  }
}

const defaultLedger = (userId: string): HardWordsLedger => ({
  userId,
  entries: [],
  updatedAt: new Date().toISOString(),
});

export async function getLedgerFromStore(userId: string): Promise<HardWordsLedger> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    const { data, error } = await supabaseAdmin.from(TABLE_LEDGER).select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data
      ? ({ userId: data.user_id, entries: data.entries || [], updatedAt: data.updated_at } as HardWordsLedger)
      : defaultLedger(userId);
  } catch (err: unknown) {
    allowFallbackOrThrow('get hard-word ledger', err);
    return fallbackLedger.get(userId) || defaultLedger(userId);
  }
}

export async function saveLedgerToStore(ledger: HardWordsLedger): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    const { error } = await supabaseAdmin.from(TABLE_LEDGER).upsert({
      user_id: ledger.userId,
      entries: ledger.entries,
      updated_at: ledger.updatedAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (err: unknown) {
    allowFallbackOrThrow('save hard-word ledger', err);
    fallbackLedger.set(ledger.userId, ledger);
  }
}
