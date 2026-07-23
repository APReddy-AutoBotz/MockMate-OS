import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';
import * as aiService from '../services/aiService';
import * as sessionService from '../services/sessionService';
import { 
  InterviewSessionStartRequestSchema, 
  AnswerSubmissionRequestSchema,
  AdaptiveAnswerSubmissionRequestSchema,
  CalibrateRequestSchema,
  CalibrateResponseSchema,
  PlanGenerationRequestSchema,
  InterviewPlanSchema,
  HintRequestSchema,
  IdealResponseRequestSchema,
  CodeAnalysisRequestSchema,
  CodeSimulationRequestSchema
} from 'mockmate-shared';

const router = Router();

router.use(verifyAuthToken);

// ==========================================
// PRE-SESSION
// ==========================================

router.post('/calibrate', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const parsed = CalibrateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid calibrate payload', details: parsed.error.issues });
    }
    const result = await aiService.calibrateIntent(parsed.data.role, parsed.data.jobDescription);
    res.json(CalibrateResponseSchema.parse(result));
  } catch (error: any) {
    console.error('[Interview] calibrate error:', error);
    res.status(500).json({ error: error.message || 'Could not calibrate intent' });
  }
});

router.post('/plan', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const parsed = PlanGenerationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid plan generation payload', details: parsed.error.issues });
    }
    const { role, intent, controls, jdText, resumeText, selectedPanelIDs } = parsed.data;
    const result = await aiService.generateInterviewPlan(role, intent, controls, jdText, resumeText, selectedPanelIDs);
    res.json(InterviewPlanSchema.parse(result));
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
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = InterviewSessionStartRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid session start payload', details: parsed.error.issues });
    }

    const result = await sessionService.createSession(userId, parsed.data.context);
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] create session error:', error);
    res.status(500).json({ error: error.message || 'Could not start session' });
  }
});

router.post('/sessions/:sessionId/answers', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Try parsing as Adaptive submission first
    if (req.body && req.body.clientSubmissionId) {
      const adaptiveParsed = AdaptiveAnswerSubmissionRequestSchema.safeParse(req.body);
      if (adaptiveParsed.success) {
        const { questionId, expectedSessionVersion, clientSubmissionId, answerKind, answerText } = adaptiveParsed.data;
        const result = await sessionService.submitAdaptiveTurn(
          userId,
          sessionId,
          questionId,
          expectedSessionVersion,
          clientSubmissionId,
          answerKind,
          answerText
        );
        return res.json(result);
      }
    }

    // Fall back to standard Answer submission
    const parsed = AnswerSubmissionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid answer submission payload', details: parsed.error.issues });
    }

    const { questionId, expectedQuestionIndex, answerKind, answerText } = parsed.data;
    const result = await sessionService.submitAnswer(
      userId,
      sessionId,
      questionId,
      expectedQuestionIndex,
      answerKind,
      answerText
    );
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] submit answer error:', error);
    if (error.status === 409 || (error.message && error.message.includes('Stale or mismatched'))) {
      return res.status(409).json({ error: error.message });
    }
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
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
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Could not generate report' });
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
    const parsed = HintRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid hint request payload', details: parsed.error.issues });
    }
    const result = await aiService.getHintForQuestion(parsed.data.questionText, parsed.data.expectedSignals);
    if (!result || result === 'Hint unavailable.') {
      return res.status(503).json({ hint: 'Hint unavailable.', error: 'Hint unavailable.' });
    }
    res.json({ hint: result });
  } catch (error: any) {
    console.error('[Interview] hint error:', error);
    res.status(503).json({ hint: 'Hint unavailable.', error: 'Hint unavailable.' });
  }
});

router.post('/ideal-response', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const parsed = IdealResponseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid ideal response payload', details: parsed.error.issues });
    }
    const result = await aiService.generateIdealAnswer(parsed.data.questionText, parsed.data.expectedSignals, parsed.data.userAnswer);
    if (!result || result === 'Sample response unavailable.') {
      return res.status(503).json({ idealResponse: 'Sample response unavailable.', error: 'Sample response unavailable.' });
    }
    res.json({ idealResponse: result });
  } catch (error: any) {
    console.error('[Interview] ideal response error:', error);
    res.status(503).json({ idealResponse: 'Sample response unavailable.', error: 'Sample response unavailable.' });
  }
});

router.post('/transcribe', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ status: 'unavailable', transcript: null, error: 'Missing audioBase64' });
    }
    const result = await aiService.transcribeAudio(audioBase64, mimeType);
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] transcribe error:', error);
    res.status(503).json({ status: 'unavailable', transcript: null, error: error.message || 'Could not transcribe audio' });
  }
});

// ==========================================
// CODE EXECUTION & SIMULATION
// ==========================================

router.post('/code/analyze', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const parsed = CodeAnalysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid code analysis payload', details: parsed.error.issues });
    }
    const result = await aiService.analyzeCode(parsed.data.blueprint, parsed.data.code);
    if (result.status === 'unavailable') {
      return res.status(503).json(result);
    }
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] code analyze error:', error);
    res.status(503).json({ status: 'unavailable', feedback: 'Code analysis unavailable.', passed: null });
  }
});

router.post('/code/simulate', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const parsed = CodeSimulationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid code simulation payload', details: parsed.error.issues });
    }
    const result = await aiService.simulateExecution(parsed.data.code, parsed.data.language);
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] code simulate error:', error);
    res.json({ status: 'unavailable', stdout: '', stderr: 'Code simulation unavailable.' });
  }
});

export default router;
