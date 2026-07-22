import { supabaseAdmin } from '../supabaseAdmin';
import { 
  InterviewSessionContext, 
  InterviewTurn, 
  FinalReport, 
  InterviewSessionStartResponse, 
  AnswerSubmissionResponse 
} from 'mockmate-shared';

// For local in-memory fallback
const fallbackSessions = new Map<string, any>();

export const toSession = async (row: any): Promise<any> => {
  const history: InterviewTurn[] = [];
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('interview_turns')
      .select('*')
      .eq('session_id', row.id)
      .order('created_at', { ascending: true });
    
    for (const turn of data || []) {
      history.push({
        id: turn.id,
        interviewer: turn.feedback?.interviewer || 'Interviewer',
        question: turn.question || '',
        candidateResponse: turn.answer_text || '',
        timestamp: new Date(turn.created_at).getTime(),
      });
    }
  } else if (row.history) {
    history.push(...row.history);
  }

  return {
    id: row.id,
    userId: row.user_id || row.userId,
    context: row.setup || row.context || {},
    history,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    status: row.status || 'active',
    report: row.report_summary || row.report || undefined,
    pilotFeedback: row.pilot_feedback || row.pilotFeedback || undefined,
    currentQuestionIndex: row.current_question_index ?? row.currentQuestionIndex ?? 0,
    pendingQuestionId: row.pending_question_id ?? row.pendingQuestionId ?? null,
    pendingQuestion: row.pending_question ?? row.pendingQuestion ?? null,
    evaluationStatus: row.evaluation_status ?? row.evaluationStatus ?? 'not_tested',
    evaluationErrorCode: row.evaluation_error_code ?? row.evaluationErrorCode ?? null,
    completedAt: row.completed_at || row.completedAt || undefined,
  };
};

export const createSession = async (
  userId: string, 
  context: InterviewSessionContext
): Promise<InterviewSessionStartResponse> => {
  const now = new Date().toISOString();
  if (!context.interviewPlan || !context.interviewPlan.questionSet || context.interviewPlan.questionSet.length === 0) {
    throw new Error('Interview plan must contain a non-empty question set');
  }

  const firstQuestion = context.interviewPlan.questionSet[0];
  const totalQuestions = context.controls?.totalQuestions || context.interviewPlan.questionSet.length;
  const openingMessage = `Welcome to your mock interview session for the ${context.candidateRole} position. We will cover ${totalQuestions} key questions. Ready for your first question?`;

  if (!supabaseAdmin) {
    const id = `local_${Date.now()}`;
    const session = { 
      id, 
      userId, 
      context, 
      history: [], 
      createdAt: now, 
      updatedAt: now, 
      status: 'active',
      currentQuestionIndex: 0,
      pendingQuestionId: firstQuestion.id,
      pendingQuestion: firstQuestion,
      evaluation_status: 'not_tested',
      totalQuestions
    };
    fallbackSessions.set(id, session);
    return {
      sessionId: id,
      openingMessage,
      firstQuestion,
      questionIndex: 0,
      totalQuestions
    };
  }

  const { data, error } = await supabaseAdmin
    .from('interview_sessions')
    .insert({
      user_id: userId,
      role: context.candidateRole || null,
      setup: context,
      status: 'active',
      created_at: now,
      updated_at: now,
      current_question_index: 0,
      pending_question_id: firstQuestion.id,
      pending_question: firstQuestion,
      evaluation_status: 'not_tested'
    })
    .select('*')
    .single();

  if (error) throw error;
  return {
    sessionId: data.id,
    openingMessage,
    firstQuestion,
    questionIndex: 0,
    totalQuestions
  };
};

export const getSession = async (userId: string, sessionId: string): Promise<any | null> => {
  if (!supabaseAdmin) {
    const local = fallbackSessions.get(sessionId);
    if (!local || local.userId !== userId) return null;
    return toSession(local);
  }
  const { data, error } = await supabaseAdmin
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toSession(data) : null;
};

