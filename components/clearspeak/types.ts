/**
 * components/clearspeak/types.ts
 * Mockmate ClearSpeak — shared frontend types (mirrors backend/clearspeak/types.ts).
 *
 * Keep in sync with backend. Do not extend independently.
 */

export type ClearSpeakRole = string;

export type ClearSpeakLevel = 1 | 2 | 3;

export type MainStruggle =
  | 'mental_translation_delay'
  | 'fear_of_judgment'
  | 'speed_trap'
  | 'vocabulary_loss';

export type PracticeDuration = 3 | 5;

export interface ClearSpeakProfile {
  userId: string;
  role: ClearSpeakRole;
  level: ClearSpeakLevel;
  goal: string;
  audienceContext: string;
  mainStruggle: MainStruggle;
  comfortLanguage: string;
  practiceDuration: PracticeDuration;
  createdAt: string;
  updatedAt: string;
}

export type PauseType = 'none' | 'short' | 'stop';

export interface PassageToken {
  text: string;
  isStressed: boolean;
  pauseType: PauseType;
}

export interface ClearSpeakSessionContent {
  topicTag: string;
  difficultyLevel: ClearSpeakLevel;
  targetSkill: string;
  keyVocab: string[];
  passageData: PassageToken[];
  repeatPhrase: string;
  retrySentence: string;
  bridgeReady: boolean;
  interviewBridgeQuestion: string;
}

export interface ClearSpeakSessionScore {
  clarity: number;
  pacing: number;
  rhythm: number;
  composite: number;
  hardWordBonus: number;
  feedbackTip: string;
  measuredWpm: number;
  retrySuccess: boolean;
}

export interface ClearSpeakProgress {
  userId: string;
  streak: number;
  lastPracticeDate: string;
  clarityTrend: number[];
  topicBestScores: Record<string, number>;
  bestPerformingTopic: string;
  hardWordCount: number;
  totalSessionsCompleted: number;
  updatedAt: string;
}

export interface BridgeTriggerState {
  streakMet: boolean;
  rollingAvgMet: boolean;
  currentSessionStable: boolean;
  bridgeReadyFlag: boolean;
  shouldSurface: boolean;
}

/**
 * Bridge data contract. Passed from ClearSpeak → Interview on bridge acceptance.
 * Consumed by handleInterviewBridge in App.tsx to build a pre-seeded SessionContext.
 *
 * Contract version: 1.0
 * Source: implementation_plan.md §13
 */
export interface ClearSpeakBridgePayload {
  /** Always "clearspeak_bridge" — lets Interview mode detect controlled entry */
  source: 'clearspeak_bridge';
  /** The AI-generated interview question linked to the practiced topic */
  bridgeQuestion: string;
  /** ClearSpeak role identifier, mapped to a candidateRole string */
  role: ClearSpeakRole;
  /** Topic cluster the user practiced (e.g. "Stakeholder Pushback") */
  topicTag: string;
  /** Vocabulary words the user practiced this session */
  practicedWords: string[];
  /** Most recent pillar scores for Interview context logging */
  recentScores: {
    clarity: number;
    pacing: number;
    rhythm: number;
    composite: number;
  };
}

/** App-level session phase state machine */
export type ClearSpeakPhase =
  | 'idle'
  | 'onboarding'
  | 'vocab_warmup'
  | 'guided_read'
  | 'recording'
  | 'processing'
  | 'score_card'
  | 'retry'
  | 'bridge_prompt'
  | 'complete';
