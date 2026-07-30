import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin';
import {
  InterviewSessionContext,
  InterviewTurn,
  FinalReport,
  InterviewSessionStartResponse,
  AnswerSubmissionResponse,
  AdaptiveAnswerSubmissionResponse,
  AdaptiveAnswerSubmissionResponseSchema,
  AdaptivePolicy,
  DEFAULT_ADAPTIVE_POLICY,
  AdaptiveSessionState,
  QuestionBlueprint,
  normalizeQuestionBlueprint,
  ReasoningMode,
  InterviewStage,
  QuestionKind,
  normalizeAnswerText,
} from 'mockmate-shared';
import * as turnEvaluatorService from './turnEvaluatorService';
import { computeAdaptiveDecision, constructNextQuestion } from './adaptiveInterviewController';
import { aggregateTurnEvidence, toEvidenceTurn } from './evidenceAggregationService';
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
        requestHash: turn.adaptive_request_hash || undefined,
        adaptiveResponse: turn.adaptive_response || undefined,
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
    engineVersion: row.engineVersion || row.engine_version || 'v2',
    sessionVersion: row.sessionVersion ?? row.session_version ?? 1,
    currentQuestionIndex: row.currentQuestionIndex ?? row.current_root_question_index ?? row.current_question_index ?? 0,
    currentTurnIndex: row.currentTurnIndex ?? row.current_turn_index ?? 0,
    currentStage: row.currentStage || row.current_stage || 'framing',
    pendingQuestionKind: row.pendingQuestionKind || row.pending_question_kind || 'root',
    activeRootQuestionId: row.activeRootQuestionId || row.active_root_question_id || null,
    probeCountForRoot: row.probeCountForRoot ?? row.probe_count_for_root ?? 0,
    challengeCount: row.challengeCount ?? row.challenge_count ?? 0,
    challengeAnsweredForRoot: row.challengeAnsweredForRoot ?? row.challenge_answered_for_root ?? false,
    reflectionCompletedForRoot: row.reflectionCompletedForRoot ?? row.reflection_completed_for_root ?? false,
    finalReflectionAsked: row.finalReflectionAsked ?? row.final_reflection_asked ?? false,
    adaptivePolicy: policy,
    dimensionState: row.dimensionState || row.dimension_state || {},
    pendingQuestionId: row.pendingQuestionId ?? row.pending_question_id ?? null,
    pendingQuestion: row.pendingQuestion ? normalizeQuestionBlueprint(row.pendingQuestion) : (row.pending_question ? normalizeQuestionBlueprint(row.pending_question) : null),
    evaluationStatus: row.evaluationStatus ?? row.evaluation_status ?? 'not_tested',
    evaluationErrorCode: row.evaluationErrorCode ?? row.evaluation_error_code ?? null,
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
      engineVersion: 'v2',
      engine_version: 'v2',
      sessionVersion: 1,
      session_version: 1,
      currentQuestionIndex: 0,
      current_root_question_index: 0,
      currentTurnIndex: 0,
      current_turn_index: 0,
      currentStage: modePolicy.stageSequence[0] || 'framing',
      current_stage: modePolicy.stageSequence[0] || 'framing',
      pendingQuestionKind: 'root',
      pending_question_kind: 'root',
      activeRootQuestionId: firstQuestion.id,
      active_root_question_id: firstQuestion.id,
      probeCountForRoot: 0,
      probe_count_for_root: 0,
      challengeCount: 0,
      challenge_count: 0,
      challengeAnsweredForRoot: false,
      reflectionCompletedForRoot: false,
      finalReflectionAsked: false,
      adaptivePolicy: policy,
      adaptive_policy: policy,
      dimensionState: initialDimensionState,
      dimension_state: initialDimensionState,
      pendingQuestionId: firstQuestion.id,
      pending_question_id: firstQuestion.id,
      pendingQuestion: firstQuestion,
      pending_question: firstQuestion,
      evaluationStatus: 'not_tested',
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
      challenge_answered_for_root: false,
      reflection_completed_for_root: false,
      final_reflection_asked: false,
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
  answerKind: 'answered' | 'skipped' = 'answered',
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

  const incomingHash = crypto.createHash('md5').update(`${sessionId}:${questionId}:${answerKind}:${normalizeAnswerText(answerText)}`).digest('hex');

  // Idempotency check for local in-memory fallback
  if (!supabaseAdmin) {
    const existingTurn = session.history.find((t: any) => t.clientSubmissionId === clientSubmissionId);
    if (existingTurn) {
      if (existingTurn.requestHash && existingTurn.requestHash !== incomingHash) {
        const err: any = new Error('Conflict: client_submission_id reuse with mismatched payload');
        err.status = 409;
        throw err;
      }
      if (existingTurn.adaptiveResponse) {
        return existingTurn.adaptiveResponse;
      }
    }
  }

  if (
    session.pendingQuestionId !== questionId ||
    session.sessionVersion !== expectedSessionVersion
  ) {
    const err: any = new Error(`Stale or mismatched question submission (expected question: '${session.pendingQuestionId}', got: '${questionId}')`);
    err.status = 409;
    throw err;
  }

  const mode: ReasoningMode = session.context?.controls?.reasoningMode || 'classic_behavioral';
  const currentQuestion: QuestionBlueprint = session.pendingQuestion;
  const textToSave = answerKind === 'skipped' ? '[Question Skipped]' : (answerText || '');
  const serverTurnId = crypto.randomUUID();

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
    reflectionCompletedForRoot: session.reflectionCompletedForRoot,
    finalReflectionAsked: session.finalReflectionAsked,
    challengeAnsweredForRoot: session.challengeAnsweredForRoot,
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
    answerKind,
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
    answerKind,
  }, undefined, serverTurnId);

  // Calculate new state counters and flags
  let nextRootIndex = session.currentQuestionIndex;
  let nextProbeCount = session.probeCountForRoot;
  let nextChallengeCount = session.challengeCount;
  let nextChallengeAnswered = session.challengeAnsweredForRoot || false;
  let nextReflectionCompleted = session.reflectionCompletedForRoot || false;
  let nextFinalReflectionAsked = session.finalReflectionAsked || false;

  const currentKind = currentQuestion.questionKind || 'root';

  if (currentKind === 'challenge') {
    nextChallengeAnswered = true;
  } else if (currentKind === 'reflection') {
    nextReflectionCompleted = true;
  }

  if (decision.action === 'ask_probe') {
    nextProbeCount += 1;
  } else if (decision.action === 'introduce_challenge') {
    nextChallengeCount += 1;
  } else if (decision.action === 'ask_reflection') {
    if (remainingRoots.length === 0 && (nextQuestion?.questionKind === 'reflection' || decision.nextQuestionKind === 'reflection')) {
      nextFinalReflectionAsked = true;
    } else {
      nextReflectionCompleted = false;
    }
  } else if (decision.action === 'advance_root_question') {
    nextRootIndex += 1;
    nextProbeCount = 0;
    nextChallengeAnswered = false;
    nextReflectionCompleted = false;
  }

  const isComplete = decision.action === 'complete_session' || (nextQuestion === null && decision.action !== 'ask_probe' && decision.action !== 'introduce_challenge');
  const nextStage = decision.targetStage;
  const nextKind = decision.nextQuestionKind;
  const totalRoots = allRoots.length;

  // 5. Adapt evidence turns cleanly using toEvidenceTurn
  const historyEvidenceTurns = (session.history || [])
    .map(toEvidenceTurn)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const currentEvidenceTurn = toEvidenceTurn({
    turnId: serverTurnId,
    turnEvaluation: turnEval,
    stage: session.currentStage,
    questionKind: currentKind,
  });

  const allEvidenceTurns = currentEvidenceTurn ? [...historyEvidenceTurns, currentEvidenceTurn] : historyEvidenceTurns;
  const { dimensionStates: updatedDimensionState } = aggregateTurnEvidence(allEvidenceTurns, mode);

  // 6. Truthful coach feedback (no filler defaults!)
  let coachFeedback: { strength?: string; nextFocus?: string } | undefined = undefined;
  if (session.context?.controls?.deliveryMode === 'coach') {
    const strengthObs = turnEval.observations.find(o => typeof o.anchorScore === 'number' && o.anchorScore >= 3 && o.signal?.trim());
    const strength = strengthObs ? strengthObs.signal.trim() : undefined;
    const nextFocus = (turnEval.missingSignals && turnEval.missingSignals.length > 0 && turnEval.missingSignals[0].trim())
      ? turnEval.missingSignals[0].trim()
      : undefined;

    if (strength || nextFocus) {
      coachFeedback = {
        ...(strength ? { strength } : {}),
        ...(nextFocus ? { nextFocus } : {}),
      };
    }
  }

  const responsePayload: AdaptiveAnswerSubmissionResponse & { isLastQuestion?: boolean; questionIndex?: number } = {
    completedTurnId: serverTurnId,
    sessionVersion: session.sessionVersion + 1,
    evaluationStatus: turnEval.evaluationStatus,
    nextQuestion,
    nextAction: decision.action,
    challengeEvent: challengeEvent || undefined,
    isSessionComplete: isComplete,
    isLastQuestion: isComplete,
    questionIndex: nextRootIndex,
    rootQuestionIndex: nextRootIndex,
    rootQuestionCount: totalRoots,
    turnIndex: session.currentTurnIndex + 1,
    maxTurns: session.adaptivePolicy.maxTurns,
    stage: nextStage,
    coachFeedback,
  };

  // 7. Update local in-memory session if no Supabase DB
  if (!supabaseAdmin) {
    const turn = {
      id: serverTurnId,
      interviewer: currentQuestion.personaFocus || 'Interviewer',
      question: currentQuestion.question,
      candidateResponse: textToSave,
      timestamp: Date.now(),
      questionBlueprint: currentQuestion,
      questionKind: currentKind,
      stage: session.currentStage,
      evaluationStatus: turnEval.evaluationStatus,
      turnEvaluation: turnEval,
      controllerDecision: decision,
      challengeEvent,
      clientSubmissionId,
      requestHash: incomingHash,
      adaptiveResponse: responsePayload,
    };

    session.history.push(turn);
    session.sessionVersion = session.sessionVersion + 1;
    session.session_version = session.sessionVersion;
    session.currentTurnIndex = session.currentTurnIndex + 1;
    session.current_turn_index = session.currentTurnIndex;
    session.currentQuestionIndex = nextRootIndex;
    session.current_root_question_index = nextRootIndex;
    session.current_question_index = nextRootIndex;
    session.currentStage = nextStage;
    session.current_stage = nextStage;
    session.pendingQuestionKind = nextKind;
    session.pending_question_kind = nextKind;
    session.pendingQuestion = nextQuestion;
    session.pending_question = nextQuestion;
    session.pendingQuestionId = nextQuestion?.id || null;
    session.pending_question_id = nextQuestion?.id || null;
    session.probeCountForRoot = nextProbeCount;
    session.probe_count_for_root = nextProbeCount;
    session.challengeCount = nextChallengeCount;
    session.challenge_count = nextChallengeCount;
    session.challengeAnsweredForRoot = nextChallengeAnswered;
    session.reflectionCompletedForRoot = nextReflectionCompleted;
    session.finalReflectionAsked = nextFinalReflectionAsked;
    session.dimensionState = updatedDimensionState;
    session.dimension_state = updatedDimensionState;
    if (isComplete) session.status = 'awaiting_report';
    session.updatedAt = new Date().toISOString();
    fallbackSessions.set(sessionId, session);

    return responsePayload;
  }

  // 8. Invoke atomic_submit_adaptive_turn RPC in Supabase
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
    p_dimension_state: updatedDimensionState,
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
    p_challenge_answered_for_root: nextChallengeAnswered,
    p_reflection_completed_for_root: nextReflectionCompleted,
    p_final_reflection_asked: nextFinalReflectionAsked,
    p_turn_id: serverTurnId,
    p_adaptive_response: responsePayload,
  });

  if (error) {
    if (error.message.includes('Idempotency conflict')) {
      const err: any = new Error('Conflict: client_submission_id reuse with mismatched payload');
      err.status = 409;
      throw err;
    }
    if (error.message.includes('Stale or mismatched')) {
      const err: any = new Error(`Stale or mismatched question submission (expected question: '${session.pendingQuestionId}', got: '${questionId}')`);
      err.status = 409;
      throw err;
    }
    const err: any = new Error(`Atomic adaptive submit failed: ${error.message}`);
    err.status = 409;
    throw err;
  }

  return AdaptiveAnswerSubmissionResponseSchema.parse(data);
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