export const submitAnswer = async (
  userId: string,
  sessionId: string,
  questionId: string,
  expectedQuestionIndex: number,
  answerKind: 'answered' | 'skipped',
  answerText?: string
): Promise<AnswerSubmissionResponse> => {
  const session = await getSession(userId, sessionId);
  if (!session) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status !== 'active') {
    const err: any = new Error('Session is not active');
    err.status = 409;
    throw err;
  }
  if (session.pendingQuestionId !== questionId || session.currentQuestionIndex !== expectedQuestionIndex) {
    const err: any = new Error('Stale or mismatched question submission');
    err.status = 409;
    throw err;
  }

  const totalQuestions = session.context?.controls?.totalQuestions || session.context?.interviewPlan?.questionSet?.length || 1;
  const answeredQuestionIndex = session.currentQuestionIndex;
  const newIndex = answeredQuestionIndex + 1;
  const isLastQuestion = newIndex >= totalQuestions;
  const nextQuestion = isLastQuestion ? null : session.context.interviewPlan.questionSet[newIndex];
  const textToSave = answerKind === 'skipped' ? '[Question Skipped]' : (answerText || '');

  if (!supabaseAdmin) {
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const turn: InterviewTurn = {
      id: turnId,
      interviewer: session.pendingQuestion?.personaFocus || 'Interviewer',
      question: session.pendingQuestion?.question || '',
      candidateResponse: textToSave,
      timestamp: Date.now()
    };
    session.history.push(turn);
    session.currentQuestionIndex = newIndex;
    session.pendingQuestion = nextQuestion;
    session.pendingQuestionId = nextQuestion?.id || null;
    if (isLastQuestion) {
      session.status = 'awaiting_report';
    }
    session.updatedAt = new Date().toISOString();
    fallbackSessions.set(sessionId, session);

    return {
      completedTurnId: turnId,
      nextQuestion,
      isLastQuestion,
      questionIndex: newIndex,
      totalQuestions
    };
  }

  const { data, error } = await supabaseAdmin.rpc('atomic_submit_answer', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_question_id: questionId,
    p_expected_question_index: expectedQuestionIndex,
    p_answer_kind: answerKind,
    p_answer_text: textToSave,
    p_next_question_json: nextQuestion,
    p_next_question_id: nextQuestion?.id || null,
    p_is_last: isLastQuestion,
    p_total_questions: totalQuestions
  });

  if (error) {
    const err: any = new Error(`Atomic submit failed: ${error.message}`);
    err.status = 409;
    throw err;
  }

  return {
    completedTurnId: data.completedTurnId,
    nextQuestion: data.nextQuestion,
    isLastQuestion: data.isLastQuestion,
    questionIndex: data.questionIndex,
    totalQuestions: data.totalQuestions
  };
};

export const markSessionEvaluationProcessing = async (userId: string, sessionId: string) => {
  const session = await getSession(userId, sessionId);
  if (!session) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status !== 'awaiting_report') {
    const err: any = new Error(`Session must be awaiting_report before generating report. Current status: '${session.status}'`);
    err.status = 409;
    throw err;
  }

  if (!supabaseAdmin) {
    const s = fallbackSessions.get(sessionId);
    if (s && s.userId === userId) {
      s.evaluationStatus = 'processing';
      s.evaluationErrorCode = undefined;
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from('interview_sessions')
    .update({ evaluation_status: 'processing', evaluation_error_code: null })
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const completeSession = async (userId: string, sessionId: string, report: FinalReport) => {
  const now = new Date().toISOString();
  if (!supabaseAdmin) {
    const s = fallbackSessions.get(sessionId);
    if (s && s.userId === userId) {
      s.report = report;
      s.status = 'completed';
      s.evaluationStatus = 'completed';
      s.pendingQuestionId = null;
      s.pendingQuestion = null;
      s.evaluationErrorCode = undefined;
      s.completedAt = now;
      s.updatedAt = now;
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from('interview_sessions')
    .update({ 
      report_summary: report as any, 
      status: 'completed', 
      evaluation_status: 'completed',
      pending_question_id: null,
      pending_question: null,
      evaluation_error_code: null,
      updated_at: now,
      completed_at: now
    })
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const markSessionEvaluationFailed = async (userId: string, sessionId: string, errorCode: string) => {
  if (!supabaseAdmin) {
    const s = fallbackSessions.get(sessionId);
    if (s && s.userId === userId) {
      s.evaluationStatus = 'failed';
      s.evaluationErrorCode = errorCode;
    }
    return;
  }
  await supabaseAdmin
    .from('interview_sessions')
    .update({ evaluation_status: 'failed', evaluation_error_code: errorCode })
    .eq('id', sessionId)
    .eq('user_id', userId);
};

export const getUserSessions = async (userId: string, limit: number = 20): Promise<any[]> => {
  if (!supabaseAdmin) {
    return [...fallbackSessions.values()]
      .filter(s => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const { data, error } = await supabaseAdmin
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return Promise.all((data || []).map(toSession));
};
