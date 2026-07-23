import { z } from 'zod';
/**
 * services/csAnalytics.ts
 * Mockmate ClearSpeak — lightweight beta instrumentation.
 */

import { apiClient, getAuthToken } from './apiClient';
import { API_BASE } from './apiBase';

export function newSessionId(): string {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE}/clearspeak/beta/event`, blob);
    } else {
      const VoidSchema = z.object({}).passthrough();
      await apiClient.post('clearspeak/beta/event', VoidSchema, payload, { keepalive: true } as any);
    }
  } catch {
    // Analytics loss is acceptable.
  }
}
