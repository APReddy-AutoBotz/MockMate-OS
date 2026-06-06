/**
 * backend/clearspeak/types.ts
 * Mockmate ClearSpeak — canonical type definitions for all backend models.
 * Source of truth: implementation_plan.md §9, §10, §11, §14
 */

// ─── Onboarding Profile ───────────────────────────────────────────────────────

export type ClearSpeakRole = string;

export type ClearSpeakLevel = 1 | 2 | 3; // 1 = Beginner, 2 = Intermediate, 3 = Advanced

export type MainStruggle =
  | 'mental_translation_delay'
  | 'fear_of_judgment'
  | 'speed_trap'
  | 'vocabulary_loss';

export type PracticeDuration = 3 | 5; // minutes

/** Persisted once after onboarding; drives all generation logic. */
export interface ClearSpeakProfile {
  userId: string;
  role: ClearSpeakRole;
  level: ClearSpeakLevel;
  /** E.g. "speak confidently in status meetings" */
  goal: string;
  /** Who the user typically speaks to, e.g. "Non-technical stakeholders" */
  audienceContext: string;
  mainStruggle: MainStruggle;
  /** ISO 639-1 code, e.g. "en", "hi", "es" — used for UI hint language */
  comfortLanguage: string;
  practiceDuration: PracticeDuration;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

// ─── Passage Token (Canonical Rendering Contract) ────────────────────────────

export type PauseType = 'none' | 'short' | 'stop';

/**
 * A single renderable token in a passage.
 * The frontend MUST use this structure to build visual display.
 * Raw strings with embedded slashes must NEVER be parsed.
 */
export interface PassageToken {
  text: string;
  isStressed: boolean;
  pauseType: PauseType;
}

// ─── AI-Generated Session Content ────────────────────────────────────────────

/**
 * Canonical JSON schema for a generated ClearSpeak practice session.
 * All fields are required. See implementation_plan.md §9 for generation rules.
 */
export interface ClearSpeakSessionContent {
  topicTag: string;           // e.g. "Stakeholder Pushback"
  difficultyLevel: ClearSpeakLevel;
  targetSkill: string;        // e.g. "Pacing & Tone"
  keyVocab: string[];         // Exactly 3 words/phrases
  passageData: PassageToken[];
  repeatPhrase: string;       // Short phrase for Repeat-After-Coach
  retrySentence: string;      // Sentence surfaced if rhythm/clarity dips below 70
  bridgeReady: boolean;       // Whether this session can unlock the Interview Bridge
  interviewBridgeQuestion: string; // Only surfaces when bridgeReady && trigger conditions met
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * 3-Pillar scoring model with weights.
 * Clarity: 50%, Pacing: 25%, Rhythm: 25%
 * See implementation_plan.md §11
 */
export interface ClearSpeakSessionScore {
  /** Phonetic closeness via Levenshtein tolerance. Weight: 50% */
  clarity: number;    // 0-100
  /** Adherence to level-specific WPM bands. Weight: 25% */
  pacing: number;     // 0-100
  /** Pause adherence mapped to PassageToken.pauseType. Weight: 25% */
  rhythm: number;     // 0-100
  /** Weighted composite: (clarity×0.5) + (pacing×0.25) + (rhythm×0.25) */
  composite: number;  // 0-100
  /**
   * Additive modifier (+5 max) if the user successfully enunciates words
   * from their HardWordsLedger. Does not subtract if failed.
   */
  hardWordBonus: number; // 0-5
  /** Human-readable single-tip feedback. Must be supportive and credible. */
  feedbackTip: string;
  /** WPM calculated from audio duration and token count */
  measuredWpm: number;
  /** Whether the retry sentence was attempted and successfully delivered */
  retrySuccess: boolean;
}

// ─── Session Record ────────────────────────────────────────────────────────────

export type SessionPhase = 'vocab_warmup' | 'guided_read' | 'repeat_after_coach' | 'retry' | 'completed';

export interface ClearSpeakSession {
  id: string;
  userId: string;
  profileSnapshot: Pick<ClearSpeakProfile, 'role' | 'level'>;
  content: ClearSpeakSessionContent;
  score?: ClearSpeakSessionScore;
  phase: SessionPhase;
  /**
   * Raw audio is NEVER stored here. Only metric JSON persists.
   * Audio buffers are destroyed server-side after scoring.
   * See implementation_plan.md §14 — Audio Privacy & Retention Policy
   */
  createdAt: string;
  completedAt?: string;
}

// ─── Hard Words Ledger ────────────────────────────────────────────────────────

export interface HardWordEntry {
  word: string;
  failCount: number;
  lastAttemptedAt: string;
  /** Cleared when failCount resets after 2 consecutive successes */
  resolved: boolean;
}

export interface HardWordsLedger {
  userId: string;
  entries: HardWordEntry[];
  updatedAt: string;
}

// ─── Progress Tracking ────────────────────────────────────────────────────────

export interface ClearSpeakProgress {
  userId: string;
  streak: number;
  lastPracticeDate: string;
  /** Rolling array of last 10 composite scores, oldest first */
  clarityTrend: number[];
  /** topic_tag → best composite score achieved */
  topicBestScores: Record<string, number>;
  bestPerformingTopic: string;
  hardWordCount: number;
  totalSessionsCompleted: number;
  updatedAt: string;
}

// ─── Interview Bridge State ───────────────────────────────────────────────────

/**
 * Evaluated per session completion. All conditions must be true to surface bridge.
 * See implementation_plan.md §13
 */
export interface BridgeTriggerState {
  streakMet: boolean;       // streak >= 3
  rollingAvgMet: boolean;   // avg clarity > 80 across last 3 sessions
  currentSessionStable: boolean; // current rhythm > 80 OR retrySuccess
  bridgeReadyFlag: boolean; // ClearSpeakSessionContent.bridgeReady
  /** True only when all four conditions are met */
  shouldSurface: boolean;
}
