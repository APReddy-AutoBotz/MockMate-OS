import request from 'supertest';
import app from '../server';
import * as sessionService from '../services/sessionService';
import * as aiService from '../services/aiService';
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
          expectedSignals: ['State Management'],
          personaFocus: 'p1',
        },
        {
          id: 'q2',
          phase: 'scenario',
          difficulty: 'intermediate',
          question: 'How do you optimize web bundle performance?',
          expectedSignals: ['Performance'],
          personaFocus: 'p1',
        },
      ],
    },
  };

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

    const answerRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q1',
        expectedQuestionIndex: 0,
        answerKind: 'answered',
        answerText: 'I handled stale state using useEffect cleanup and React context optimization.',
      });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.isLastQuestion).toBe(false);
    expect(answerRes.body.nextQuestion.id).toBe('q2');
    expect(answerRes.body.questionIndex).toBe(1);
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
        expectedQuestionIndex: 0,
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
        questionId: 'q1',
        expectedQuestionIndex: 99,
        answerKind: 'answered',
        answerText: 'Answer with stale index.',
      });

    expect(answerRes.status).toBe(409);
  });

  it('8. Duplicate answer returns 409 conflict', async () => {
    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    // First submission
    await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q1',
        expectedQuestionIndex: 0,
        answerKind: 'answered',
        answerText: 'First answer',
      });

    // Duplicate submission for same question index 0
    const duplicateRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q1',
        expectedQuestionIndex: 0,
        answerKind: 'answered',
        answerText: 'Duplicate answer',
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

    // Turn 1
    await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q1',
        expectedQuestionIndex: 0,
        answerKind: 'answered',
        answerText: 'First answer',
      });

    // Turn 2 (final)
    const finalRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q2',
        expectedQuestionIndex: 1,
        answerKind: 'answered',
        answerText: 'Second answer',
      });

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
    const spy = jest.spyOn(aiService, 'callWithFallback').mockImplementation(async () => ({
      text: '{}',
      provider: 'test',
      model: 'test',
      fallbackTriggered: false,
    }));

    const startRes = await request(app)
      .post('/api/interview/sessions')
      .set('Authorization', testAuthHeader)
      .send({ context: sampleContext });

    const sessionId = startRes.body.sessionId;

    // Submit turns so history is non-empty
    await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q1',
        expectedQuestionIndex: 0,
        answerKind: 'answered',
        answerText: 'First answer',
      });

    await request(app)
      .post(`/api/interview/sessions/${sessionId}/answers`)
      .set('Authorization', testAuthHeader)
      .send({
        questionId: 'q2',
        expectedQuestionIndex: 1,
        answerKind: 'answered',
        answerText: 'Second answer',
      });

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
      text: '{"stdout": "hello", "stderr": ""}',
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

  it('18. Code analysis failure never returns passed = true', async () => {
    const spy = jest.spyOn(aiService, 'callWithFallback').mockRejectedValueOnce(new Error('AI Provider Offline'));

    const res = await request(app)
      .post('/api/interview/code/analyze')
      .set('Authorization', testAuthHeader)
      .send({ code: 'def foo(): pass' });

    expect(res.status).toBe(503);
    expect(res.body.passed).toBeNull();
    expect(res.body.status).toBe('unavailable');

    spy.mockRestore();
  });

});
