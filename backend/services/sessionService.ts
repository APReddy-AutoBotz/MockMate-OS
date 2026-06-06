import { supabaseAdmin } from '../supabaseAdmin';
import { InterviewSession, SessionContext, InterviewTurn, FinalReport, PilotFeedback } from '../types';

const fallbackSessions = new Map<string, InterviewSession>();

const toSession = async (row: any): Promise<InterviewSession> => {
    const history = row.history || [];
    if (supabaseAdmin && !row.history) {
        const { data } = await supabaseAdmin
            .from('interview_turns')
            .select('*')
            .eq('session_id', row.id)
            .order('created_at', { ascending: true });
        for (const turn of data || []) {
            history.push({
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
    };
};

export const createSession = async (userId: string, context: SessionContext): Promise<InterviewSession> => {
    const now = new Date().toISOString();

    if (!supabaseAdmin) {
        const id = `local_${Date.now()}`;
        const session: InterviewSession = { id, userId, context, history: [], createdAt: now, updatedAt: now, status: 'active' };
        fallbackSessions.set(id, session);
        return session;
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
        })
        .select('*')
        .single();

    if (error) throw error;
    return toSession(data);
};

export const getSession = async (sessionId: string): Promise<InterviewSession | null> => {
    if (!supabaseAdmin) return fallbackSessions.get(sessionId) || null;
    const { data, error } = await supabaseAdmin
        .from('interview_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
    if (error) throw error;
    return data ? toSession(data) : null;
};

export const updateSessionHistory = async (sessionId: string, turn: InterviewTurn) => {
    const now = new Date().toISOString();
    if (!supabaseAdmin) {
        const session = fallbackSessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        session.history.push(turn);
        session.updatedAt = now;
        fallbackSessions.set(sessionId, session);
        return;
    }

    const session = await getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const { error: turnError } = await supabaseAdmin.from('interview_turns').insert({
        user_id: session.userId,
        session_id: sessionId,
        question: turn.question,
        answer_text: turn.candidateResponse,
        feedback: { interviewer: turn.interviewer },
        created_at: new Date(turn.timestamp || Date.now()).toISOString(),
    });
    if (turnError) throw turnError;

    const { error } = await supabaseAdmin
        .from('interview_sessions')
        .update({ updated_at: now })
        .eq('id', sessionId);
    if (error) throw error;
};

export const completeSession = async (sessionId: string, report: FinalReport) => {
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
        .update({ report_summary: report, status: 'completed', updated_at: now })
        .eq('id', sessionId);
    if (error) throw error;
};

export const getUserSessions = async (userId: string, limit: number = 20): Promise<InterviewSession[]> => {
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

export const savePilotFeedback = async (sessionId: string, feedback: PilotFeedback) => {
    const now = new Date().toISOString();
    if (!supabaseAdmin) {
        const session = fallbackSessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        session.pilotFeedback = feedback;
        session.updatedAt = now;
        fallbackSessions.set(sessionId, session);
        return;
    }

    const current = await getSession(sessionId);
    const report = current?.report ? { ...current.report, pilotFeedback: feedback } : { pilotFeedback: feedback };
    const { error } = await supabaseAdmin
        .from('interview_sessions')
        .update({ report_summary: report, updated_at: now })
        .eq('id', sessionId);
    if (error) throw error;
};
