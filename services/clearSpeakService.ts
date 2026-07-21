import { z } from 'zod';
/**
 * services/clearSpeakService.ts
 * Mockmate ClearSpeak frontend API client.
 */
import { apiClient, ApiError } from './apiClient';
import type {
  ClearSpeakProfile,
  ClearSpeakSessionContent,
  ClearSpeakSessionScore,
  ClearSpeakProgress,
  BridgeTriggerState,
} from 'mockmate-shared';

export async function saveProfile(
  profile: Omit<ClearSpeakProfile, 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<ClearSpeakProfile> {
  const data = await apiClient.post<{ profile: ClearSpeakProfile }>('clearspeak/profile', profile, z.any());
  return data.profile;
}

export async function getProfile(): Promise<ClearSpeakProfile | null> {
  try {
    const data = await apiClient.get<{ profile: ClearSpeakProfile }>('clearspeak/profile', z.any());
    return data.profile;
  } catch (err: any) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function generateSession(
  recentTopics: string[] = [],
  sessionAttemptLength: number = 0,
): Promise<ClearSpeakSessionContent> {
  const data = await apiClient.post<{ content: ClearSpeakSessionContent }>('clearspeak/generate', { recentTopics, sessionAttemptLength }, z.any());
  return data.content;
}

export interface ScorePayload {
  audioBlob: Blob;
  content: ClearSpeakSessionContent;
  retryAttempted: boolean;
}

export interface ScoreResponse {
  score: ClearSpeakSessionScore;
  progress: ClearSpeakProgress;
  bridgeTrigger: BridgeTriggerState;
}

export class LowConfidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LowConfidenceError';
  }
}

export async function scoreSession(payload: ScorePayload): Promise<ScoreResponse> {
  const { audioBlob, content, retryAttempted } = payload;
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  form.append('content', JSON.stringify(content));
  form.append('retryAttempted', String(retryAttempted));

  try {
    return await apiClient.post<ScoreResponse>('clearspeak/score', form, z.any());
  } catch (err: any) {
    if (err.status === 422 && err.code === 'low_confidence_transcription') {
      throw new LowConfidenceError(
        err.message ?? "We couldn't clearly hear your recording. Please check your microphone and try again."
      );
    }
    throw err;
  }
}

export async function getProgress(): Promise<ClearSpeakProgress> {
  const data = await apiClient.get<{ progress: ClearSpeakProgress }>('clearspeak/progress', z.any());
  return data.progress;
}

export interface BetaFeedbackPayload {
  sessionId: string;
  scoreFair: boolean | null;
  feedbackHelpful: boolean | null;
  confidentAfterRetry: boolean | null;
}

export async function submitBetaFeedback(payload: BetaFeedbackPayload): Promise<void> {
  try {
    await apiClient.post<any>('clearspeak/beta/feedback', payload, z.any());
  } catch (err) {
    // Fire-and-forget
  }
}

export async function checkBetaAccess(): Promise<boolean> {
  try {
    const data = await apiClient.get<{ enabled: boolean }>('clearspeak/beta/access', z.any());
    return data.enabled === true;
  } catch {
    return false;
  }
}
