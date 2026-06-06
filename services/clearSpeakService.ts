/**
 * services/clearSpeakService.ts
 * Mockmate ClearSpeak — frontend API client.
 *
 * Calls the /api/clearspeak/* backend routes.
 * Auth token is read from Supabase via the shared auth pattern.
 */

import { auth } from './supabaseClient';
import { API_ORIGIN } from './apiBase';
import type {
  ClearSpeakProfile,
  ClearSpeakSessionContent,
  ClearSpeakSessionScore,
  ClearSpeakProgress,
  BridgeTriggerState,
} from '../components/clearspeak/types';

const BASE = API_ORIGIN;

async function authHeaders(): Promise<HeadersInit> {
  let token: string | undefined;
  if (auth.currentUser) {
    if (typeof auth.currentUser.getIdToken === 'function') {
      token = await auth.currentUser.getIdToken();
    } else {
      token = 'test-token';
    }
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json() as Promise<T>;
}

// ─── Profile ───────────────────────────────────────────────────────────────────

export async function saveProfile(
  profile: Omit<ClearSpeakProfile, 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<ClearSpeakProfile> {
  const res = await fetch(`${BASE}/api/clearspeak/profile`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(profile),
  });
  const data = await handleResponse<{ profile: ClearSpeakProfile }>(res);
  return data.profile;
}

export async function getProfile(): Promise<ClearSpeakProfile | null> {
  const res = await fetch(`${BASE}/api/clearspeak/profile`, {
    headers: await authHeaders(),
  });
  if (res.status === 404) return null;
  const data = await handleResponse<{ profile: ClearSpeakProfile }>(res);
  return data.profile;
}

// ─── Generate Session Content ──────────────────────────────────────────────────

export async function generateSession(
  recentTopics: string[] = [],
  sessionAttemptLength: number = 0,
): Promise<ClearSpeakSessionContent> {
  const res = await fetch(`${BASE}/api/clearspeak/generate`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ recentTopics, sessionAttemptLength }),
  });
  const data = await handleResponse<{ content: ClearSpeakSessionContent }>(res);
  return data.content;
}

// ─── Score Session ─────────────────────────────────────────────────────────────

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

/** Thrown when the backend returns 422 low_confidence_transcription. */
export class LowConfidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LowConfidenceError';
  }
}

export async function scoreSession(payload: ScorePayload): Promise<ScoreResponse> {
  const { audioBlob, content, retryAttempted } = payload;

  // Build multipart form — audio as binary, content as JSON string field.
  // Do NOT set Content-Type header manually; let the browser set the boundary.
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  form.append('content', JSON.stringify(content));
  form.append('retryAttempted', String(retryAttempted));

  let token: string | undefined;
  if (auth.currentUser) {
    if (typeof auth.currentUser.getIdToken === 'function') {
      token = await auth.currentUser.getIdToken();
    } else {
      token = 'test-token';
    }
  }
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${BASE}/api/clearspeak/score`, {
    method: 'POST',
    headers,
    body: form,
  });

  // 422 = low-confidence transcription (inaudible audio, mic failure, etc.)
  // Throw a typed error so the caller can surface a targeted UI message.
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'low_confidence_transcription') {
      throw new LowConfidenceError(
        body.message ?? "We couldn't clearly hear your recording. Please check your microphone and try again.",
      );
    }
  }

  return handleResponse<ScoreResponse>(res);
}

// ─── Progress ──────────────────────────────────────────────────────────────────

export async function getProgress(): Promise<ClearSpeakProgress> {
  const res = await fetch(`${BASE}/api/clearspeak/progress`, {
    headers: await authHeaders(),
  });
  const data = await handleResponse<{ progress: ClearSpeakProgress }>(res);
  return data.progress;
}

// ─── Beta: Feedback Submission ─────────────────────────────────────────────────

export interface BetaFeedbackPayload {
  sessionId: string;
  scoreFair: boolean | null;
  feedbackHelpful: boolean | null;
  confidentAfterRetry: boolean | null;
}

/**
 * Submits beta tester feedback after session completion.
 * Fire-and-forget — callers should not await and should swallow errors.
 */
export async function submitBetaFeedback(payload: BetaFeedbackPayload): Promise<void> {
  const res = await fetch(`${BASE}/api/clearspeak/beta/feedback`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  await handleResponse<{ ok: boolean }>(res);
}

// ─── Beta: Access Check ────────────────────────────────────────────────────────

/**
 * Returns true if the current user is in the beta tester allowlist.
 * Returns false on any network/auth error — fail-closed (beta hidden on error).
 *
 * Beta access is controlled by profiles.clearspeak_beta_enabled in Supabase.
 */
export async function checkBetaAccess(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/clearspeak/beta/access`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({ enabled: false }));
    return data.enabled === true;
  } catch {
    return false;
  }
}

