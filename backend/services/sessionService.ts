import { supabaseAdmin } from '../supabaseAdmin';
import type { InterviewSessionContext, InterviewTurn, FinalReport, QuestionBlueprint } from 'mockmate-shared';

// For local in-memory fallback
const fallbackSessions = new Map<string, any>();

export const toSession = async (row: any): Promise<any> => {
    const history = row.history || [];
    if (supabaseAdmin && !row.history) {
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
    }

    return {
        id: row.id,
        userId: row.user_id,
        context: row.setup || {},
        history,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: row.status || 'active',
        report: row.report_summary || undefined,
        pilotFeedback: row.pilot_feedback || undefined,
        currentQuestionIndex: row.current_question_index || 0,
        pendingQuestionId: row.pending_question_id || null,
        pendingQuestion: row.pending_question || null,
    };
};

export const createSession = async (
    userId: string, 
    context: InterviewSessionContext
): Promise<any> => {
    const now = new Date().toISOString();
    const firstQuestion = context.interviewPlan.questionSet[0];

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
            pendingQuestion: firstQuestion
        };
        fallbackSessions.set(id, session);
        return {
            sessionId: id,
            firstQuestion,
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
            pending_question: firstQuestion
        })
        .select('*')
        .single();

    if (error) throw error;
    return {
        sessionId: data.id,
        firstQuestion,
    };
};

export const getSession = async (userId: string, sessionId: string): Promise<any | null> => {
    if (!supabaseAdmin) return fallbackSessions.get(sessionId) || null;
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
    answerText: string
) => {
    const session = await getSession(userId, sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'active') throw new Error('Session is not active');
    if (session.pendingQuestionId !== questionId) throw new Error('Stale or mismatched question submission');

    const totalQuestions = session.context.controls.totalQuestions || session.context.interviewPlan.questionSet.length;
    const answeredQuestionIndex = session.currentQuestionIndex;
    
    const turn: InterviewTurn = {
        id: `turn_${Date.now()}`,
        interviewer: session.pendingQuestion?.personaFocus || 'Interviewer',
        question: session.pendingQuestion?.question || '',
        candidateResponse: answerText,
        timestamp: Date.now()
    };

    const newIndex = answeredQuestionIndex + 1;
    const isLastQuestion = newIndex >= totalQuestions;
    const nextQuestion = isLastQuestion ? null : session.context.interviewPlan.questionSet[newIndex];

    if (!supabaseAdmin) {
        session.history.push(turn);
        session.currentQuestionIndex = newIndex;
        session.pendingQuestion = nextQuestion;
        session.pendingQuestionId = nextQuestion?.id || null;
        if (isLastQuestion) session.status = 'completed';
        session.updatedAt = new Date().toISOString();
        fallbackSessions.set(sessionId, session);
        return { nextQuestion, isLastQuestion };
    }

    const { error } = await supabaseAdmin.rpc('atomic_submit_answer', {
        p_session_id: sessionId,
        p_user_id: userId,
        p_question_id: questionId,
        p_turn: turn,
        p_next_question_json: nextQuestion,
        p_next_question_id: nextQuestion?.id || null,
        p_is_last: isLastQuestion
    });

    if (error) throw new Error(`Atomic submit failed: ${error.message}`);
    
    // Also log turn for analytics/audit if needed, but atomic RPC handles the state safely.
    // The previous implementation wrote to interview_turns separately, we'll keep it simple: atomic_submit_answer handles the array append natively in the row.

    return { nextQuestion, isLastQuestion };
};

export const completeSession = async (userId: string, sessionId: string, report: FinalReport) => {
    const now = new Date().toISOString();
    if (!supabaseAdmin) {
        const session = fallbackSessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        session.report = report;
        session.status = 'completed';
        session.updatedAt = now;
        fallbackSessions.set(sessionId, session);
        return;
    }

    const { error } = await supabaseAdmin
        .from('interview_sessions')
        .update({ 
            report_summary: report as any, 
            status: 'completed', 
            evaluation_status: 'completed',
            updated_at: now,
            completed_at: now
        })
        .eq('id', sessionId)
        .eq('user_id', userId);
    if (error) throw error;
};

export const markSessionEvaluationFailed = async (userId: string, sessionId: string, errorCode: string) => {
    if (!supabaseAdmin) return;
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

export const savePilotFeedback = async (sessionId: string, feedback: any) => {
    // legacy support...
};
