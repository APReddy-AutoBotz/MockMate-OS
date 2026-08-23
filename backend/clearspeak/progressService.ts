/**
 * backend/clearspeak/progressService.ts
 * MockMate ClearSpeak progress tracking and interview bridge trigger evaluation.
 *
 * Persistence: Supabase via supabaseStoreService.ts.
 */

import type {
  ClearSpeakProgress,
  ClearSpeakSessionScore,
  BridgeTriggerState,
  HardWordEntry,
  HardWordsLedger,
} from 'mockmate-shared';
import {
  getProgressFromStore,
  saveProgressToStore,
  getLedgerFromStore,
  saveLedgerToStore,
} from './supabaseStoreService';

// ─── Progress Utils ────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Update Progress After Session ────────────────────────────────────────────

export async function recordSessionResult(
  userId: string,
  score: ClearSpeakSessionScore,
  topicTag: string,
): Promise<ClearSpeakProgress> {
  const progress = await getProgressFromStore(userId);
  const today = todayISO();

  if (score.evidenceBasis !== 'transcript_timing_heuristic' || score.pronunciationAssessed !== false) {
    throw new Error('ClearSpeak score evidence is not eligible for progress');
  }

  // Existing score-derived fields predate explicit provenance. Reset them once
  // instead of silently mixing legacy or synthetic values into verified trends.
  if (progress.scoreEvidenceBasis !== score.evidenceBasis) {
    progress.clarityTrend = [];
    progress.topicBestScores = {};
    progress.bestPerformingTopic = '';
  }
  progress.scoreEvidenceBasis = score.evidenceBasis;

  // Streak logic
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);

  if (progress.lastPracticeDate === today) {
    // Already practiced today — no streak change
  } else if (progress.lastPracticeDate === yesterdayISO) {
    progress.streak += 1;
  } else {
    progress.streak = 1; // Streak broken — reset
  }
  progress.lastPracticeDate = today;

  // Transcript-match trend: rolling last 10 (legacy field name retained in DB).
  progress.clarityTrend = [...progress.clarityTrend, score.clarity].slice(-10);

  // Best topic score
  const existing = progress.topicBestScores[topicTag] ?? 0;
  if (score.composite > existing) {
    progress.topicBestScores[topicTag] = score.composite;
  }

  // Recompute best topic
  const [bestTopic] = Object.entries(progress.topicBestScores)
    .sort(([, a], [, b]) => ((b as number) || 0) - ((a as number) || 0))[0] ?? ['', 0];
  progress.bestPerformingTopic = bestTopic;

  progress.totalSessionsCompleted += 1;
  progress.updatedAt = new Date().toISOString();

  await saveProgressToStore(progress);
  return progress;
}

// ─── Hard Words Ledger ─────────────────────────────────────────────────────────

export async function getOrCreateLedger(userId: string): Promise<HardWordsLedger> {
  return getLedgerFromStore(userId);
}

/**
 * Records failed/succeeded words. Increments failCount or marks resolved.
 */
export async function updateLedger(
  userId: string,
  failedWords: string[],
  succeededWords: string[],
): Promise<HardWordsLedger> {
  const ledger = await getLedgerFromStore(userId);

  for (const word of failedWords) {
    const existing = ledger.entries.find(e => e.word === word);
    if (existing) {
      existing.failCount += 1;
      existing.lastAttemptedAt = new Date().toISOString();
    } else {
      ledger.entries.push({
        word,
        failCount: 1,
        resolved: false,
      } as any);
    }
  }

  for (const word of succeededWords) {
    const existing = ledger.entries.find(e => e.word === word);
    if (existing) {
      existing.failCount = Math.max(0, existing.failCount - 1);
      if (existing.failCount === 0) existing.resolved = true;
    }
  }

  ledger.updatedAt = new Date().toISOString();
  await saveLedgerToStore(ledger);
  return ledger;
}

// ─── Interview Bridge Trigger ──────────────────────────────────────────────────

/**
 * Evaluates all 4 bridge conditions against persisted progress.
 * Per implementation_plan.md §13:
 *   1. streak >= 3
 *   2. Rolling average clarity > 80 across last 3 sessions
 *   3. Current session rhythm > 80 OR retrySuccess
 *   4. bridgeReady flag from session content
 */
export async function evaluateBridgeTrigger(
  userId: string,
  currentScore: ClearSpeakSessionScore,
  bridgeReadyFlag: boolean,
): Promise<BridgeTriggerState> {
  const progress = await getProgressFromStore(userId);

  const verifiedEvidence =
    currentScore.evidenceBasis === 'transcript_timing_heuristic' &&
    currentScore.pronunciationAssessed === false &&
    progress.scoreEvidenceBasis === 'transcript_timing_heuristic';

  const streakMet = verifiedEvidence && progress.streak >= 3;

  // recordSessionResult has already appended the current result. Require three
  // verified observations and do not append the current score a second time.
  const recentClarity = progress.clarityTrend.slice(-3);
  const rollingAvg = recentClarity.length === 3
    ? recentClarity.reduce((sum, s) => sum + s, 0) / recentClarity.length
    : 0;
  const rollingAvgMet = verifiedEvidence && recentClarity.length === 3 && rollingAvg > 80;

  const currentSessionStable =
    verifiedEvidence && (currentScore.rhythm > 80 || currentScore.retrySuccess);

  const shouldSurface =
    streakMet && rollingAvgMet && currentSessionStable && bridgeReadyFlag;

  return {
    streakMet,
    rollingAvgMet,
    currentSessionStable,
    bridgeReadyFlag,
    shouldSurface,
  };
}

// ─── Read Progress ─────────────────────────────────────────────────────────────

export async function getProgress(userId: string): Promise<ClearSpeakProgress> {
  return getProgressFromStore(userId);
}
