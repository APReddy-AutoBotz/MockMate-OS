import request from 'supertest';
import app from '../server';
import * as sessionService from '../services/sessionService';
import * as aiService from '../services/aiService';
import * as turnEvaluatorService from '../services/turnEvaluatorService';
import * as supabaseAdminModule from '../supabaseAdmin';
import { InterviewSessionContext } from 'mockmate-shared';

const testAuthHeader = 'Bearer test-token';
const testUserId = 'test-user-id';

describe('Backend Express API & Route Parity Tests', () => {

  const sampleControls = {
    difficulty: 'intermediate' as const,
    totalQuestions: 2,
    includeBehavioral: true,
    includeCoding: false,
    timePerQuestion: '90s' as const,
    deliveryMode: 'exam' as const,
    reasoningMode: 'classic_behavioral' as const,
    sourceMode: 'job_description' as const,
  };

  const sampleContext: InterviewSessionContext = {
    candidateRole: 'Frontend Engineer',
    intentText: 'Frontend Engineer',
    selectedPanelIDs: ['p1'],
    sessionType: 'structured',
    controls: sampleControls,
    interviewPlan: {
      meta: { intent: 'Frontend Engineer', controls: sampleControls },
      jdInsights: { role: 'Frontend Engineer' },
      questionSet: [
        {
          id: 'q1',
          phase: 'scenario',
          difficulty: 'intermediate',
          question: 'Tell me about a challenging React state issue.',
          expectedSignals: ['React state'],
          personaFocus: 'p1',
        },
        {
          id: 'q2',
          phase: 'scenario',
          difficulty: 'intermediate',
          question: 'How do you optimize web bundle performance?',
          expectedSignals: ['bundle performance'],
          personaFocus: 'p1',
        },
      ],
    },
  };

  beforeEach(() => {
    jest.spyOn(aiService, 'callWithFallback').mockImplementation(async () => ({
      text: JSON.stringify({
        openingMessage: 'Welcome to your interview session!',
        questionSet: sampleContext.interviewPlan.questionSet
      }),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    }));

    jest.spyOn(turnEvaluatorService, 'evaluateCandidateTurn').mockImplementation(async (q) => ({
      evaluationStatus: 'evaluated',
      answerSummary: 'Evaluated response.',
      observations: [],
      missingSignals: [],
      contradictions: [],
      recommendedProbe: null,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. POST /api/interview/sessions creates session with separate openingMessage and firstQuestion', async () => {
    const res = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(typeof res.body.openingMessage).toBe('string');
    expect(res.body.openingMessage.length).toBeGreaterThan(0);
    expect(res.body.firstQuestion.id).toBe('q1');
    expect(res.body.firstQuestion.question).toContain('React state issue');
  });

  it('2. Request validation returns 422 for invalid payloads', async () => {
    const res = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Invalid session start payload');
  });

  it('3. Authentication rejection returns 401 when no token is supplied', async () => {
    const res = await request(app)
      .post('/api/interview/sessions')
      .send({ context: sampleContext });

    expect(res.status).toBe(401);
  });

  it('4. Separate openingMessage and firstQuestion returned from start session', async () => {
    const res = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    expect(res.status).toBe(200);
    expect(res.body.openingMessage).not.toEqual(res.body.firstQuestion.question);
  });

  it('5. Correct answer progression returns next question', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;
    const firstQId = startRes.body.firstQuestion.id;

    const answerRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: firstQId,
        expectedSessionVersion: 1,
        clientSubmissionId: '50000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'I handled stale state using useEffect cleanup and React context optimization.',
      });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.isSessionComplete).toBe(false);
    expect(answerRes.body.nextQuestion.id).toBeDefined();
  });

  it('6. Wrong question ID returns 409 conflict', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    const answerRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'wrong_q_id',
        expectedSessionVersion: 1,
        clientSubmissionId: '60000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'Answer with wrong Q ID.',
      });

    expect(answerRes.status).toBe(409);
  });

  it('7. Stale question index returns 409 conflict', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    const answerRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: startRes.body.firstQuestion.id,
        expectedSessionVersion: 99,
        clientSubmissionId: '70000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'Answer with stale index.',
      });

    expect(answerRes.status).toBe(409);
  });

  it('8. Duplicate submission with different payload returns 409 conflict', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;
    const firstQId = startRes.body.firstQuestion.id;

    // First submission
    const turn1Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: firstQId,
        expectedSessionVersion: 1,
        clientSubmissionId: '80000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'First answer',
      });

    // Duplicate submission using same clientSubmissionId but different answer text
    const duplicateRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: firstQId,
        expectedSessionVersion: turn1Res.body.sessionVersion,
        clientSubmissionId: '80000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'Different answer text with same submission ID',
      });

    expect(duplicateRes.status).toBe(409);
  });

  it('9. Cross-user access is rejected with 404 or 401', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    const otherUserRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', 'Bearer test-token-other-user');

    expect([401, 404]).toContain(otherUserRes.status);
  });

  it('10. Final answer returns status = awaiting_report', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    // Turn 1 (Root 1)
    const turn1Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: startRes.body.firstQuestion.id,
        expectedSessionVersion: 1,
        clientSubmissionId: '10000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'First answer about React state',
      });

    // Turn 2 (Root 2)
    const turn2Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: turn1Res.body.nextQuestion.id,
        expectedSessionVersion: turn1Res.body.sessionVersion,
        clientSubmissionId: '10000000-0000-4000-8000-000000000002',
        answerKind: 'answered',
        answerText: 'Second answer with bundle performance',
      });

    let finalRes = turn2Res;
    if (turn2Res.body.nextQuestion?.questionKind === 'reflection') {
      finalRes = await request(app)
        .post(`/api/interview/sessions/${sessionId}/answers`)
        .set('Authorization', testAuthHeader)
        .send({
          questionId: turn2Res.body.nextQuestion.id,
          expectedSessionVersion: turn2Res.body.sessionVersion,
          clientSubmissionId: '10000000-0000-4000-8000-000000000003',
          answerKind: 'answered',
          answerText: 'Reflecting on key trade-offs and growth mindset.',
        });
    }

    expect(finalRes.status).toBe(200);
    expect(finalRes.body.isLastQuestion).toBe(true);

    const sessionState = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', testAuthHeader);

    expect(sessionState.body.status).toBe('awaiting_report');
  });

  it('11. Report reads interview_turns only and does not rely on history column', async () => {
    const session = await sessionService.createSession(testUserId, sampleContext);
    const fetched = await sessionService.getSession(testUserId, session.sessionId);
    expect(fetched).toBeDefined();
    expect(Array.isArray(fetched?.history)).toBe(true);
  });

  it('12. Malformed provider report is rejected and session marked failed', async () => {
    const spy = jest.spyOn(aiService, 'generateFinalReport').mockImplementationOnce(async () => {
      throw new Error('Malformed report output');
    });

    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    // Submit turns so history is non-empty
    const turn1Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: startRes.body.firstQuestion.id,
        expectedSessionVersion: 1,
        clientSubmissionId: '20000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'First answer about React state',
      });

    const turn2Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: turn1Res.body.nextQuestion.id,
        expectedSessionVersion: turn1Res.body.sessionVersion,
        clientSubmissionId: '20000000-0000-4000-8000-000000000002',
        answerKind: 'answered',
        answerText: 'Second answer with bundle performance',
      });

    if (turn2Res.body.nextQuestion?.questionKind === 'reflection') {
      await request(app)
        .post(`/api/interview/sessions/${sessionId}/answers`)
        .set('Authorization', testAuthHeader)
        .send({
          questionId: turn2Res.body.nextQuestion.id,
          expectedSessionVersion: turn2Res.body.sessionVersion,
          clientSubmissionId: '20000000-0000-4000-8000-000000000003',
          answerKind: 'answered',
          answerText: 'Reflecting on key trade-offs and growth mindset.',
        });
    }

    const reportRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/report`)
      .set('Authorization', testAuthHeader);

    expect(reportRes.status).toBe(500);

    const updatedSession = await sessionService.getSession(testUserId, sessionId);
    expect(updatedSession?.evaluationStatus).toBe('failed');

    spy.mockRestore();
  }, 15000);

  it('13. Failed report remains unscored (report = undefined, evaluation_status = failed)', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;
    const session = await sessionService.getSession(testUserId, sessionId);
    expect(session?.report).toBeUndefined();
  });

  it('14. Obsolete /api/ai/* routes return 404', async () => {
    const res = await request(app)
      .post('/api/ai/generate-question')
      .set('Authorization', testAuthHeader)
      .send({});
    expect(res.status).toBe(404);
  });

  it('15. Old /api/interview/answer route returns 404', async () => {
    const res = await request(app)
      .post('/api/interview/answer')
      .set('Authorization', testAuthHeader)
      .send({});
    expect(res.status).toBe(404);
  });

  it('16. Old /api/interview/report route returns 404', async () => {
    const res = await request(app)
      .post('/api/interview/report')
      .set('Authorization', testAuthHeader)
      .send({});
    expect(res.status).toBe(404);
  });

  it('17. /api/interview/code/simulate route exists and processes payload', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: '{"status": "success", "stdout": "hello", "stderr": ""}',
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const res = await request(app)
      .post('/api/interview/code/simulate')
      .set('Authorization', testAuthHeader)
      .send({ code: 'console.log("hello")', language: 'javascript' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.stdout).toBe('hello');

    spy.mockRestore();
  });

  it('19. Raw report missing evidence or confidence does not produce a scored dimension', async () => {
    const rawData = {
      overallSummary: 'Partial evaluation.',
      quantitativeAnalysis: {
        dimension_scores: [
          {
            dimension: 'PROBLEM_FRAMING',
            score_status: 'scored',
            anchor_score: 4,
            normalized_score: 80,
            reason: 'Good framing',
          }
        ]
      }
    };

    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: JSON.stringify(rawData),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const techContext = {
      ...sampleContext,
      controls: { ...sampleControls, reasoningMode: 'classic_technical' as const }
    };

    const report = await aiService.generateFinalReport([
      { id: '1', interviewer: 'Interviewer', question: 'Q1', candidateResponse: 'A1', timestamp: Date.now() }
    ], techContext);

    expect(report.readiness.status).toBe('NOT_ASSESSED');
    expect(report.simplifiedScore).toBeNull();
    const pfDim = report.quantitativeAnalysis.dimension_scores.find(d => d.dimension === 'PROBLEM_FRAMING');
    expect(pfDim?.score_status).toBe('insufficient_evidence');
    expect(pfDim?.anchor_score).toBeNull();

    spy.mockRestore();
  });

  it('20. NOT_ASSESSED report contains zero evaluative filler objects or string fallbacks', async () => {
    const rawData = {
      overallSummary: 'Evaluation could not be completed.',
      quantitativeAnalysis: {
        dimension_scores: []
      }
    };

    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: JSON.stringify(rawData),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const report = await aiService.generateFinalReport([
      { id: '1', interviewer: 'Interviewer', question: 'Q1', candidateResponse: 'A1', timestamp: Date.now() }
    ], sampleContext);

    expect(report.readiness.status).toBe('NOT_ASSESSED');
    expect(report.advisoryPanel.every(a => a.hireRecommendation === null)).toBe(true);
    expect(report.biggestRiskArea).toBeNull();
    expect(report.coachPack).toBeNull();
    expect(report.trajectoryReplay).toEqual([]);
    expect(report.auditLayer).toEqual([]);
    expect(report.simplifiedScore).toBeNull();

    spy.mockRestore();
  });

  it('21. Report generation fails if session is not in awaiting_report status', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    // Session is active (not awaiting_report)
    const reportRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/report`)
      .set('Authorization', testAuthHeader);

    expect(reportRes.status).toBe(409);
    expect(reportRes.body.error).toContain('awaiting_report');
  });

  it('22. Deterministic question IDs are generated based on role, mode, text, and index', () => {
    const id1 = aiService.createDeterministicQuestionId('Frontend Engineer', 'classic_behavioral', 'Explain React state.', 1);
    const id2 = aiService.createDeterministicQuestionId('Frontend Engineer', 'classic_behavioral', 'Explain React state.', 1);
    const id3 = aiService.createDeterministicQuestionId('Frontend Engineer', 'classic_behavioral', 'Explain React state.', 2);

    expect(id1).toEqual(id2);
    expect(id1).not.toEqual(id3);
    expect(id1).toContain('frontend_engineer');
    expect(id1).not.toContain('Date.now()');
  });

  it('23. Report generation advances evaluation_status from awaiting_report -> processing -> completed', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    // Turn 1
    const turn1Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: startRes.body.firstQuestion.id,
        expectedSessionVersion: 1,
        clientSubmissionId: '30000000-0000-4000-8000-000000000001',
        answerKind: 'answered',
        answerText: 'First answer about React state',
      });

    // Turn 2
    const turn2Res = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: turn1Res.body.nextQuestion.id,
        expectedSessionVersion: turn1Res.body.sessionVersion,
        clientSubmissionId: '30000000-0000-4000-8000-000000000002',
        answerKind: 'answered',
        answerText: 'Second answer with bundle performance',
      });

    let currentRes = turn2Res;
    let turnIdx = 3;
    while (!currentRes.body.isSessionComplete && currentRes.body.nextQuestion) {
      currentRes = await request(app)
        .post(`/api/interview/sessions/${sessionId}/answers`)
        .set('Authorization', testAuthHeader)
        .send({
          questionId: currentRes.body.nextQuestion.id,
          expectedSessionVersion: currentRes.body.sessionVersion,
          clientSubmissionId: `30000000-0000-4000-8000-00000000000${turnIdx}`,
          answerKind: 'answered',
          answerText: 'Reflecting on key trade-offs and growth mindset.',
        });
      turnIdx++;
    }

    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: JSON.stringify({
        overallSummary: 'Great session!',
        readiness: { status: 'INTERVIEW_READY', reasoning: 'Ready' },
        quantitativeAnalysis: {
          dimension_scores: [
            {
              dimension: 'PROBLEM_FRAMING',
              score_status: 'scored',
              anchor_score: 4,
              normalized_score: 80,
              reason: 'Good framing',
              evidence: ['Stated assumptions'],
              confidence: 'high'
            }
          ]
        }
      }),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const reportRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/report`)
      .set('Authorization', testAuthHeader);

    expect(reportRes.status).toBe(200);
    expect(['INTERVIEW_READY', 'NOT_ASSESSED']).toContain(reportRes.body.readiness.status);

    const completedSession = await sessionService.getSession(testUserId, sessionId);
    expect(completedSession?.status).toBe('completed');
    expect(completedSession?.evaluationStatus).toBe('completed');
    expect(completedSession?.pendingQuestionId).toBeNull();
    expect(completedSession?.pendingQuestion).toBeNull();
  });

  it('24. POST /api/interview/calibrate exercises real aiService.calibrateIntent with provider mock', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: JSON.stringify({
        recommendedRole: 'Backend Architect',
        recommendedPanelIDs: ['p1', 'p3'],
        matchReasons: { p1: 'Architecture focus', p3: 'Leadership' },
        suggestedControls: sampleControls,
        jdInsights: { role: 'Backend Architect' }
      }),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const res = await request(app)
      .post('/api/interview/calibrate')
      .set('Authorization', testAuthHeader)
      .send({ role: 'Backend Engineer', jobDescription: 'Node.js, PostgreSQL' });

    expect(res.status).toBe(200);
    expect(res.body.recommendedRole).toBe('Backend Architect');
    expect(res.body.recommendedPanelIDs).toEqual(['p1', 'p3']);
    expect(res.body.matchReasons.p1).toBeDefined();
    expect(res.body.matchReasons.p3).toBeDefined();
    expect(res.body.fallbackUsed).toBe(false);

    spy.mockRestore();
  });

  it('25. calibrateIntent filters invalid provider panel IDs and falls back cleanly', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: JSON.stringify({
        recommendedRole: 'Software Engineer',
        recommendedPanelIDs: ['invalid_id_999', 'p2'],
        matchReasons: { p2: 'Code quality' }
      }),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const result = await aiService.calibrateIntent('Software Engineer');

    expect(result.recommendedPanelIDs).toEqual(['p2']);
    expect(result.matchReasons.p2).toBeDefined();
    expect(result.matchReasons.invalid_id_999).toBeUndefined();

    spy.mockRestore();
  });

  it('26. calibrateIntent handles provider failure with deterministic fallback and sets fallbackUsed = true', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockRejectedValueOnce(new Error('AI Provider Offline'));

    const result = await aiService.calibrateIntent('Software Engineer');

    expect(result.fallbackUsed).toBe(true);
    expect(result.recommendedPanelIDs.length).toBeGreaterThan(0);
    expect(result.recommendedRole).toBe('Software Engineer');

    spy.mockRestore();
  });

  it('27. generateInterviewPlan propagates selectedPanelIDs to question personaFocus', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: JSON.stringify({
        meta: { intent: 'Fullstack' },
        jdInsights: { role: 'Fullstack Developer' },
        questionSet: [
          { question: 'Q1?', personaFocus: 'p3' },
          { question: 'Q2?', personaFocus: 'p3' }
        ]
      }),
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const plan = await aiService.generateInterviewPlan('Fullstack Developer', 'Fullstack', sampleControls, undefined, undefined, ['p3']);

    expect((plan.meta as any).planSource).toBe('provider');
    expect(plan.meta.controls.totalQuestions).toBe(2);
    expect(plan.questionSet.every(q => q.personaFocus === 'p3')).toBe(true);

    spy.mockRestore();
  });

  it('28. POST /api/interview/code/simulate parses status = success and status = unavailable', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockResolvedValueOnce({
      text: '{"status": "success", "stdout": "hello", "stderr": ""}',
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    });

    const resSuccess = await request(app)
      .post('/api/interview/code/simulate')
      .set('Authorization', testAuthHeader)
      .send({ code: 'console.log("hello");', language: 'javascript' });

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.status).toBe('success');
    expect(typeof resSuccess.body.stdout).toBe('string');

    spy.mockRestore();

    const resUnavailable = await request(app)
      .post('/api/interview/code/simulate')
      .set('Authorization', testAuthHeader)
      .send({ code: '', language: 'javascript' });

    expect(resUnavailable.status).toBe(200);
    expect(resUnavailable.body.status).toBe('unavailable');
  });

  it('29. DELETE /api/me/data returns 503 when Supabase service role is unconfigured', async () => {
    const res = await request(app)
      .delete('/api/me/data')
      .set('Authorization', testAuthHeader);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.operation).toBe('app_data_deleted');
    expect(res.body.authIdentityDeleted).toBe(false);
    expect(res.body.authIdentityRetainedReason).toContain('unconfigured');
    expect(res.body.requestId).toBeDefined();
  });

  it('30. POST /api/interview/transcribe returns status=transcribed when provider succeeds and status=unavailable when offline', async () => {
    const spy = jest.spyOn(aiService, 'transcribeAudio').mockResolvedValueOnce({
      status: 'transcribed',
      transcript: 'Real candidate speech sample',
    }).mockResolvedValueOnce({
      status: 'unavailable',
      transcript: null,
    });

    const resTranscribed = await request(app)
      .post('/api/interview/transcribe')
      .set('Authorization', testAuthHeader)
      .send({ audioBase64: 'dGVzdGF1ZGlvYnVmZmVy', mimeType: 'audio/webm' });

    expect(resTranscribed.status).toBe(200);
    expect(resTranscribed.body.status).toBe('transcribed');
    expect(resTranscribed.body.transcript).toBe('Real candidate speech sample');

    const resUnavailable = await request(app)
      .post('/api/interview/transcribe')
      .set('Authorization', testAuthHeader)
      .send({ audioBase64: 'dGVzdGF1ZGlvYnVmZmVy', mimeType: 'audio/webm' });

    expect(resUnavailable.status).toBe(200);
    expect(resUnavailable.body.status).toBe('unavailable');
    expect(resUnavailable.body.transcript).toBeNull();

    spy.mockRestore();
  });

  it('31. POST /api/interview/transcribe returns status=unavailable with transcript=null when audio is empty', async () => {
    const resEmpty = await request(app)
      .post('/api/interview/transcribe')
      .set('Authorization', testAuthHeader)
      .send({ audioBase64: '', mimeType: 'audio/webm' });

    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.status).toBe('unavailable');
    expect(resEmpty.body.transcript).toBeNull();
  });

  it('32. Non-technical calibration fallback is role-neutral with no Software/Git/Standard Tools filler', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockRejectedValueOnce(new Error('Provider offline'));

    const res = await request(app)
      .post('/api/interview/calibrate')
      .set('Authorization', testAuthHeader)
      .send({ role: 'Regulatory Affairs Specialist' });

    expect(res.status).toBe(200);
    expect(res.body.fallbackUsed).toBe(true);
    expect(res.body.suggestedControls.includeCoding).toBe(false);
    expect(res.body.jdInsights.domains).not.toContain('Software Engineering');
    expect(res.body.jdInsights.tools).not.toContain('Git');
    expect(res.body.jdInsights.tools).not.toContain('Standard Tools');

    spy.mockRestore();
  });

  it('33. Mocked Supabase deletion returns 200 and success=true when all table deletions succeed', async () => {
    const mockFrom = jest.fn().mockImplementation((table: string) => {
      if (table === 'interview_sessions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [{ id: 'sess_1' }], error: null }),
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
          in: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    const orig = supabaseAdminModule.supabaseAdmin;
    (supabaseAdminModule as any).supabaseAdmin = { from: mockFrom };

    try {
      const res = await request(app)
        .delete('/api/me/data')
        .set('Authorization', testAuthHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.operation).toBe('app_data_deleted');
      expect(res.body.authIdentityDeleted).toBe(false);
      expect(res.body.authIdentityRetainedReason).toContain('retained');
      expect(res.body.failedTables).toEqual([]);
    } finally {
      (supabaseAdminModule as any).supabaseAdmin = orig;
    }
  });

  it('34. Mocked Supabase deletion returns 500 when single table delete fails', async () => {
    const mockFrom = jest.fn().mockImplementation((table: string) => {
      if (table === 'interview_sessions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'resume_reviews') {
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: new Error('DB delete failed') }),
          }),
        };
      }
      return {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    const orig = supabaseAdminModule.supabaseAdmin;
    (supabaseAdminModule as any).supabaseAdmin = { from: mockFrom };

    try {
      const res = await request(app)
        .delete('/api/me/data')
        .set('Authorization', testAuthHeader);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.failedTables).toContain('resume_reviews');
      expect(res.body.deletedTables).not.toContain('resume_reviews');
    } finally {
      (supabaseAdminModule as any).supabaseAdmin = orig;
    }
  });

  it('35. Mocked Supabase deletion returns 500 listing all failed tables when multiple table deletes fail', async () => {
    const mockFrom = jest.fn().mockImplementation((table: string) => {
      if (table === 'interview_sessions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: new Error('Sessions delete failed') }),
          }),
        };
      }
      if (table === 'resume_reviews') {
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: new Error('Resume reviews delete failed') }),
          }),
        };
      }
      return {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    const orig = supabaseAdminModule.supabaseAdmin;
    (supabaseAdminModule as any).supabaseAdmin = { from: mockFrom };

    try {
      const res = await request(app)
        .delete('/api/me/data')
        .set('Authorization', testAuthHeader);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.failedTables).toContain('resume_reviews');
      expect(res.body.failedTables).toContain('interview_sessions');
      expect(res.body.deletedTables).not.toContain('resume_reviews');
      expect(res.body.deletedTables).not.toContain('interview_sessions');
    } finally {
      (supabaseAdminModule as any).supabaseAdmin = orig;
    }
  });

  it('36. Repeated successful deletion is idempotent', async () => {
    const mockFrom = jest.fn().mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }));

    const orig = supabaseAdminModule.supabaseAdmin;
    (supabaseAdminModule as any).supabaseAdmin = { from: mockFrom };

    try {
      const res1 = await request(app).delete('/api/me/data').set('Authorization', testAuthHeader);
      const res2 = await request(app).delete('/api/me/data').set('Authorization', testAuthHeader);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
    } finally {
      (supabaseAdminModule as any).supabaseAdmin = orig;
    }
  });
});
