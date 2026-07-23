/**
 * ClearSpeak Supabase persistence layer.
 *
 * Stores profiles, progress, and hard-word ledgers with the server-side
 * Supabase service-role client. If Supabase is not configured locally, the
 * service falls back to in-memory maps so smoke tests can still run.
 */

import { supabaseAdmin } from '../supabaseAdmin';
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

export async function saveProfileToStore(profile: ClearSpeakProfile): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    await supabaseAdmin.from(TABLE_PROFILES).upsert({
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
  } catch (err: any) {
    console.warn('[ClearSpeak/Supabase] Error saving profile, using memory fallback:', err.message);
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
  } catch (err: any) {
    console.warn('[ClearSpeak/Supabase] Error getting profile, using memory fallback:', err.message);
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
          updatedAt: data.updated_at,
        } as ClearSpeakProgress)
      : defaultProgress(userId);
  } catch {
    console.warn('[ClearSpeak/Supabase] Error getting progress, using memory fallback');
    return fallbackProgress.get(userId) || defaultProgress(userId);
  }
}

export async function saveProgressToStore(progress: ClearSpeakProgress): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    await supabaseAdmin.from(TABLE_PROGRESS).upsert({
      user_id: progress.userId,
      streak: progress.streak,
      last_practice_date: progress.lastPracticeDate,
      clarity_trend: progress.clarityTrend,
      topic_best_scores: progress.topicBestScores,
      best_performing_topic: progress.bestPerformingTopic,
      hard_word_count: progress.hardWordCount,
      total_sessions_completed: progress.totalSessionsCompleted,
      updated_at: progress.updatedAt,
    }, { onConflict: 'user_id' });
  } catch {
    console.warn('[ClearSpeak/Supabase] Error saving progress, using memory fallback');
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
  } catch {
    console.warn('[ClearSpeak/Supabase] Error getting ledger, using memory fallback');
    return fallbackLedger.get(userId) || defaultLedger(userId);
  }
}

export async function saveLedgerToStore(ledger: HardWordsLedger): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error('Supabase not configured');
    await supabaseAdmin.from(TABLE_LEDGER).upsert({
      user_id: ledger.userId,
      entries: ledger.entries,
      updated_at: ledger.updatedAt,
    }, { onConflict: 'user_id' });
  } catch {
    console.warn('[ClearSpeak/Supabase] Error saving ledger, using memory fallback');
    fallbackLedger.set(ledger.userId, ledger);
  }
}
