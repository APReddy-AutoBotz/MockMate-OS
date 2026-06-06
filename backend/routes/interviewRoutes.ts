import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';
import { supabaseAdmin } from '../supabaseAdmin';

const router = Router();

router.use(verifyAuthToken);

router.post('/plan', enforceUsageLimit('interview_question'), async (req, res) => {
    try {
        const { intent, jdText, controls, panelIDs } = req.body;
        if (!intent || !panelIDs) return res.status(400).json({ error: 'Missing required setup details' });
        const result = await import('../services/aiService').then(m => m.generateInterviewPlan(intent, jdText, controls, panelIDs));
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] plan error:', error);
        res.status(500).json({ error: error.message || 'Could not create interview practice plan' });
    }
});

router.post('/answer', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { sessionId, answer } = req.body;
        const userId = req.user?.uid;
        if (!sessionId || !answer) return res.status(400).json({ error: 'Missing session or answer' });
        const result = await import('../services/aiService').then(m => m.submitAnswer(userId, sessionId, answer));
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] answer error:', error);
        res.status(500).json({ error: error.message || 'Could not review this answer' });
    }
});

router.post('/report', async (req, res) => {
    try {
        const { history, context } = req.body;
        if (!history || !context) return res.status(400).json({ error: 'Missing practice history or setup' });
        const result = await import('../services/aiService').then(m => m.generateFinalReport(history, context));
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] report error:', error);
        res.status(500).json({ error: error.message || 'Could not create your practice report' });
    }
});

router.get('/history', async (req: any, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!supabaseAdmin) return res.json({ sessions: [] });
        const { data, error } = await supabaseAdmin
            .from('interview_sessions')
            .select('id, role, status, readiness_score, created_at, updated_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        res.json({ sessions: data || [] });
    } catch (error: any) {
        console.error('[Interview] history error:', error);
        res.status(500).json({ error: error.message || 'Could not load practice history' });
    }
});

export default router;
