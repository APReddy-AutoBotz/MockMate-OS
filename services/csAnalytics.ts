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

import { auth } from './supabaseClient';
import { API_ORIGIN } from './apiBase';

const BASE = API_ORIGIN;

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
  // session_started
  topicTag?: string;
  difficultyLevel?: number;
  isFallback?: boolean;
  // session_completed
  composite?: number;
  clarity?: number;
  pacing?: number;
  rhythm?: number;
  retryUsed?: boolean;
  bridgeAccepted?: boolean;
  // retry_used
  firstComposite?: number;
  // low_confidence_error
  errorSource?: 'route_422' | 'frontend_guard';
  // bridge_triggered / bridge_entered
  role?: string;
  // score_feedback_viewed
  feedbackTipKey?: string;
  // fallback_content_used
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
    const token = await auth.currentUser?.getIdToken().catch(() => undefined);
    const body = JSON.stringify({
      event,
      sessionId,
      timestamp: new Date().toISOString(),
      properties,
    });

    // Use sendBeacon if available (survives page unload); fallback to fetch
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${BASE}/api/clearspeak/beta/event`, blob);
    } else {
      await fetch(`${BASE}/api/clearspeak/beta/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        // keepalive allows the request to outlive the page
        keepalive: true,
      });
    }
  } catch {
    // Analytics loss is acceptable. Never surface to user.
  }
}
