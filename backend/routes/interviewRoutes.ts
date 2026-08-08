import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { consumeUsage, enforceUsageLimit } from '../services/usageService';
import * as aiService from '../services/aiService';
import * as sessionService from '../services/sessionService';
import { bindAuthoritativePlan, getAuthoritativePlan, getAuthoritativePlanForBridge, hashInterviewPlan, persistAuthoritativePlan } from '../services/interviewPlanService';
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
  CodeSimulationRequestSchema,
  CareerContextSnapshot
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
    const { role, intent, controls, jdText, resumeText, selectedPanelIDs, snapshotId, bridgeId } = parsed.data;
    const userId = req.user?.uid;
    let groundingSnapshot: CareerContextSnapshot | undefined = undefined;

    if (Boolean(snapshotId) !== Boolean(bridgeId)) {
      return res.status(422).json({ error: 'Grounded plan generation requires both snapshotId and bridgeId.' });
    }

    if (snapshotId) {
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { getSnapshotById } = require('../services/groundingSnapshotService');
      const snap = await getSnapshotById(userId, snapshotId);
      if (!snap) {
        return res.status(404).json({ error: `Grounding snapshot '${snapshotId}' not found or access denied.` });
      }
      if (!['resume_to_interview', 'clearspeak_to_interview', 'interview_personalization'].includes(snap.purpose)) {
        return res.status(422).json({ error: `Snapshot purpose '${snap.purpose}' is incompatible with Interview practice.` });
      }
      groundingSnapshot = snap;
    }

    if (bridgeId) {
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { getModuleBridgeById } = require('../services/moduleBridgeService');
      const bridge = await getModuleBridgeById(userId, bridgeId);
      if (!bridge) {
        return res.status(404).json({ error: `Module bridge '${bridgeId}' not found or access denied.` });
      }
      if (snapshotId && bridge.snapshotId !== snapshotId) {
        return res.status(422).json({ error: `Bridge snapshotId '${bridge.snapshotId}' does not match requested snapshotId '${snapshotId}'.` });
      }
      if (bridge.status !== 'confirmed') {
        return res.status(409).json({ error: `Bridge status is '${bridge.status}', cannot generate plan.` });
      }
    }

    if (snapshotId && bridgeId && userId) {
      const existing = await getAuthoritativePlanForBridge(userId, bridgeId);
      if (existing) {
        if (existing.snapshotId !== snapshotId) return res.status(422).json({ error: 'Existing authoritative plan snapshot mismatch.' });
        return res.json(InterviewPlanSchema.parse({ ...existing.plan, authority: { planId: existing.id, planHash: existing.hash, version: existing.version, snapshotId, bridgeId } }));
      }
    }
    const result = InterviewPlanSchema.parse(await aiService.generateInterviewPlan(role, intent, controls, jdText, resumeText, selectedPanelIDs, groundingSnapshot));
    if (snapshotId && bridgeId && userId) {
      const artifact = await persistAuthoritativePlan(userId, snapshotId, bridgeId, result);
      return res.json(InterviewPlanSchema.parse({
        ...artifact.plan,
        authority: { planId: artifact.id, planHash: artifact.hash, version: artifact.version, snapshotId, bridgeId },
      }));
    }
    res.json(result);
  } catch (error: any) {
    console.error('[Interview] plan error:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Could not create interview practice plan' });
  }
});

// ==========================================
// SESSIONS
// ==========================================

