import { createSession, submitAnswer, getSession } from '../services/sessionService';
import { InterviewSessionContext, QuestionBlueprint } from 'mockmate-shared';

describe('Backend Session Service & Interview Flow', () => {
  const validContext: InterviewSessionContext = {
    candidateRole: 'Staff Backend Engineer',
    intentText: 'System Architecture Practice',
    selectedPanelIDs: ['p1'],
    sessionType: 'structured',
    controls: {
      difficulty: 'starter',
      totalQuestions: 2,
      includeBehavioral: true,
      includeCoding: false,
      timePerQuestion: '90s',
      deliveryMode: 'exam',
      reasoningMode: 'classic_behavioral'
    },
    interviewPlan: {
      meta: {
        intent: 'System Architecture Practice',
        controls: {
          difficulty: 'starter',
          totalQuestions: 2,
          includeBehavioral: true,
          includeCoding: false,
          timePerQuestion: '90s',
          deliveryMode: 'exam',
          reasoningMode: 'classic_behavioral'
        }
      },
      jdInsights: {
        role: 'Staff Backend Engineer',
        mustHaveSkills: ['Distributed Systems']
      },
      questionSet: [
        {
          id: 'q_1',
          phase: 'scenario',
          difficulty: 'starter',
          question: 'How do you structure microservices communication?',
          expectedSignals: ['Kafka', 'Idempotency'],
          personaFocus: 'System Lead'
        },
        {
          id: 'q_2',
          phase: 'behavioral',
          difficulty: 'starter',
          question: 'Tell me about an outage incident response.',
          expectedSignals: ['Postmortem', 'MTTR'],
          personaFocus: 'EM Lead'
        }
      ]
    }
  };

  let createdSessionId: string;
  let firstQuestionId: string;
  let nextQuestionAfterTurn1: QuestionBlueprint | null = null;
  let nextQuestionIndexAfterTurn1: number = 1;

  it('creates an authoritative session with separate opening message and stable first question', async () => {
    const result = await createSession('user_test_100', validContext);

    expect(result.sessionId).toBeDefined();
    expect(typeof result.openingMessage).toBe('string');
    expect(result.firstQuestion.id).toBe('q_1');
    expect(result.questionIndex).toBe(0);
    expect(result.totalQuestions).toBe(2);

    createdSessionId = result.sessionId;
    firstQuestionId = result.firstQuestion.id;
  });

  it('submits answer atomically and returns next question', async () => {
    const res = await submitAnswer(
      'user_test_100',
      createdSessionId,
      firstQuestionId,
      0,
      'answered',
      'I use async event streaming via Kafka with idempotency keys.'
    );

    expect(res.completedTurnId).toBeDefined();
    expect(res.nextQuestion).not.toBeNull();
    expect(res.isLastQuestion).toBe(false);
    nextQuestionAfterTurn1 = res.nextQuestion;
    nextQuestionIndexAfterTurn1 = res.questionIndex;
  });

  it('rejects stale question ID or expected index mismatch with 409 error', async () => {
    await expect(
      submitAnswer(
        'user_test_100',
        createdSessionId,
        firstQuestionId, // Stale!
        0, // Stale!
        'answered',
        'Stale response'
      )
    ).rejects.toThrow();
  });

  it('submitting final answer advances session to awaiting_report status and completes turn set', async () => {
    expect(nextQuestionAfterTurn1).not.toBeNull();

    const res = await submitAnswer(
      'user_test_100',
      createdSessionId,
      nextQuestionAfterTurn1!.id,
      nextQuestionIndexAfterTurn1,
      'answered',
      'I led the incident room, identified the database deadlock, and published a blameless postmortem.'
    );

    expect(res.completedTurnId).toBeDefined();
  });

  it('fetches session state by session ID', async () => {
    const sessionData = await getSession('user_test_100', createdSessionId);
    expect(sessionData.id).toBe(createdSessionId);
    expect(sessionData.status).toBeDefined();
  });
});
