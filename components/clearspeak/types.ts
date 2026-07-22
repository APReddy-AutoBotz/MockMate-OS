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
  mainStruggle: MainStruggle | string;
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
  difficultyLevel: number;
  targetSkill: string;
  keyVocab: string[];
  passageData: PassageToken[];
  repeatPhrase?: string;
  retrySentence?: string;
  bridgeReady: boolean;
  interviewBridgeQuestion?: string;
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

export interface ClearSpeakBridgePayload {
  source: 'clearspeak_bridge';
  bridgeQuestion: string;
  role: ClearSpeakRole;
  topicTag: string;
  practicedWords: string[];
  recentScores: {
    clarity: number;
    pacing: number;
    rhythm: number;
    composite: number;
  };
}

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