router.post('/sessions', async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = InterviewSessionStartRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: 'Invalid session start payload', details: parsed.error.issues });
    }

    const bridgeSessionId = parsed.data.context?.bridgeSessionId;
    const groundingSnapshot = parsed.data.context?.groundingSnapshot;
    const planAuthority = parsed.data.context?.interviewPlan.authority;
    if (!bridgeSessionId && (groundingSnapshot || planAuthority)) {
      return res.status(422).json({ error: 'Grounding snapshots and authoritative plan selectors require a valid bridgeSessionId.' });
    }
    let authoritativeContext = parsed.data.context;
    let authoritativePlan: Awaited<ReturnType<typeof getAuthoritativePlan>> = null;

    if (bridgeSessionId) {
      const selector = parsed.data.context.interviewPlan.authority;
      if (!selector) return res.status(422).json({ error: 'A server-authoritative plan selector is required for grounded sessions.' });
      authoritativePlan = await getAuthoritativePlan(userId, selector.planId);
      if (!authoritativePlan) return res.status(404).json({ error: 'Authoritative interview plan not found or access denied.' });
      const { authority: _browserSelector, ...browserPlanPayload } = parsed.data.context.interviewPlan;
      if (hashInterviewPlan(browserPlanPayload) !== authoritativePlan.hash) {
        return res.status(422).json({ error: 'Browser interview plan payload differs from the authoritative generated plan.' });
      }
      if (selector.planHash !== authoritativePlan.hash || selector.version !== authoritativePlan.version ||
          selector.snapshotId !== authoritativePlan.snapshotId || selector.bridgeId !== authoritativePlan.bridgeId ||
          bridgeSessionId !== authoritativePlan.bridgeId) {
        return res.status(422).json({ error: 'Interview plan selector does not match the authoritative plan lineage.' });
      }
      const { getModuleBridgeById } = require('../services/moduleBridgeService');
      const { getSnapshotById } = require('../services/groundingSnapshotService');
      const bridge = await getModuleBridgeById(userId, bridgeSessionId);
      if (!bridge) return res.status(404).json({ error: 'Grounding bridge not found or access denied.' });
      if (bridge.targetModule !== 'interview') return res.status(422).json({ error: 'Grounding bridge target is incompatible with Interview practice.' });
      const snapshot = await getSnapshotById(userId, bridge.snapshotId);
      if (!snapshot || snapshot.purpose !== bridge.purpose || snapshot.id !== authoritativePlan.snapshotId) {
        return res.status(422).json({ error: 'Bridge, snapshot, and authoritative plan lineage do not match.' });
      }
      if (authoritativePlan.sessionId) {
        const existing = await sessionService.getSession(userId, authoritativePlan.sessionId);
        if (!existing) throw Object.assign(new Error('Authoritative plan references a missing session'), { status: 503 });
        const questions = existing.context.interviewPlan.questionSet;
        return res.json({ sessionId: existing.id, openingMessage: `Welcome to your MockMate interview. Reasoning mode: '${existing.context.controls.reasoningMode}'. We will cover ${questions.length} core scenarios through adaptive exploration.`, firstQuestion: questions[0], questionIndex: 0, totalQuestions: questions.length });
      }
      if (bridge.status !== 'confirmed') return res.status(409).json({ error: `Bridge status is '${bridge.status}', cannot start session.` });
      authoritativeContext = {
        ...authoritativeContext,
        groundingSnapshot: snapshot,
        bridgeSessionId: bridge.id,
        candidateRole: authoritativePlan.plan.jdInsights.role,
        controls: authoritativePlan.plan.meta.controls,
        jdInsights: authoritativePlan.plan.jdInsights,
        interviewPlan: {
          ...authoritativePlan.plan,
          authority: selector,
        },
      };
    }

    // Ungrounded sessions retain their explicit contract and ordinary usage charge.
    // Grounded usage is charged atomically by bind_interview_plan_session_tx, after
    // canonical replay detection, so response-loss recovery never spends twice.
    if (!bridgeSessionId) {
      const usage = await consumeUsage(userId, 'interview_question');
      if (!usage.allowed) return res.status(429).json({ error: "You have used today's free practice. Come back tomorrow or continue with saved work.", code: 'daily_limit_reached', feature: 'interview_question', used: usage.used, limit: usage.limit });
    }

    // 1. Create real Interview session first
    const result = await sessionService.createSession(userId, authoritativeContext);
    const actualInterviewSessionId = result.sessionId;

    if (!actualInterviewSessionId) {
      return res.status(500).json({ error: 'Failed to create Interview session' });
    }

    // 2. Consume module bridge using actual returned Interview session ID
    if (bridgeSessionId) {
      try {
        if (!authoritativePlan) throw new Error('Authoritative plan was not loaded');
        await bindAuthoritativePlan(userId, authoritativePlan.id, authoritativePlan.hash, bridgeSessionId, actualInterviewSessionId);
      } catch (bridgeErr: any) {
        console.error('[Interview] Bridge consumption failed for session creation:', bridgeErr.message);
        try {
          await sessionService.deleteSession(userId, actualInterviewSessionId);
        } catch (cleanupErr: any) {
          console.error('[Interview] Orphan session cleanup failed:', cleanupErr.message);
          return res.status(503).json({ error: `Grounding bridge consumption failed and session cleanup could not be verified: ${cleanupErr.message}` });
        }
        const status = bridgeErr.message?.includes('daily_limit_reached') ? 429 : (bridgeErr.status || 409);
        return res.status(status).json({
          error: `Grounding bridge consumption failed: ${bridgeErr.message}. Practice session cancelled.`
        });
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('[Interview] create session error:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Could not start session' });
  }
});

router.post('/sessions/:sessionId/answers', enforceUsageLimit('interview_question'), async (req: any, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const session = await sessionService.getSession(userId, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // For engine_version='v2' sessions, strictly require Adaptive submission payload
    if (session.engineVersion === 'v2' || req.body?.clientSubmissionId || req.body?.expectedSessionVersion !== undefined) {
      const adaptiveParsed = AdaptiveAnswerSubmissionRequestSchema.safeParse(req.body);
      if (!adaptiveParsed.success) {
        return res.status(422).json({ error: 'Invalid adaptive answer submission payload', details: adaptiveParsed.error.issues });
      }

      const { questionId, expectedSessionVersion, clientSubmissionId, answerKind, answerText } = adaptiveParsed.data;
      const result = await sessionService.submitAdaptiveTurn(
        userId,
        sessionId,
        questionId,
        expectedSessionVersion,
        clientSubmissionId,
        answerKind,
        answerText ?? undefined
      );
      return res.json(result);
    }

    // Fall back to standard Answer submission ONLY for legacy v1 sessions
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
    
    const session = await sessionService.getSession(userId, sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'active') {
      return res.status(409).json({ error: 'Session is active and not in awaiting_report status' });
    }

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
