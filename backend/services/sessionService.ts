import { supabaseAdmin } from '../supabaseAdmin';
import {
  InterviewSessionContext,
  InterviewTurn,
  FinalReport,
  InterviewSessionStartResponse,
  AnswerSubmissionResponse,
  AdaptiveAnswerSubmissionResponse,
  AdaptivePolicy,
  DEFAULT_ADAPTIVE_POLICY,
  AdaptiveSessionState,
  QuestionBlueprint,
  normalizeQuestionBlueprint,
  ReasoningMode,
  InterviewStage,
  QuestionKind,
} from 'mockmate-shared';
import * as turnEvaluatorService from './turnEvaluatorService';
import { computeAdaptiveDecision, constructNextQuestion } from './adaptiveInterviewController';
import { aggregateTurnEvidence } from './evidenceAggregationService';
import { ACTIVE_DIMENSIONS_BY_MODE } from '../config/evaluationConfig';
import { getModePolicy } from '../config/modePolicies';

// In-memory fallback for local development without Supabase DB
const fallbackSessions = new Map<string, any>();

export const toSession = async (row: any): Promise<any> => {
  const history: any[] = [];
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
        questionBlueprint: turn.question_blueprint ? normalizeQuestionBlueprint(turn.question_blueprint) : undefined,
        questionKind: turn.question_kind || 'root',
        stage: turn.stage || 'framing',
        evaluationStatus: turn.evaluation_status || 'not_tested',
        turnEvaluation: turn.turn_evaluation || undefined,
        controllerDecision: turn.controller_decision || undefined,
        challengeEvent: turn.challenge_event || undefined,
        clientSubmissionId: turn.client_submission_id || undefined,
      });
    }
  } else if (row.history) {
    history.push(...row.history);
  }

  const rawPolicy = row.adaptive_policy || row.adaptivePolicy || DEFAULT_ADAPTIVE_POLICY;
  const policy: AdaptivePolicy = {
    enabled: rawPolicy.enabled ?? true,
    maxTurns: rawPolicy.maxTurns ?? 8,
    maxProbesPerRoot: rawPolicy.maxProbesPerRoot ?? 1,
    maxChallenges: rawPolicy.maxChallenges ?? 2,
    requireReflection: rawPolicy.requireReflection ?? true,
  };

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
    engineVersion: row.engine_version || row.engineVersion || 'v2',
    sessionVersion: row.session_version ?? row.sessionVersion ?? 1,
    currentQuestionIndex: row.current_root_question_index ?? row.current_question_index ?? row.currentQuestionIndex ?? 0,
    currentTurnIndex: row.current_turn_index ?? row.currentTurnIndex ?? 0,
    currentStage: row.current_stage || row.currentStage || 'framing',
    pendingQuestionKind: row.pending_question_kind || row.pendingQuestionKind || 'root',
    activeRootQuestionId: row.active_root_question_id || row.activeRootQuestionId || null,
    probeCountForRoot: row.probe_count_for_root ?? row.probeCountForRoot ?? 0,
    challengeCount: row.challenge_count ?? row.challengeCount ?? 0,
    adaptivePolicy: policy,
    dimensionState: row.dimension_state || row.dimensionState || {},
    pendingQuestionId: row.pending_question_id ?? row.pendingQuestionId ?? null,
    pendingQuestion: row.pending_question ? normalizeQuestionBlueprint(row.pending_question) : (row.pendingQuestion ? normalizeQuestionBlueprint(row.pendingQuestion) : null),
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

  if (context.interviewPlan?.meta?.controls) {
    context.controls = context.interviewPlan.meta.controls;
  }

  const normalizedQuestionSet = context.interviewPlan.questionSet.map((q, idx) => {
    return normalizeQuestionBlueprint({
      ...q,
      questionKind: 'root',
      rootQuestionId: q.id || `root_${idx + 1}`,
      stage: 'framing',
    });
  });
  context.interviewPlan.questionSet = normalizedQuestionSet;

  const firstQuestion = normalizedQuestionSet[0];
  const totalQuestions = normalizedQuestionSet.length;
  const mode = context.controls.reasoningMode || 'classic_behavioral';
  const policy: AdaptivePolicy = {
    ...DEFAULT_ADAPTIVE_POLICY,
    maxTurns: Math.min(12, Math.max(totalQuestions, context.controls.difficulty === 'expert' ? 10 : 8)),
  };

  const modePolicy = getModePolicy(mode);
  const activeDims = ACTIVE_DIMENSIONS_BY_MODE[mode] || ACTIVE_DIMENSIONS_BY_MODE.classic_behavioral;

  const initialDimensionState: Record<string, any> = {};
  for (const d of activeDims) {
    initialDimensionState[d] = {
      active: true,
      observations: [],
      distinctTurnIds: [],
      distinctStages: [],
      hasChallengeEvidence: false,
      anchorScore: null,
      normalizedScore: null,
      confidence: 'low',
      trajectory: 'insufficient_evidence',
    };
  }

  const openingMessage = `Welcome to your MockMate interview. Reasoning mode: '${mode}'. We will cover ${totalQuestions} core scenarios through adaptive exploration.`;

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
      engine_version: 'v2',
      session_version: 1,
      current_root_question_index: 0,
      current_turn_index: 0,
      current_stage: modePolicy.stageSequence[0] || 'framing',
      pending_question_kind: 'root',
      active_root_question_id: firstQuestion.id,
      probe_count_for_root: 0,
      challenge_count: 0,
      adaptive_policy: policy,
      dimension_state: initialDimensionState,
      pending_question_id: firstQuestion.id,
      pending_question: firstQuestion,
      evaluation_status: 'not_tested',
      totalQuestions,
    };
    fallbackSessions.set(id, session);
    return {
      sessionId: id,
      openingMessage,
      firstQuestion,
      questionIndex: 0,
      totalQuestions,
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
      engine_version: 'v2',
      session_version: 1,
      current_root_question_index: 0,
      current_turn_index: 0,
      current_stage: modePolicy.stageSequence[0] || 'framing',
      pending_question_kind: 'root',
      active_root_question_id: firstQuestion.id,
      probe_count_for_root: 0,
      challenge_count: 0,
      adaptive_policy: policy,
      dimension_state: initialDimensionState,
      pending_question_id: firstQuestion.id,
      pending_question: firstQuestion,
      evaluation_status: 'not_tested',
    })
    .select('*')
    .single();

  if (error) throw error;
  return {
    sessionId: data.id,
    openingMessage,
    firstQuestion,
    questionIndex: 0,
    totalQuestions,
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

export const submitAdaptiveTurn = async (
  userId: string,
  sessionId: string,
  questionId: string,
  expectedSessionVersion: number,
  clientSubmissionId: string,
  answerKind: 'answered' | 'skipped',
  answerText?: string
): Promise<AdaptiveAnswerSubmissionResponse> => {
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

  // Idempotency check for local in-memory fallback
  if (!supabaseAdmin) {
    const existingTurn = session.history.find((t: any) => t.clientSubmissionId === clientSubmissionId);
    if (existingTurn) {
      return {
        completedTurnId: existingTurn.id,
        sessionVersion: session.sessionVersion,
        evaluationStatus: existingTurn.evaluationStatus || 'evaluated',
        nextQuestion: session.pendingQuestion,
        nextAction: existingTurn.controllerDecision?.action || 'advance_root_question',
        challengeEvent: existingTurn.challengeEvent,
        isSessionComplete: session.status === 'awaiting_report',
        rootQuestionIndex: session.currentQuestionIndex,
        rootQuestionCount: session.context?.interviewPlan?.questionSet?.length || 1,
        turnIndex: session.currentTurnIndex,
        maxTurns: session.adaptivePolicy.maxTurns,
        stage: session.currentStage,
      };
    }
  }

  if (session.pendingQuestionId !== questionId || session.sessionVersion !== expectedSessionVersion) {
    const err: any = new Error(`Stale or mismatched question submission (expected version: ${session.sessionVersion}, got: ${expectedSessionVersion})`);
    err.status = 409;
    throw err;
  }

  const mode: ReasoningMode = session.context?.controls?.reasoningMode || 'classic_behavioral';
  const currentQuestion: QuestionBlueprint = session.pendingQuestion;
  const textToSave = answerKind === 'skipped' ? '[Question Skipped]' : (answerText || '');

  // 1. Evaluate candidate answer
  const turnEval = await turnEvaluatorService.evaluateCandidateTurn(currentQuestion, textToSave, mode, session.currentStage);

  // 2. Prepare controller input
  const allRoots: QuestionBlueprint[] = session.context?.interviewPlan?.questionSet || [];
  const remainingRoots = allRoots.slice(session.currentQuestionIndex + 1);

  const currentState: AdaptiveSessionState = {
    engineVersion: 'v2',
    sessionVersion: session.sessionVersion,
    currentRootQuestionIndex: session.currentQuestionIndex,
    currentTurnIndex: session.currentTurnIndex,
    currentStage: session.currentStage,
    pendingQuestionKind: session.pendingQuestionKind,
    activeRootQuestionId: session.activeRootQuestionId || currentQuestion.id,
    probeCountForRoot: session.probeCountForRoot,
    challengeCount: session.challengeCount,
    adaptivePolicy: session.adaptivePolicy,
    dimensionState: session.dimensionState,
  };

  // 3. Compute adaptive decision
  const decision = computeAdaptiveDecision({
    mode,
    state: currentState,
    currentQuestion,
    evaluation: turnEval,
    remainingRootQuestions: remainingRoots,
  });

  // 4. Build next question
  const { nextQuestion, challengeEvent } = constructNextQuestion({
    action: decision.action,
    rationale: decision.rationale,
    nextQuestionKind: decision.nextQuestionKind,
    targetStage: decision.targetStage,
    challengeType: decision.challengeType,
  }, {
    mode,
    state: currentState,
    currentQuestion,
    evaluation: turnEval,
    remainingRootQuestions: remainingRoots,
  });

  // Calculate new state counters
  let nextRootIndex = session.currentQuestionIndex;
  let nextProbeCount = session.probeCountForRoot;
  let nextChallengeCount = session.challengeCount;

  if (decision.action === 'ask_probe') {
    nextProbeCount += 1;
  } else if (decision.action === 'introduce_challenge') {
    nextChallengeCount += 1;
  } else if (decision.action === 'advance_root_question') {
    nextRootIndex += 1;
    nextProbeCount = 0;
  }

  const isComplete = decision.action === 'complete_session' || (nextQuestion === null && decision.action !== 'ask_probe' && decision.action !== 'introduce_challenge');
  const nextStage = decision.targetStage;
  const nextKind = decision.nextQuestionKind;
  const totalRoots = allRoots.length;

  // 5. Update local in-memory session if no Supabase DB
  if (!supabaseAdmin) {
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const turn = {
      id: turnId,
      interviewer: currentQuestion.personaFocus || 'Interviewer',
      question: currentQuestion.question,
      candidateResponse: textToSave,
      timestamp: Date.now(),
      questionBlueprint: currentQuestion,
      questionKind: currentQuestion.questionKind || 'root',
      stage: session.currentStage,
      evaluationStatus: turnEval.evaluationStatus,
      turnEvaluation: turnEval,
      controllerDecision: decision,
      challengeEvent,
      clientSubmissionId,
    };

    session.history.push(turn);
    session.sessionVersion += 1;
    session.currentTurnIndex += 1;
    session.currentQuestionIndex = nextRootIndex;
    session.currentStage = nextStage;
    session.pendingQuestionKind = nextKind;
    session.pendingQuestion = nextQuestion;
    session.pendingQuestionId = nextQuestion?.id || null;
    session.probeCountForRoot = nextProbeCount;
    session.challengeCount = nextChallengeCount;
    if (isComplete) session.status = 'awaiting_report';
    session.updatedAt = new Date().toISOString();
    fallbackSessions.set(sessionId, session);

    const coachFeedback = session.context?.controls?.deliveryMode === 'coach' ? {
      strength: turnEval.observations.find(o => typeof o.anchorScore === 'number' && o.anchorScore >= 3)?.signal || 'Structured communication observed.',
      nextFocus: turnEval.missingSignals[0] || 'Focus on stating key assumptions explicitly.',
    } : undefined;

    return {
      completedTurnId: turnId,
      sessionVersion: session.sessionVersion,
      evaluationStatus: turnEval.evaluationStatus,
      nextQuestion,
      nextAction: decision.action,
      challengeEvent,
      isSessionComplete: isComplete,
      rootQuestionIndex: nextRootIndex,
      rootQuestionCount: totalRoots,
      turnIndex: session.currentTurnIndex,
      maxTurns: session.adaptivePolicy.maxTurns,
      stage: nextStage,
      coachFeedback,
    };
  }

  // 6. Invoke atomic_submit_adaptive_turn RPC in Supabase
  const { data, error } = await supabaseAdmin.rpc('atomic_submit_adaptive_turn', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_client_submission_id: clientSubmissionId,
    p_question_id: questionId,
    p_expected_session_version: expectedSessionVersion,
    p_answer_kind: answerKind,
    p_answer_text: textToSave,
    p_turn_evaluation: turnEval,
    p_controller_decision: decision,
    p_challenge_event: challengeEvent || null,
    p_dimension_state: session.dimensionState,
    p_next_question_json: nextQuestion,
    p_next_question_id: nextQuestion?.id || null,
    p_next_stage: nextStage,
    p_next_kind: nextKind,
    p_next_root_index: nextRootIndex,
    p_probe_count: nextProbeCount,
    p_challenge_count: nextChallengeCount,
    p_is_complete: isComplete,
    p_max_turns: session.adaptivePolicy.maxTurns,
    p_total_roots: totalRoots,
  });

  if (error) {
    const err: any = new Error(`Atomic adaptive submit failed: ${error.message}`);
    err.status = 409;
    throw err;
  }

  const coachFeedback = session.context?.controls?.deliveryMode === 'coach' ? {
    strength: turnEval.observations.find(o => typeof o.anchorScore === 'number' && o.anchorScore >= 3)?.signal || 'Structured communication observed.',
    nextFocus: turnEval.missingSignals[0] || 'Focus on stating key assumptions explicitly.',
  } : undefined;

  return {
    completedTurnId: data.completedTurnId,
    sessionVersion: data.sessionVersion,
    evaluationStatus: data.evaluationStatus,
    nextQuestion: data.nextQuestion ? normalizeQuestionBlueprint(data.nextQuestion) : null,
    nextAction: data.nextAction,
    challengeEvent: data.challengeEvent || undefined,
    isSessionComplete: data.isSessionComplete,
    rootQuestionIndex: data.rootQuestionIndex,
    rootQuestionCount: data.rootQuestionCount,
    turnIndex: data.turnIndex,
    maxTurns: data.maxTurns,
    stage: data.stage as InterviewStage,
    coachFeedback,
  };
};

export const submitAnswer = async (
  userId: string,
  sessionId: string,
  questionId: string,
  expectedQuestionIndex: number,
  answerKind: 'answered' | 'skipped',
  answerText?: string,
  clientSubmissionId?: string
): Promise<AnswerSubmissionResponse> => {
  const session = await getSession(userId, sessionId);
  if (!session) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }

  if (session.currentQuestionIndex !== expectedQuestionIndex) {
    const err: any = new Error(`Stale or mismatched question index (expected: ${session.currentQuestionIndex}, got: ${expectedQuestionIndex})`);
    err.status = 409;
    throw err;
  }

  const subId = clientSubmissionId || `legacy_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const adaptiveRes = await submitAdaptiveTurn(
    userId,
    sessionId,
    questionId,
    session.sessionVersion,
    subId,
    answerKind,
    answerText
  );

  return {
    completedTurnId: adaptiveRes.completedTurnId,
    nextQuestion: adaptiveRes.nextQuestion,
    isLastQuestion: adaptiveRes.isSessionComplete,
    questionIndex: adaptiveRes.rootQuestionIndex,
    totalQuestions: adaptiveRes.rootQuestionCount,
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
