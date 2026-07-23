import {
  AdaptiveControllerDecision,
  AdaptiveSessionState,
  TurnEvaluation,
  QuestionBlueprint,
  ReasoningMode,
  InterviewStage,
  QuestionKind,
  ChallengeEventType,
  ChallengeEvent,
  AdaptiveControllerDecisionSchema,
  normalizeQuestionBlueprint,
} from 'mockmate-shared';
import { getModePolicy } from '../config/modePolicies';

export interface AdaptiveControllerInput {
  mode: ReasoningMode;
  state: AdaptiveSessionState;
  currentQuestion: QuestionBlueprint;
  evaluation: TurnEvaluation;
  remainingRootQuestions: QuestionBlueprint[];
}

export function computeAdaptiveDecision(input: AdaptiveControllerInput): AdaptiveControllerDecision {
  const { mode, state, currentQuestion, evaluation, remainingRootQuestions } = input;
  const policy = getModePolicy(mode);

  const nextTurnIndex = state.currentTurnIndex + 1;
  const isMaxTurnsReached = nextTurnIndex >= state.adaptivePolicy.maxTurns;
  const currentKind = currentQuestion.questionKind || 'root';
  const hasRemainingRoots = remainingRootQuestions.length > 0;

  // Rule 1: Max turn budget reached
  if (isMaxTurnsReached) {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'complete_session',
      rationale: `Maximum turn budget of ${state.adaptivePolicy.maxTurns} reached. Completing session.`,
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 2: Skipped answer
  if (evaluation.answerSummary?.includes('skipped')) {
    if (hasRemainingRoots) {
      return AdaptiveControllerDecisionSchema.parse({
        action: 'advance_root_question',
        rationale: 'Question was skipped. Advancing to the next root question.',
        nextQuestionKind: 'root',
        targetStage: policy.stageSequence[0] || 'framing',
      });
    }
    return AdaptiveControllerDecisionSchema.parse({
      action: 'complete_session',
      rationale: 'Final question skipped. Completing interview session.',
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 3: Evaluation unavailable
  if (evaluation.evaluationStatus === 'unavailable') {
    if (hasRemainingRoots) {
      return AdaptiveControllerDecisionSchema.parse({
        action: 'advance_root_question',
        rationale: 'Evaluation provider unavailable. Advancing to next root question.',
        nextQuestionKind: 'root',
        targetStage: policy.stageSequence[0] || 'framing',
      });
    }
    return AdaptiveControllerDecisionSchema.parse({
      action: 'complete_session',
      rationale: 'Evaluation provider unavailable and root questions completed.',
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 4: Probe budget check if missing signals exist and probes allowed
  const hasMissingSignals = evaluation.evaluationStatus === 'evaluated' && evaluation.missingSignals.length > 0;
  const canProbe = state.probeCountForRoot < state.adaptivePolicy.maxProbesPerRoot && state.probeCountForRoot < policy.maxProbesPerRoot;
  if (hasMissingSignals && canProbe && currentKind === 'root') {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'ask_probe',
      rationale: `Missing expected signals (${evaluation.missingSignals.slice(0, 2).join(', ')}). Issuing targeted probe.`,
      nextQuestionKind: 'probe',
      targetStage: 'exploration',
    });
  }

  // Rule 5: Challenge budget check if initial reasoning exists and stage allows challenge
  const hasGoodReasoning = evaluation.observations.some(o => typeof o.anchorScore === 'number' && o.anchorScore >= 2);
  const canChallenge = state.challengeCount < state.adaptivePolicy.maxChallenges && state.challengeCount < policy.maxChallenges;
  const isChallengeStageAllowed = policy.allowedChallengeTypes.length > 0;
  if (hasGoodReasoning && canChallenge && isChallengeStageAllowed && currentKind !== 'challenge') {
    const selectedChallengeType: ChallengeEventType = policy.allowedChallengeTypes[state.challengeCount % policy.allowedChallengeTypes.length];
    return AdaptiveControllerDecisionSchema.parse({
      action: 'introduce_challenge',
      rationale: `Sufficient initial reasoning demonstrated. Introducing mode challenge: ${selectedChallengeType}.`,
      nextQuestionKind: 'challenge',
      targetStage: 'challenge',
      challengeType: selectedChallengeType,
    });
  }

  // Rule 6: Reflection after challenge
  if (currentKind === 'challenge') {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'ask_reflection',
      rationale: 'Challenge event answered. Asking reflection and recovery probe.',
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 7: Advance root question or complete
  if (hasRemainingRoots) {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'advance_root_question',
      rationale: 'Root question progression criteria met. Advancing to next scenario.',
      nextQuestionKind: 'root',
      targetStage: policy.stageSequence[0] || 'framing',
    });
  }

  // Rule 8: Final reflection if required and budget allows
  if (policy.completionRules.requireReflection && currentKind !== 'reflection') {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'ask_reflection',
      rationale: 'All root questions completed. Requesting final session reflection.',
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 9: Default complete
  return AdaptiveControllerDecisionSchema.parse({
    action: 'complete_session',
    rationale: 'All root questions and reflections complete.',
    nextQuestionKind: 'reflection',
    targetStage: 'reflection',
  });
}

export function constructNextQuestion(
  decision: AdaptiveControllerDecision,
  input: AdaptiveControllerInput,
  challengeDraft?: ChallengeEvent
): { nextQuestion: QuestionBlueprint | null; challengeEvent?: ChallengeEvent } {
  const { mode, state, currentQuestion, evaluation, remainingRootQuestions } = input;
  const policy = getModePolicy(mode);

  if (decision.action === 'complete_session') {
    return { nextQuestion: null };
  }

  if (decision.action === 'ask_probe') {
    const probeText = evaluation.recommendedProbe || policy.deterministicFallbackPrompts.probe || `Could you clarify your core assumption and decision criteria for ${currentQuestion.question}?`;
    const nextQ = normalizeQuestionBlueprint({
      id: `probe_${state.activeRootQuestionId}_${state.probeCountForRoot + 1}`,
      questionKind: 'probe',
      rootQuestionId: state.activeRootQuestionId,
      stage: 'exploration',
      question: probeText,
      expectedSignals: evaluation.missingSignals.length ? evaluation.missingSignals : ['Clarification', 'Evidence'],
      targetDimensions: policy.activeDimensions,
      personaFocus: currentQuestion.personaFocus,
      difficulty: currentQuestion.difficulty,
    });
    return { nextQuestion: nextQ };
  }

  if (decision.action === 'introduce_challenge') {
    const challengeType = decision.challengeType || policy.allowedChallengeTypes[0] || 'counterargument';
    const challengeId = `ch_${state.activeRootQuestionId}_${state.challengeCount + 1}`;
    const prompt = challengeDraft?.prompt || policy.deterministicFallbackPrompts.challenge || `Suppose a key constraint changes or a stakeholder pushes back on your solution. How do you adapt?`;

    const challengeEvent: ChallengeEvent = {
      id: challengeId,
      type: challengeType,
      prompt,
      rationale: challengeDraft?.rationale || `Testing candidate resilience under ${challengeType}`,
      targetDimensions: policy.activeDimensions,
      triggeringTurnId: `turn_${state.currentTurnIndex}`,
      triggeringEvidence: evaluation.observations[0]?.evidenceExcerpt || currentQuestion.question,
      stage: 'challenge',
      severity: 'medium',
    };

    const nextQ = normalizeQuestionBlueprint({
      id: challengeId,
      questionKind: 'challenge',
      rootQuestionId: state.activeRootQuestionId,
      stage: 'challenge',
      question: prompt,
      expectedSignals: ['Composure under pushback', 'Position updating', 'Trade-off justification'],
      targetDimensions: policy.activeDimensions,
      personaFocus: currentQuestion.personaFocus,
      difficulty: currentQuestion.difficulty,
      challengeEventId: challengeId,
    });

    return { nextQuestion: nextQ, challengeEvent };
  }

  if (decision.action === 'ask_reflection') {
    const prompt = policy.deterministicFallbackPrompts.reflection || `Looking back at this scenario, what assumption proved most uncertain and how would you verify it next time?`;
    const nextQ = normalizeQuestionBlueprint({
      id: `refl_${state.activeRootQuestionId}_${Date.now().toString(36)}`,
      questionKind: 'reflection',
      rootQuestionId: state.activeRootQuestionId,
      stage: 'reflection',
      question: prompt,
      expectedSignals: ['Self-reflection', 'Intellectual honesty', 'Growth mindset'],
      targetDimensions: policy.activeDimensions,
      personaFocus: currentQuestion.personaFocus,
      difficulty: currentQuestion.difficulty,
    });
    return { nextQuestion: nextQ };
  }

  // Advance root question
  if (remainingRootQuestions.length > 0) {
    const nextRoot = remainingRootQuestions[0];
    const normalized = normalizeQuestionBlueprint({
      ...nextRoot,
      questionKind: 'root',
      rootQuestionId: nextRoot.id,
      stage: policy.stageSequence[0] || 'framing',
    });
    return { nextQuestion: normalized };
  }

  return { nextQuestion: null };
}
