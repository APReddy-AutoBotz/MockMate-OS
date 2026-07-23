import { z } from 'zod';
/**
 * services/clearSpeakService.ts
 * Mockmate ClearSpeak frontend API client.
 */
import { apiClient, ApiError } from './apiClient';
import {
  ClearSpeakProfile,
  ClearSpeakProfileSchema,
  ClearSpeakSessionContent,
  ClearSpeakSessionContentSchema,
  ClearSpeakSessionScore,
  ClearSpeakSessionScoreSchema,
  ClearSpeakProgress,
  ClearSpeakProgressSchema,
  BridgeTriggerState,
  BridgeTriggerStateSchema,
} from 'mockmate-shared';

const ProfileWrapperSchema = z.object({ profile: ClearSpeakProfileSchema }).strict();
const ContentWrapperSchema = z.object({ content: ClearSpeakSessionContentSchema }).strict();
const ProgressWrapperSchema = z.object({ progress: ClearSpeakProgressSchema }).strict();

export const ScoreResponseSchema = z.object({
  score: ClearSpeakSessionScoreSchema,
  progress: ClearSpeakProgressSchema,
  bridgeTrigger: BridgeTriggerStateSchema,
}).strict();
export type ScoreResponse = z.infer<typeof ScoreResponseSchema>;

export async function saveProfile(
  profile: Omit<ClearSpeakProfile, 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<ClearSpeakProfile> {
  const data = await apiClient.post('clearspeak/profile', ProfileWrapperSchema, profile);
  return data.profile;
}

export async function getProfile(): Promise<ClearSpeakProfile | null> {
  try {
    const data = await apiClient.get('clearspeak/profile', ProfileWrapperSchema);
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
  const data = await apiClient.post('clearspeak/generate', ContentWrapperSchema, { recentTopics, sessionAttemptLength });
  return data.content;
}

export interface ScorePayload {
  audioBlob: Blob;
  content: ClearSpeakSessionContent;
  retryAttempted: boolean;
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
    return await apiClient.post('clearspeak/score', ScoreResponseSchema, form);
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
  const data = await apiClient.get('clearspeak/progress', ProgressWrapperSchema);
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
    const VoidResponseSchema = z.object({}).passthrough();
    await apiClient.post('clearspeak/beta/feedback', VoidResponseSchema, payload);
  } catch (err) {
    // Fire-and-forget
  }
}

export async function checkBetaAccess(): Promise<boolean> {
  try {
    const BetaAccessSchema = z.object({ enabled: z.boolean() }).strict();
    const data = await apiClient.get('clearspeak/beta/access', BetaAccessSchema);
    return data.enabled === true;
  } catch {
    return false;
  }
}
