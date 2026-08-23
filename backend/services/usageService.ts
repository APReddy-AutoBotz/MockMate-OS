import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabaseAdmin';
import { runtimeMode } from '../config/runtimeConfig';

export const USAGE_LIMITS = {
  resume_review: 3,
  resume_suggestion: 10,
  interview_question: 20,
  clearspeak_session: 5,
} as const;

export type UsageFeature = keyof typeof USAGE_LIMITS;

const friendlyLimitMessage = "You have used today's free practice. Come back tomorrow or continue with saved work.";
const memoryUsage = new Map<string, { used: number; limit: number }>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVATION_RENEW_MS = 20_000;
const RESERVATION_MAX_RENEW_MS = 120_000;
const RESERVATION_WAIT_MS = 25_000;
const RESERVATION_POLL_BASE_MS = process.env.NODE_ENV === 'test' ? 1 : 125;

type AdaptiveReservationInput = {
  userId: string;
  sessionId: string;
  clientSubmissionId: string;
  questionId: string;
  expectedSessionVersion: number;
  answerKind: 'answered' | 'skipped';
  answerText: string;
};

type AdaptiveReservationResult =
  | { state: 'reserved' | 'pending'; requestHash: string; leaseExpiresAt?: string }
  | { state: 'quota_exhausted'; requestHash: string; used?: number; reserved?: number; limit?: number }
  | { state: 'replay'; requestHash: string; response: unknown };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function memoryKey(userId: string, feature: UsageFeature): string {
  return `${userId}:${todayISO()}:${feature}`;
}

function adaptiveAnswerText(answerKind: 'answered' | 'skipped', answerText: unknown): string {
  return answerKind === 'skipped' ? '[Question Skipped]' : (typeof answerText === 'string' ? answerText : '');
}

async function legacyExpectedSessionVersion(userId: string, sessionId: string): Promise<number> {
  if (!supabaseAdmin) throw new Error('USAGE_AUTHORITY_UNAVAILABLE');
  const { data, error } = await supabaseAdmin
    .from('interview_sessions')
    .select('session_version')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !Number.isInteger(data.session_version) || data.session_version < 1) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  return Number(data.session_version);
}

async function reservationInput(req: Request, userId: string): Promise<AdaptiveReservationInput | null> {
  if (!supabaseAdmin || req.route?.path !== '/sessions/:sessionId/answers') return null;
  const sessionId = String((req as any).params?.sessionId || '');
  const body: any = (req as any).body || {};
  if (!UUID_PATTERN.test(sessionId)) return null;
  if (typeof body.questionId !== 'string' || !body.questionId.trim()) return null;
  if (!['answered', 'skipped'].includes(body.answerKind)) return null;
  if (body.answerKind === 'answered' && (typeof body.answerText !== 'string' || !body.answerText.trim())) return null;
  if (body.answerKind === 'skipped' && body.answerText != null && (typeof body.answerText !== 'string' || body.answerText.trim())) return null;

  const isAdaptive = body.clientSubmissionId !== undefined || body.expectedSessionVersion !== undefined;
  if (isAdaptive) {
    if (!UUID_PATTERN.test(String(body.clientSubmissionId || ''))) return null;
    if (!Number.isInteger(body.expectedSessionVersion) || body.expectedSessionVersion < 1) return null;
    return {
      userId,
      sessionId,
      clientSubmissionId: body.clientSubmissionId,
      questionId: body.questionId,
      expectedSessionVersion: body.expectedSessionVersion,
      answerKind: body.answerKind,
      answerText: adaptiveAnswerText(body.answerKind, body.answerText),
    };
  }

  if (!Number.isInteger(body.expectedQuestionIndex) || body.expectedQuestionIndex < 0) return null;
  return {
    userId,
    sessionId,
    clientSubmissionId: 'legacy',
    questionId: body.questionId,
    expectedSessionVersion: await legacyExpectedSessionVersion(userId, sessionId),
    answerKind: body.answerKind,
    answerText: adaptiveAnswerText(body.answerKind, body.answerText),
  };
}

