import type { Request, Response, NextFunction } from 'express';

const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn(() => {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: mockMaybeSingle,
  };
  return query;
});

jest.mock('../supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: () => mockFrom(),
  },
}));

jest.mock('../config/runtimeConfig', () => ({
  runtimeMode: () => 'preview',
}));

import { completeReservedProviderWork, enforceUsageLimit } from '../services/usageService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333';

function adaptiveRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { uid: USER_ID },
    route: { path: '/sessions/:sessionId/answers' },
    params: { sessionId: SESSION_ID },
    body: {
      questionId: 'q1',
      expectedSessionVersion: 1,
      clientSubmissionId: SUBMISSION_ID,
      answerKind: 'answered',
      answerText: 'Synthetic answer',
      ...overrides,
    },
  } as any;
}

function responseHarness() {
  const callbacks: Record<string, Array<() => void>> = {};
  const res: any = {
    statusCode: 200,
    writableEnded: true,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((_payload: unknown) => res),
    once: jest.fn((event: string, callback: () => void) => {
      callbacks[event] ||= [];
      callbacks[event].push(callback);
      return res;
    }),
  };
  return {
    res: res as Response,
    fire(event: string) {
      for (const callback of callbacks[event] || []) callback();
    },
  };
}

describe('P0-8 Interview provider/quota reservation authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { session_version: 1 }, error: null });
  });

  it('refuses exhausted quota before the answer route/provider can run', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { state: 'quota_exhausted', requestHash: 'a'.repeat(32), used: 20, reserved: 0, limit: 20 },
      error: null,
    });
    const next: NextFunction = jest.fn();
    const { res } = responseHarness();

    await enforceUsageLimit('interview_question')(adaptiveRequest(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(429);
    expect((res.json as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining({
      code: 'daily_limit_reached',
      feature: 'interview_question',
      used: 20,
      limit: 20,
    }));
  });

  it.each([
    '018f9c2e-7b18-7abc-8def-0123456789ab',
    '00000000-0000-0000-0000-000000000000',
  ])('reserves provider work for every UUID accepted by the shared adaptive schema (%s)', async (clientSubmissionId) => {
    mockRpc.mockResolvedValueOnce({
      data: { state: 'reserved', requestHash: '7'.repeat(32) },
      error: null,
    });
    const next: NextFunction = jest.fn();
    const response = responseHarness();

    await enforceUsageLimit('interview_question')(
      adaptiveRequest({ clientSubmissionId }),
      response.res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('reserve_adaptive_turn_evaluation_tx', expect.objectContaining({
      p_client_submission_id: clientSubmissionId,
    }));
    response.fire('finish');
  });

  it('rejects malformed answer payloads before reservation or provider work', async () => {
    const next: NextFunction = jest.fn();
    const { res } = responseHarness();

    await enforceUsageLimit('interview_question')(
      adaptiveRequest({ clientSubmissionId: 'not-a-uuid' }),
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(422);
    expect((res.json as jest.Mock)).toHaveBeenCalledWith({
      error: 'Invalid answer submission payload',
      code: 'invalid_answer_submission',
    });
  });

  it('lets only the reservation owner reach the route while a duplicate replays canonical output', async () => {
    const canonicalResponse = {
      completedTurnId: '44444444-4444-4444-8444-444444444444',
      sessionVersion: 2,
      evaluationStatus: 'unavailable',
      nextQuestion: null,
      nextAction: 'complete_session',
      isSessionComplete: true,
      rootQuestionIndex: 4,
      rootQuestionCount: 4,
      turnIndex: 4,
      maxTurns: 8,
      stage: 'reflection',
    };

    mockRpc
      .mockResolvedValueOnce({ data: { state: 'reserved', requestHash: 'b'.repeat(32) }, error: null })
      .mockResolvedValueOnce({ data: { state: 'pending', requestHash: 'b'.repeat(32) }, error: null })
      .mockResolvedValueOnce({ data: { state: 'replay', requestHash: 'b'.repeat(32), response: canonicalResponse }, error: null });

    const firstNext: NextFunction = jest.fn();
    const firstResponse = responseHarness();
    await enforceUsageLimit('interview_question')(adaptiveRequest(), firstResponse.res, firstNext);
    expect(firstNext).toHaveBeenCalledTimes(1);

    const secondNext: NextFunction = jest.fn();
    const secondResponse = responseHarness();
    await enforceUsageLimit('interview_question')(adaptiveRequest(), secondResponse.res, secondNext);

    expect(secondNext).not.toHaveBeenCalled();
    expect((secondResponse.res.json as jest.Mock)).toHaveBeenCalledWith(canonicalResponse);
    firstResponse.fire('finish');
  });

  it('fails stale authority before the route/provider can run', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Stale or mismatched question submission' },
    });
    const next: NextFunction = jest.fn();
    const { res } = responseHarness();

    await enforceUsageLimit('interview_question')(adaptiveRequest(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res.status as jest.Mock)).toHaveBeenCalledWith(409);
  });

  it('stops renewal and releases failed provider work after an early disconnect', async () => {
    jest.useFakeTimers();
    try {
      mockRpc
        .mockResolvedValueOnce({
          data: { state: 'reserved', requestHash: 'd'.repeat(32) },
          error: null,
        })
        .mockResolvedValue({ data: { renewed: true }, error: null });

      const req = adaptiveRequest() as any;
      const response = responseHarness();
      (response.res as any).writableEnded = false;
      const next: NextFunction = jest.fn();

      await enforceUsageLimit('interview_question')(req, response.res, next);
      expect(next).toHaveBeenCalledTimes(1);

      response.fire('close');
      await jest.advanceTimersByTimeAsync(20_001);
      expect(mockRpc.mock.calls.filter(([name]) => name === 'renew_adaptive_turn_evaluation_tx')).toHaveLength(1);

      (response.res as any).statusCode = 500;
      await completeReservedProviderWork(req);
      const renewalsAfterCompletion = mockRpc.mock.calls.filter(([name]) => name === 'renew_adaptive_turn_evaluation_tx').length;

      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockRpc.mock.calls.filter(([name]) => name === 'renew_adaptive_turn_evaluation_tx')).toHaveLength(renewalsAfterCompletion);
      expect(mockRpc.mock.calls.filter(([name]) => name === 'release_adaptive_turn_evaluation_tx')).toHaveLength(1);

      await completeReservedProviderWork(req);
      expect(mockRpc.mock.calls.filter(([name]) => name === 'release_adaptive_turn_evaluation_tx')).toHaveLength(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('finalizes the reservation from the answer route even when response events cannot fire', () => {
    const fs = require('fs');
    const path = require('path');
    const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/interviewRoutes.ts'), 'utf8');
    expect(routeSource).toMatch(/finally\s*{[\s\S]*await completeReservedProviderWork\(req\);[\s\S]*}/);
  });

  it('reserves legacy-v1 provider work using the current session version and canonical legacy marker', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { session_version: 7 }, error: null });
    mockRpc.mockResolvedValueOnce({
      data: { state: 'reserved', requestHash: 'c'.repeat(32) },
      error: null,
    });

    const req = {
      user: { uid: USER_ID },
      route: { path: '/sessions/:sessionId/answers' },
      params: { sessionId: SESSION_ID },
      body: {
        questionId: 'legacy-q',
        expectedQuestionIndex: 3,
        answerKind: 'answered',
        answerText: 'Legacy synthetic answer',
      },
    } as any;
    const next: NextFunction = jest.fn();
    const response = responseHarness();

    await enforceUsageLimit('interview_question')(req, response.res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('reserve_adaptive_turn_evaluation_tx', expect.objectContaining({
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
      p_client_submission_id: 'legacy',
      p_question_id: 'legacy-q',
      p_expected_session_version: 7,
      p_answer_kind: 'answered',
      p_answer_text: 'Legacy synthetic answer',
    }));

    response.fire('finish');
  });

  it('keeps the SQL reservation table server-only and requires it before atomic quota/business mutation', () => {
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260823070000_p0_8_interview_provider_reservation_authority.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.interview_answer_evaluation_reservations/);
    expect(sql).toMatch(/ALTER TABLE public\.interview_answer_evaluation_reservations ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.interview_answer_evaluation_reservations FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/reserve_adaptive_turn_evaluation_tx/);
    expect(sql).toMatch(/renew_adaptive_turn_evaluation_tx/);
    expect(sql).toMatch(/release_adaptive_turn_evaluation_tx/);
    expect(sql).toMatch(/v\.used \+ v_reserved >= p_limit/);
    expect(sql).toMatch(/Adaptive evaluation reservation missing or expired/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.atomic_submit_adaptive_turn/);

    const atomic = sql.slice(sql.lastIndexOf('CREATE FUNCTION public.atomic_submit_adaptive_turn'));
    const replayIndex = atomic.indexOf('WHERE session_id = p_session_id AND client_submission_id = v_submission_id');
    const reservationIndex = atomic.indexOf('FROM public.interview_answer_evaluation_reservations');
    const quotaIndex = atomic.indexOf("consume_daily_usage_tx(p_user_id, 'interview_question', 20)");
    expect(replayIndex).toBeGreaterThan(-1);
    expect(reservationIndex).toBeGreaterThan(replayIndex);
    expect(quotaIndex).toBeGreaterThan(reservationIndex);
  });
});
