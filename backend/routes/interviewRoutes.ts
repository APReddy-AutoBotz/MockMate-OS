import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';
import * as aiService from '../services/aiService';
import * as sessionService from '../services/sessionService';
import { 
  InterviewSessionStartRequestSchema, 
  AnswerSubmissionRequestSchema,
  CalibrateRequestSchema,
  PlanGenerationRequestSchema,
  HintRequestSchema,
  IdealResponseRequestSchema
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
    res.json(result);
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
    const { role, intent, controls, jdText, resumeText } = parsed.data;
    const result = await aiService.generateInterviewPlan(role, intent, controls, jdText, resumeText);
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
    const parsed = HintRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid hint request payload', details: parsed.error.issues });
    }
    const result = await aiService.getHintForQuestion(parsed.data.questionText, parsed.data.expectedSignals);
    res.json({ hint: result });
  } catch (error: any) {
    console.error('[Interview] hint error:', error);
    res.status(500).json({ error: error.message || 'Could not generate hint' });
  }
});

router.post('/ideal-response', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const parsed = IdealResponseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid ideal response payload', details: parsed.error.issues });
    }
    const result = await aiService.generateIdealAnswer(parsed.data.questionText, parsed.data.expectedSignals, parsed.data.userAnswer);
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
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] code analyze error:', error);
    res.status(500).json({ error: error.message || 'Could not analyze code' });
  }
});

export default router;