function reservationRpcArgs(input: AdaptiveReservationInput) {
  return {
    p_session_id: input.sessionId,
    p_user_id: input.userId,
    p_client_submission_id: input.clientSubmissionId,
    p_question_id: input.questionId,
    p_expected_session_version: input.expectedSessionVersion,
    p_answer_kind: input.answerKind,
    p_answer_text: input.answerText,
    p_limit: USAGE_LIMITS.interview_question,
  };
}

async function reserveAdaptiveProviderWork(input: AdaptiveReservationInput): Promise<AdaptiveReservationResult> {
  if (!supabaseAdmin) throw new Error('USAGE_AUTHORITY_UNAVAILABLE');
  const { data, error } = await supabaseAdmin.rpc('reserve_adaptive_turn_evaluation_tx', reservationRpcArgs(input));
  if (error || !data) {
    const message = error?.message || 'USAGE_AUTHORITY_UNAVAILABLE';
    const err: any = new Error(message);
    if (message.includes('Stale or mismatched') || message.includes('Idempotency conflict') || message.includes('already reserved') || message.includes('Session is not active')) {
      err.status = 409;
    } else if (message.includes('Session not found')) {
      err.status = 404;
    } else {
      err.status = 503;
    }
    throw err;
  }
  return data as AdaptiveReservationResult;
}

async function releaseAdaptiveProviderWork(input: AdaptiveReservationInput, requestHash: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.rpc('release_adaptive_turn_evaluation_tx', {
      p_session_id: input.sessionId,
      p_user_id: input.userId,
      p_client_submission_id: input.clientSubmissionId,
      p_request_hash: requestHash,
    });
  } catch {
    console.warn('[Usage] failed to release adaptive evaluation reservation');
  }
}

function attachReservationLease(res: Response, input: AdaptiveReservationInput, requestHash: string): void {
  if (!supabaseAdmin) return;
  let stopped = false;
  let renewing = false;

  const renew = async () => {
    if (stopped || renewing || !supabaseAdmin) return;
    renewing = true;
    try {
      const { data, error } = await supabaseAdmin.rpc('renew_adaptive_turn_evaluation_tx', {
        p_session_id: input.sessionId,
        p_user_id: input.userId,
        p_client_submission_id: input.clientSubmissionId,
        p_request_hash: requestHash,
      });
      if (error || !data?.renewed) console.warn('[Usage] adaptive evaluation reservation lease renewal was not confirmed');
    } catch {
      console.warn('[Usage] adaptive evaluation reservation lease renewal failed');
    } finally {
      renewing = false;
    }
  };

  const renewTimer = setInterval(() => { void renew(); }, RESERVATION_RENEW_MS);
  renewTimer.unref?.();
  const maxTimer = setTimeout(() => {
    stopped = true;
    clearInterval(renewTimer);
  }, RESERVATION_MAX_RENEW_MS);
  maxTimer.unref?.();

  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(renewTimer);
    clearTimeout(maxTimer);
    if (res.statusCode >= 400) void releaseAdaptiveProviderWork(input, requestHash);
  };
  res.once('finish', finish);
  res.once('close', () => {
    // Do not release on an early client disconnect: provider work may still be
    // running. The bounded renewable lease owns crash/disconnect recovery.
    if (res.writableEnded) finish();
  });
}

async function waitForAdaptiveProviderOwner(input: AdaptiveReservationInput, first: AdaptiveReservationResult): Promise<AdaptiveReservationResult> {
  let result = first;
  let delay = RESERVATION_POLL_BASE_MS;
  const deadline = Date.now() + RESERVATION_WAIT_MS;
  while (result.state === 'pending' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await reserveAdaptiveProviderWork(input);
    delay = Math.min(Math.ceil(delay * 1.6), process.env.NODE_ENV === 'test' ? 2 : 750);
  }
  return result;
}

