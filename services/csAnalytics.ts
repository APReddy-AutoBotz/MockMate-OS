import { z } from 'zod';
/**
 * services/csAnalytics.ts
 * Mockmate ClearSpeak — lightweight beta instrumentation.
 *
 * DESIGN RULES:
 *   - Fire-and-forget. NEVER block the session flow.
 *   - No external analytics SDK dependency (no Mixpanel, no Segment, no GA).
 *   - Events are sent to /api/clearspeak/beta/event with the user's auth token.
 *   - Failed events are silently dropped — analytics loss is acceptable.
 *   - All events carry a common envelope: { event, userId?, sessionId, timestamp, properties }.
 *   - sessionId is a per-session UUID generated client-side (not stored server-side as PII).
 *
 * SCOPE FREEZE (Beta):
 *   Only the 8 events below are instrumented for beta. No new events should be added
 *   without a product decision. See implementation_plan.md §deferred.
 *
 * Beta events:
 *   session_started         — content loaded, vocab warmup begins
 *   session_completed       — session reached 'complete' phase
 *   retry_used              — user tapped "Let's Fix That Sentence"
 *   low_confidence_error    — 422 or frontend composite≤15 guard triggered
 *   bridge_triggered        — bridge prompt surface to user
 *   bridge_entered          — user accepted bridge ("Take the Challenge")
 *   fallback_content_used   — content came from FALLBACK_CONTENT, not Gemini
 *   score_feedback_viewed   — score card rendered (user reached this screen)
 */

import { apiClient, getAuthToken } from './apiClient';
import { API_BASE } from './apiBase';

// ─── Session ID ───────────────────────────────────────────────────────────────
// Scoped to the browser tab. Not persisted. Used only to correlate events within one session.

export function newSessionId(): string {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Event Catalogue ──────────────────────────────────────────────────────────

export type CsEvent =
  | 'session_started'
  | 'session_completed'
  | 'retry_used'
  | 'low_confidence_error'
  | 'bridge_triggered'
  | 'bridge_entered'
  | 'fallback_content_used'
  | 'score_feedback_viewed';

export interface CsEventProperties {
  topicTag?: string;
  difficultyLevel?: number;
  isFallback?: boolean;
  composite?: number;
  clarity?: number;
  pacing?: number;
  rhythm?: number;
  retryUsed?: boolean;
  bridgeAccepted?: boolean;
  firstComposite?: number;
  errorSource?: 'route_422' | 'frontend_guard';
  role?: string;
  feedbackTipKey?: string;
  fallbackTopic?: string;
}

// ─── Fire-and-Forget Emitter ──────────────────────────────────────────────────

/**
 * Emits a beta analytics event. Never throws. Never awaited by callers.
 * Drops the event silently on network error or auth failure.
 */
export async function csTrack(
  event: CsEvent,
  sessionId: string,
  properties: CsEventProperties = {},
): Promise<void> {
  try {
    const payload = {
      event,
      sessionId,
      timestamp: new Date().toISOString(),
      properties,
    };

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const token = await getAuthToken().catch(() => undefined);
      // sendBeacon doesn't easily support custom Authorization headers, but we can append token to URL if supported,
      // or just accept we might lose beta events if beacon is used without cookie auth.
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/clearspeak/beta/event`, blob);
    } else {
      await apiClient.post('clearspeak/beta/event', payload, { keepalive: true });
    }
  } catch {
    // Analytics loss is acceptable.
  }
}
