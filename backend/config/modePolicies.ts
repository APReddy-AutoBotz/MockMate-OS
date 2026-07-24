import {
  ReasoningMode,
  DimensionKey,
  InterviewStage,
  ChallengeEventType,
  QuestionKind,
} from 'mockmate-shared';

export interface ModePolicy {
  mode: ReasoningMode;
  activeDimensions: DimensionKey[];
  stageSequence: InterviewStage[];
  requiredSignalsPerStage: Partial<Record<InterviewStage, string[]>>;
  allowedChallengeTypes: ChallengeEventType[];
  maxProbesPerRoot: number;
  maxChallenges: number;
  completionRules: {
    requireReflection: boolean;
    maxTurnsCap: number;
  };
  deterministicFallbackPrompts: Partial<Record<QuestionKind, string>>;
}

export const ADAPTIVE_CONTROLLER_VERSION = 'mockmate_adaptive_controller_v1';

export const MODE_POLICIES: Record<ReasoningMode, ModePolicy> = {
  classic_behavioral: {
    mode: 'classic_behavioral',
    activeDimensions: ['NARRATIVE_COHERENCE', 'STAKEHOLDER_FLUENCY', 'DECISION_QUALITY', 'INTELLECTUAL_HONESTY'],
    stageSequence: ['framing', 'exploration', 'decision', 'reflection'],
    requiredSignalsPerStage: {
      framing: ['situation_context', 'personal_responsibility'],
      exploration: ['action_taken', 'stakeholder_communication'],
      decision: ['result_evidence', 'decision_rationale'],
      reflection: ['self_reflection', 'key_takeaway'],
    },
    allowedChallengeTypes: ['stakeholder_pushback', 'evidence_request', 'counterargument'],
    maxProbesPerRoot: 1,
    maxChallenges: 2,
    completionRules: { requireReflection: true, maxTurnsCap: 8 },
    deterministicFallbackPrompts: {
      probe: 'What specific responsibility did you hold, and what evidence supported your choice?',
      challenge: 'Suppose a key stakeholder strongly objected to your approach. How would you handle their pushback?',
      reflection: 'Looking back on that outcome, what assumption proved wrong and what would you change next time?',
    },
  },

  classic_technical: {
    mode: 'classic_technical',
    activeDimensions: ['PROBLEM_FRAMING', 'SYSTEMS_THINKING', 'TRADEOFF_CLARITY', 'DECISION_QUALITY', 'UNCERTAINTY_HANDLING'],
    stageSequence: ['clarification', 'framing', 'exploration', 'decision', 'reflection'],
    requiredSignalsPerStage: {
      clarification: ['clarifying_questions', 'boundary_definition'],
      framing: ['decomposition', 'component_breakdown'],
      exploration: ['option_comparison', 'tradeoff_analysis'],
      decision: ['testing_verification', 'failure_modes'],
      reflection: ['system_limits', 'architectural_reflection'],
    },
    allowedChallengeTypes: ['scale_change', 'constraint_change', 'risk_tradeoff', 'evidence_request'],
    maxProbesPerRoot: 2,
    maxChallenges: 2,
    completionRules: { requireReflection: true, maxTurnsCap: 10 },
    deterministicFallbackPrompts: {
      probe: 'What technical trade-offs or failure modes did you consider before finalizing this design?',
      challenge: 'Imagine system load increases by 100x overnight. Where does this architecture break first, and how do you adapt?',
      reflection: 'How would you test and verify your system boundaries under unexpected network partitioning?',
    },
  },

  narrative_reasoning: {
    mode: 'narrative_reasoning',
    activeDimensions: ['NARRATIVE_COHERENCE', 'INTELLECTUAL_HONESTY', 'STAKEHOLDER_FLUENCY', 'DECISION_QUALITY'],
    stageSequence: ['framing', 'exploration', 'decision', 'reflection'],
    requiredSignalsPerStage: {
      framing: ['central_thesis', 'context_setup'],
      exploration: ['reasoning_sequence', 'causality'],
      decision: ['supporting_evidence', 'conclusion'],
      reflection: ['honest_assessment', 'retrospective_learning'],
    },
    allowedChallengeTypes: ['counterargument', 'evidence_request', 'assumption_challenge'],
    maxProbesPerRoot: 1,
    maxChallenges: 2,
    completionRules: { requireReflection: true, maxTurnsCap: 8 },
    deterministicFallbackPrompts: {
      probe: 'What causal step connects your initial assumption to the final outcome you described?',
      challenge: 'Another engineer presents data contradicting your thesis. How do you evaluate their evidence?',
      reflection: 'What part of your narrative carries the highest uncertainty or relies on unverified assumptions?',
    },
  },

  problem_framing: {
    mode: 'problem_framing',
    activeDimensions: ['PROBLEM_FRAMING', 'SYSTEMS_THINKING', 'UNCERTAINTY_HANDLING', 'DECISION_QUALITY'],
    stageSequence: ['clarification', 'framing', 'exploration', 'decision', 'reflection'],
    requiredSignalsPerStage: {
      clarification: ['objective_clarification', 'stakeholder_identification'],
      framing: ['constraint_mapping', 'unknowns_inventory'],
      exploration: ['decomposition_strategy', 'assumption_testing'],
      decision: ['success_criteria', 'actionable_scope'],
      reflection: ['scope_retrospective', 'framing_lessons'],
    },
    allowedChallengeTypes: ['assumption_challenge', 'constraint_change', 'stakeholder_pushback'],
    maxProbesPerRoot: 2,
    maxChallenges: 2,
    completionRules: { requireReflection: true, maxTurnsCap: 9 },
    deterministicFallbackPrompts: {
      probe: 'What unstated assumptions are you making about system constraints or stakeholder priorities?',
      challenge: 'The business owner suddenly slashes your development timeline in half. How do you re-frame the problem scope?',
      reflection: 'If you had to start this framing exercise again, what key question would you ask first?',
    },
  },

  tradeoff_decision: {
    mode: 'tradeoff_decision',
    activeDimensions: ['TRADEOFF_CLARITY', 'DECISION_QUALITY', 'SYSTEMS_THINKING', 'UNCERTAINTY_HANDLING'],
    stageSequence: ['framing', 'exploration', 'decision', 'challenge', 'reflection'],
    requiredSignalsPerStage: {
      framing: ['option_space', 'decision_criteria'],
      exploration: ['explicit_sacrifices', 'cost_benefit_analysis'],
      decision: ['selected_path', 'risk_mitigation'],
      challenge: ['reversal_conditions', 'resilience'],
      reflection: ['tradeoff_retrospective', 'decision_audit'],
    },
    allowedChallengeTypes: ['constraint_change', 'risk_tradeoff', 'scale_change', 'counterargument'],
    maxProbesPerRoot: 1,
    maxChallenges: 3,
    completionRules: { requireReflection: true, maxTurnsCap: 10 },
    deterministicFallbackPrompts: {
      probe: 'What explicit sacrifice or negative side effect are you accepting with your preferred choice?',
      challenge: 'Suppose budget constraints rule out your primary option. What is your fallback decision and why?',
      reflection: 'Under what specific newly discovered evidence would you reverse this decision?',
    },
  },

  stakeholder_pressure: {
    mode: 'stakeholder_pressure',
    activeDimensions: ['STAKEHOLDER_FLUENCY', 'DECISION_QUALITY', 'RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY'],
    stageSequence: ['framing', 'decision', 'challenge', 'reflection'],
    requiredSignalsPerStage: {
      framing: ['initial_proposal', 'audience_awareness'],
      decision: ['empathy_acknowledgment', 'negotiation_boundary'],
      challenge: ['composure_under_pushback', 'adaptive_argumentation'],
      reflection: ['stakeholder_alignment_learning', 'communication_audit'],
    },
    allowedChallengeTypes: ['stakeholder_pushback', 'counterargument', 'constraint_change'],
    maxProbesPerRoot: 1,
    maxChallenges: 3,
    completionRules: { requireReflection: true, maxTurnsCap: 8 },
    deterministicFallbackPrompts: {
      probe: 'How do you communicate the risks of this decision to a non-technical executive?',
      challenge: 'The VP of Product rejects your technical timeline as unacceptable. How do you respond in the meeting?',
      reflection: 'How do you balance standing firm on technical integrity with remaining responsive to business pressure?',
    },
  },

  ai_collaboration_review: {
    mode: 'ai_collaboration_review',
    activeDimensions: ['AI_COLLABORATION', 'INTELLECTUAL_HONESTY', 'UNCERTAINTY_HANDLING', 'DECISION_QUALITY', 'SYSTEMS_THINKING'],
    stageSequence: ['clarification', 'framing', 'exploration', 'challenge', 'reflection'],
    requiredSignalsPerStage: {
      clarification: ['ai_output_inspection', 'flaw_detection'],
      framing: ['assumption_audit', 'hallucination_awareness'],
      exploration: ['verification_plan', 'risk_assessment'],
      decision: ['human_judgment_application', 'improved_approach'],
      reflection: ['trust_calibration_reflection', 'ai_usage_ethics'],
    },
    allowedChallengeTypes: ['ai_output_critique', 'risk_tradeoff', 'evidence_request'],
    maxProbesPerRoot: 2,
    maxChallenges: 2,
    completionRules: { requireReflection: true, maxTurnsCap: 9 },
    deterministicFallbackPrompts: {
      probe: 'What subtle flaw, edge-case bug, or hidden risk might exist in this AI-generated solution?',
      challenge: 'The AI output appears completely plausible but introduces a hidden data-race condition under high concurrency. How do you verify and catch it?',
      reflection: 'How do you calibrate your reliance on AI assistants when solving critical production incidents?',
    },
  },

  uncertainty_handling: {
    mode: 'uncertainty_handling',
    activeDimensions: ['UNCERTAINTY_HANDLING', 'INTELLECTUAL_HONESTY', 'PROBLEM_FRAMING', 'DECISION_QUALITY'],
    stageSequence: ['clarification', 'framing', 'exploration', 'decision', 'reflection'],
    requiredSignalsPerStage: {
      clarification: ['known_unknown_separation', 'fact_audit'],
      framing: ['confidence_calibration', 'bounded_assumptions'],
      exploration: ['information_request_strategy', 'reversible_next_steps'],
      decision: ['decision_threshold', 'risk_managed_progress'],
      reflection: ['uncertainty_retrospective', 'learning_loop'],
    },
    allowedChallengeTypes: ['constraint_change', 'evidence_request', 'assumption_challenge'],
    maxProbesPerRoot: 2,
    maxChallenges: 2,
    completionRules: { requireReflection: true, maxTurnsCap: 9 },
    deterministicFallbackPrompts: {
      probe: 'What specific missing information would increase your confidence before taking action?',
      challenge: 'New telemetry arrives that directly contradicts your initial diagnostic hypothesis. What is your immediate next step?',
      reflection: 'How do you decide when you have enough data to act versus when to continue gathering evidence?',
    },
  },

  adversarial_pushback: {
    mode: 'adversarial_pushback',
    activeDimensions: ['RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY', 'NARRATIVE_COHERENCE', 'DECISION_QUALITY'],
    stageSequence: ['framing', 'decision', 'challenge', 'reflection'],
    requiredSignalsPerStage: {
      framing: ['original_position', 'core_rationale'],
      decision: ['counterargument_evaluation', 'supporting_evidence'],
      challenge: ['repositioning_or_holding', 'logical_defense'],
      reflection: ['recovery_retrospective', 'composure_reflection'],
    },
    allowedChallengeTypes: ['counterargument', 'stakeholder_pushback', 'evidence_request'],
    maxProbesPerRoot: 1,
    maxChallenges: 3,
    completionRules: { requireReflection: true, maxTurnsCap: 8 },
    deterministicFallbackPrompts: {
      probe: 'What evidence justifies maintaining your position despite the opposing argument?',
      challenge: 'Your interviewer asserts that your proposed architecture is fundamentally unscalable. How do you defend or adapt your position without becoming defensive?',
      reflection: 'What did you learn about your own reasoning when confronted with direct pushback?',
    },
  },
};

export function getModePolicy(mode: ReasoningMode): ModePolicy {
  return MODE_POLICIES[mode] || MODE_POLICIES.classic_behavioral;
}