export async function consumeUsage(userId: string, feature: UsageFeature): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = USAGE_LIMITS[feature];
  const usageDate = todayISO();

  const mode = runtimeMode();
  if (mode === 'test') return { allowed: true, used: 1, limit };

  if (!supabaseAdmin) {
    if (mode !== 'development') throw new Error('USAGE_AUTHORITY_UNAVAILABLE');
    const key = memoryKey(userId, feature);
    const current = memoryUsage.get(key) || { used: 0, limit };
    if (current.used >= limit) return { allowed: false, used: current.used, limit };
    const next = { used: current.used + 1, limit };
    memoryUsage.set(key, next);
    return { allowed: true, ...next };
  }

  const { data, error } = await supabaseAdmin.rpc('consume_daily_usage_tx', {
    p_user_id: userId, p_feature: feature, p_limit: limit,
  });
  if (error || !data) throw error || new Error('USAGE_AUTHORITY_UNAVAILABLE');
  return { allowed: Boolean(data.allowed), used: Number(data.used), limit: Number(data.limit) };
}

export function enforceUsageLimit(feature: UsageFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (feature === 'interview_question' && supabaseAdmin && req.route?.path === '/sessions/:sessionId/answers') {
        const input = await reservationInput(req, userId);
        if (!input) {
          // The route schema rejects malformed answer bodies before provider work.
          (req as any).usage = { feature, authority: 'atomic_adaptive_turn_unreserved_invalid_body' };
          return next();
        }

        let reservation = await reserveAdaptiveProviderWork(input);
        if (reservation.state === 'pending') reservation = await waitForAdaptiveProviderOwner(input, reservation);

        if (reservation.state === 'replay') return res.json(reservation.response);
        if (reservation.state === 'quota_exhausted') {
          return res.status(429).json({
            error: friendlyLimitMessage,
            code: 'daily_limit_reached',
            feature,
            used: Number(reservation.used ?? 0),
            limit: Number(reservation.limit ?? USAGE_LIMITS.interview_question),
          });
        }
        if (reservation.state === 'pending') {
          return res.status(409).json({
            error: 'This answer is already being evaluated. Retry the same submission shortly.',
            code: 'answer_evaluation_in_progress',
          });
        }

        (req as any).usage = {
          feature,
          authority: 'atomic_adaptive_turn',
          reservationRequestHash: reservation.requestHash,
        };
        attachReservationLease(res, input, reservation.requestHash);
        return next();
      }

      const result = await consumeUsage(userId, feature);
      if (!result.allowed) {
        return res.status(429).json({
          error: friendlyLimitMessage,
          code: 'daily_limit_reached',
          feature,
          used: result.used,
          limit: result.limit,
        });
      }
      (req as any).usage = { feature, used: result.used, limit: result.limit };
      next();
    } catch (err: any) {
      console.error('[Usage] limit/provider reservation check failed:', err);
      if (err.status === 409) return res.status(409).json({ error: err.message, code: 'answer_authority_conflict' });
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 503) return res.status(503).json({ error: 'Answer evaluation authority unavailable' });
      res.status(500).json({ error: 'Could not check free practice usage' });
    }
  };
}

export async function getUsageSummary(userId: string) {
  const usageDate = todayISO();
  const defaults: Record<string, { used: number; limit: number }> = Object.fromEntries(
    Object.entries(USAGE_LIMITS).map(([feature, limit]) => [feature, { used: 0, limit }]),
  );

  if (!supabaseAdmin) {
    if (runtimeMode() !== 'development') throw new Error('USAGE_AUTHORITY_UNAVAILABLE');
    for (const feature of Object.keys(USAGE_LIMITS) as UsageFeature[]) {
      const value = memoryUsage.get(memoryKey(userId, feature));
      if (value) defaults[feature] = value;
    }
    return { date: usageDate, usage: defaults };
  }

  const { data, error } = await supabaseAdmin
    .from('usage_ledger')
    .select('feature, used, limit_value')
    .eq('user_id', userId)
    .eq('usage_date', usageDate);

  if (error) throw error;
  for (const row of data || []) {
    defaults[row.feature] = { used: row.used || 0, limit: row.limit_value || USAGE_LIMITS[row.feature as UsageFeature] || 0 };
  }
  return { date: usageDate, usage: defaults };
}
