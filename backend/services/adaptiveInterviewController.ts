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
  answerKind: 'answered' | 'skipped';
}

export function generateDeterministicQuestionId(
  rootId: string,
  kind: QuestionKind,
  stage: InterviewStage,
  prompt: string,
  seq: number
): string {
  const str = `${rootId}_${kind}_${stage}_${seq}_${prompt.slice(0, 30)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(36);
  return `${kind}_${rootId}_${hex}_${seq}`;
}

export function computeAdaptiveDecision(input: AdaptiveControllerInput): AdaptiveControllerDecision {
  const { mode, state, currentQuestion, evaluation, remainingRootQuestions, answerKind } = input;
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
      nextQuestionKind: null,
      targetStage: 'reflection',
    });
  }

  // Rule 2: Explicit skipped answer
  if (answerKind === 'skipped') {
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
      nextQuestionKind: null,
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
      nextQuestionKind: null,
      targetStage: 'reflection',
    });
  }

  // Lifecycle check: If current question was a reflection or challenge recovery, advance to next root or complete
  if (currentKind === 'reflection') {
    if (hasRemainingRoots) {
      return AdaptiveControllerDecisionSchema.parse({
        action: 'advance_root_question',
        rationale: 'Reflection turn completed for root scenario. Advancing to next root question.',
        nextQuestionKind: 'root',
        targetStage: policy.stageSequence[0] || 'framing',
      });
    }
    return AdaptiveControllerDecisionSchema.parse({
      action: 'complete_session',
      rationale: 'Final session reflection completed. Session complete.',
      nextQuestionKind: null,
      targetStage: 'reflection',
    });
  }

  // Lifecycle check: If current question was a challenge, request recovery/reflection
  if (currentKind === 'challenge') {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'ask_reflection',
      rationale: 'Challenge event answered. Asking reflection and recovery probe.',
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 4: Probe budget check if missing signals exist and probes allowed for current root
  const hasMissingSignals = evaluation.evaluationStatus === 'evaluated' && evaluation.missingSignals.length > 0;
  const canProbe =
    state.probeCountForRoot < state.adaptivePolicy.maxProbesPerRoot && state.probeCountForRoot < policy.maxProbesPerRoot;
  if (hasMissingSignals && canProbe && (currentKind === 'root' || currentKind === 'probe')) {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'ask_probe',
      rationale: `Missing expected signals (${evaluation.missingSignals.slice(0, 2).join(', ')}). Issuing targeted probe ${state.probeCountForRoot + 1}.`,
      nextQuestionKind: 'probe',
      targetStage: 'exploration',
    });
  }

  // Rule 5: Challenge budget check if initial reasoning exists, challenge allowed, and not already challenged for this root
  const hasGoodReasoning = evaluation.observations.some(o => typeof o.anchorScore === 'number' && o.anchorScore >= 2);
  const canChallenge =
    state.challengeCount < state.adaptivePolicy.maxChallenges && state.challengeCount < policy.maxChallenges;
  const isChallengeStageAllowed = policy.allowedChallengeTypes.length > 0;
  const alreadyChallengedForRoot = !!state.challengeAnsweredForRoot;

  if (
    hasGoodReasoning &&
    canChallenge &&
    isChallengeStageAllowed &&
    !alreadyChallengedForRoot &&
    (currentKind as string) !== 'challenge'
  ) {
    const selectedChallengeType: ChallengeEventType =
      policy.allowedChallengeTypes[state.challengeCount % policy.allowedChallengeTypes.length];
    return AdaptiveControllerDecisionSchema.parse({
      action: 'introduce_challenge',
      rationale: `Sufficient initial reasoning demonstrated. Introducing mode challenge: ${selectedChallengeType}.`,
      nextQuestionKind: 'challenge',
      targetStage: 'challenge',
      challengeType: selectedChallengeType,
    });
  }

  // Rule 6: Advance root question or complete
  if (hasRemainingRoots) {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'advance_root_question',
      rationale: 'Root question progression criteria met. Advancing to next scenario.',
      nextQuestionKind: 'root',
      targetStage: policy.stageSequence[0] || 'framing',
    });
  }

  // Rule 7: Final session reflection if required and not yet asked
  if (policy.completionRules.requireReflection && !state.finalReflectionAsked) {
    return AdaptiveControllerDecisionSchema.parse({
      action: 'ask_reflection',
      rationale: 'All root questions completed. Requesting final session reflection.',
      nextQuestionKind: 'reflection',
      targetStage: 'reflection',
    });
  }

  // Rule 8: Default complete
  return AdaptiveControllerDecisionSchema.parse({
    action: 'complete_session',
    rationale: 'All root questions and reflections complete.',
    nextQuestionKind: null,
    targetStage: 'reflection',
  });
}

export function constructNextQuestion(
  decision: AdaptiveControllerDecision,
  input: AdaptiveControllerInput,
  challengeDraft?: ChallengeEvent,
  triggeringTurnId?: string
): { nextQuestion: QuestionBlueprint | null; challengeEvent?: ChallengeEvent } {
  const { mode, state, currentQuestion, evaluation, remainingRootQuestions } = input;
  const policy = getModePolicy(mode);

  if (decision.action === 'complete_session') {
    return { nextQuestion: null };
  }

  if (decision.action === 'ask_probe') {
    const probeSeq = state.probeCountForRoot + 1;
    const probeText =
      evaluation.recommendedProbe ||
      policy.deterministicFallbackPrompts.probe ||
      `Could you clarify your core assumption and decision criteria for ${currentQuestion.question}?`;
    const qId = generateDeterministicQuestionId(
      state.activeRootQuestionId,
      'probe',
      'exploration',
      probeText,
      probeSeq
    );
    const nextQ = normalizeQuestionBlueprint({
      id: qId,
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
    const challengeSeq = state.challengeCount + 1;
    const prompt =
      challengeDraft?.prompt ||
      policy.deterministicFallbackPrompts.challenge ||
      `Suppose a key constraint changes or a stakeholder pushes back on your solution. How do you adapt?`;
    const challengeId = generateDeterministicQuestionId(
      state.activeRootQuestionId,
      'challenge',
      'challenge',
      prompt,
      challengeSeq
    );

    const firstObsExcerpt = evaluation.observations.find(o => o.evidenceExcerpt)?.evidenceExcerpt || null;
    const triggeringTurnUUID = triggeringTurnId || `turn_${state.currentTurnIndex}`;

    const challengeEvent: ChallengeEvent = {
      id: challengeId,
      type: challengeType,
      prompt,
      rationale: challengeDraft?.rationale || `Testing candidate resilience under ${challengeType}`,
      targetDimensions: policy.activeDimensions,
      triggeringTurnId: triggeringTurnUUID,
      triggeringEvidence: firstObsExcerpt,
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
    const reflSeq = state.currentTurnIndex + 1;
    const prompt =
      policy.deterministicFallbackPrompts.reflection ||
      `Looking back at this scenario, what assumption proved most uncertain and how would you verify it next time?`;
    const qId = generateDeterministicQuestionId(
      state.activeRootQuestionId,
      'reflection',
      'reflection',
      prompt,
      reflSeq
    );
    const nextQ = normalizeQuestionBlueprint({
      id: qId,
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
