import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';
import * as aiService from '../services/aiService';
import * as sessionService from '../services/sessionService';

const router = Router();

router.use(verifyAuthToken);

// ==========================================
// PRE-SESSION
// ==========================================

router.post('/calibrate', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { intentText, additionalContext } = req.body;
        if (!intentText) return res.status(400).json({ error: 'Missing intentText' });
        const result = await aiService.calibrateIntent(intentText, additionalContext);
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] calibrate error:', error);
        res.status(500).json({ error: error.message || 'Could not calibrate intent' });
    }
});

router.post('/plan', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { intentText, jdText, controls, selectedPanelIDs } = req.body;
        if (!intentText || !selectedPanelIDs || !controls) return res.status(400).json({ error: 'Missing required setup details' });
        const result = await aiService.generateInterviewPlan(intentText, jdText, controls, selectedPanelIDs);
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] plan error:', error);
        res.status(500).json({ error: error.message || 'Could not create interview practice plan' });
    }
});

// ==========================================
// SESSIONS
// ==========================================

router.post('/sessions', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { context } = req.body;
        const userId = req.user?.uid;
        if (!context || !userId) return res.status(400).json({ error: 'Missing session context' });
        
        const result = await sessionService.createSession(userId, context);
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] create session error:', error);
        res.status(500).json({ error: error.message || 'Could not start session' });
    }
});

router.post('/sessions/:sessionId/answers', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { sessionId } = req.params;
        const { questionId, answerText } = req.body;
        const userId = req.user?.uid;
        if (!sessionId || !questionId || !answerText) return res.status(400).json({ error: 'Missing session, questionId, or answerText' });
        
        const result = await sessionService.submitAnswer(userId, sessionId, questionId, answerText);
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] submit answer error:', error);
        if (error.message && error.message.includes('Stale or mismatched')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Could not review this answer' });
    }
});

router.post('/sessions/:sessionId/report', async (req: any, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user?.uid;
        if (!sessionId || !userId) return res.status(400).json({ error: 'Missing sessionId' });
        
        const result = await aiService.generateAuthoritativeReport(userId, sessionId);
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] report error:', error);
        res.status(500).json({ error: error.message || 'Could not generate report' });
    }
});

router.get('/sessions', async (req: any, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await sessionService.getUserSessions(userId);
        res.json({ sessions: result });
    } catch (error: any) {
        console.error('[Interview] history error:', error);
        res.status(500).json({ error: error.message || 'Could not load practice history' });
    }
});

router.get('/sessions/:sessionId', async (req: any, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user?.uid;
        if (!userId || !sessionId) return res.status(400).json({ error: 'Missing sessionId' });
        
        const result = await sessionService.getSession(userId, sessionId);
        if (!result) return res.status(404).json({ error: 'Session not found' });
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] get session error:', error);
        res.status(500).json({ error: error.message || 'Could not load session' });
    }
});

// ==========================================
// ASSISTIVE TOOLS
// ==========================================

router.post('/hint', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { question } = req.body;
        if (!question) return res.status(400).json({ error: 'Missing question' });
        const result = await aiService.getHintForQuestion(question);
        res.json({ hint: result });
    } catch (error: any) {
        console.error('[Interview] hint error:', error);
        res.status(500).json({ error: error.message || 'Could not generate hint' });
    }
});

router.post('/ideal-response', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { question, blueprint, userAnswer } = req.body;
        if (!question || !userAnswer) return res.status(400).json({ error: 'Missing question or userAnswer' });
        const result = await aiService.generateIdealAnswer(question, blueprint, userAnswer);
        res.json({ idealResponse: result });
    } catch (error: any) {
        console.error('[Interview] ideal response error:', error);
        res.status(500).json({ error: error.message || 'Could not generate ideal response' });
    }
});

router.post('/transcribe', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { audioBase64, mimeType } = req.body;
        if (!audioBase64) return res.status(400).json({ error: 'Missing audioData' });
        const result = await aiService.transcribeAudio(audioBase64, mimeType);
        res.json({ transcript: result });
    } catch (error: any) {
        console.error('[Interview] transcribe error:', error);
        res.status(500).json({ error: error.message || 'Could not transcribe audio' });
    }
});

// ==========================================
// CODE EXECUTION
// ==========================================

router.post('/code/analyze', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { blueprint, code } = req.body;
        if (!blueprint || !code) return res.status(400).json({ error: 'Missing blueprint or code' });
        const result = await aiService.analyzeCode(blueprint, code);
        res.json({ feedback: result });
    } catch (error: any) {
        console.error('[Interview] code analyze error:', error);
        res.status(500).json({ error: error.message || 'Could not analyze code' });
    }
});

router.post('/code/simulate', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { code, language } = req.body;
        if (!code || !language) return res.status(400).json({ error: 'Missing code or language' });
        const result = await aiService.simulateExecution(code, language);
        res.json(result);
    } catch (error: any) {
        console.error('[Interview] simulate error:', error);
        res.status(500).json({ error: error.message || 'Could not simulate code' });
    }
});

export default router;
