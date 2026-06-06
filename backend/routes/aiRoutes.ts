
import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';

const router = Router();

// Protect all AI routes
router.use(verifyAuthToken);

router.post('/calibrate-intent', async (req, res) => {
    try {
        const { intent, context } = req.body;
        if (!intent) {
            return res.status(400).json({ error: 'Intent is required' });
        }
        const result = await import('../services/aiService').then(m => m.calibrateIntent(intent, context));
        res.json(result);
    } catch (error: any) {
        console.error("Route Error:", error);
        res.status(500).json({ error: error.message || 'Calibration failed' });
    }
});

router.post('/generate-plan', enforceUsageLimit('interview_question'), async (req, res) => {
    try {
        const { intent, jdText, controls, panelIDs } = req.body;
        // Basic validation
        if (!intent || !panelIDs) return res.status(400).json({ error: 'Missing required fields' });

        // Call service
        const result = await import('../services/aiService').then(m => m.generateInterviewPlan(intent, jdText, controls, panelIDs));
        res.json(result);
    } catch (error: any) {
        console.error("Plan Route Error:", error);
        res.status(500).json({ error: error.message || 'Plan generation failed' });
    }
});

router.post('/generate-report', async (req, res) => {
    try {
        const { history, context } = req.body;
        // In Phase 3, we prefer using sessionId if available to fetch from DB
        if (!history || !context) return res.status(400).json({ error: 'Missing history or context' });

        const result = await import('../services/aiService').then(m => m.generateFinalReport(history, context));
        res.json(result);
    } catch (error: any) {
        console.error("Report Route Error:", error);
        res.status(500).json({ error: error.message || 'Report generation failed' });
    }
});

router.post('/submit-answer', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { sessionId, answer } = req.body;
        const userId = req.user?.uid;

        if (!sessionId || !answer) return res.status(400).json({ error: 'Missing sessionId or answer' });

        const result = await import('../services/aiService').then(m => m.submitAnswer(userId, sessionId, answer));
        res.json(result);
    } catch (error: any) {
        console.error("Submit Answer Error:", error);
        res.status(500).json({ error: error.message || 'Failed to submit answer' });
    }
});

router.post('/start-session', enforceUsageLimit('interview_question'), async (req: any, res) => {
    try {
        const { context } = req.body;
        const userId = req.user?.uid;
        if (!context) return res.status(400).json({ error: 'Missing context' });
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await import('../services/aiService').then(m => m.startInterviewSession(userId, context));
        res.json(result);
    } catch (error: any) {
        console.error("Start Session Error:", error);
        res.status(500).json({ error: error.message || 'Failed to start session' });
    }
});

// --- New Functionality Routes ---

router.post('/analyze-code', async (req, res) => {
    try {
        const { blueprint, code } = req.body;
        const result = await import('../services/aiService').then(m => m.analyzeCode(blueprint, code));
        res.json({ feedback: result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/simulate-execution', async (req, res) => {
    try {
        const { code, language } = req.body;
        const result = await import('../services/aiService').then(m => m.simulateExecution(code, language));
        res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/get-hint', async (req, res) => {
    try {
        const { question } = req.body;
        const result = await import('../services/aiService').then(m => m.getHintForQuestion(question));
        res.json({ hint: result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/generate-ideal', async (req, res) => {
    try {
        const { question, blueprint, userAnswer } = req.body;
        const result = await import('../services/aiService').then(m => m.generateIdealAnswer(question, blueprint, userAnswer));
        res.json({ idealAnswer: result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/transcribe', async (req, res) => {
    try {
        const { audioData, mimeType } = req.body; // Expecting base64 string
        if (!audioData) return res.status(400).json({ error: 'No audio data' });
        const result = await import('../services/aiService').then(m => m.transcribeAudio(audioData, mimeType));
        res.json({ transcript: result });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
