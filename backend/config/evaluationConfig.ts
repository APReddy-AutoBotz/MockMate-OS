
/**
 * APPROVED EVALUATION DIMENSIONS AND SUB-SIGNALS
 * As per Mockmate Interview Framework v1.0
 */

export const APPROVED_DIMENSIONS = {
    PROBLEM_FRAMING: {
        name: 'Problem Framing',
        definition: 'How well the candidate defines the actual problem before rushing into a solution.',
        subSignals: [
            'clarifying_questions',
            'scope_definition',
            'assumption_identification',
            'constraint_identification',
            'risk_identification',
            'objective_alignment'
        ]
    },
    SYSTEMS_THINKING: {
        name: 'Systems Thinking',
        definition: 'How well the candidate understands the broader system, moving parts, dependencies, and downstream impact.',
        subSignals: [
            'dependency_awareness',
            'end_to_end_flow_thinking',
            'stakeholder_interconnections',
            'second_order_effects',
            'failure_mode_awareness',
            'scalability_consideration'
        ]
    },
    TRADEOFF_CLARITY: {
        name: 'Tradeoff Clarity',
        definition: 'How clearly the candidate compares options and explains what is gained, lost, prioritized, or sacrificed.',
        subSignals: [
            'option_comparison',
            'prioritization_logic',
            'cost_vs_speed_reasoning',
            'quality_vs_speed_reasoning',
            'simplicity_vs_scale_reasoning',
            'explicit_sacrifice_awareness'
        ]
    },
    UNCERTAINTY_HANDLING: {
        name: 'Uncertainty Handling',
        definition: 'How well the candidate operates when information is incomplete, messy, or ambiguous.',
        subSignals: [
            'known_unknown_separation',
            'bounded_assumption_making',
            'uncertainty_language',
            'information_request_quality',
            'next_step_under_ambiguity',
            'risk_managed_progress'
        ]
    },
    AI_COLLABORATION: {
        name: 'AI Collaboration',
        definition: 'How well the candidate works with AI-generated output critically, responsibly, and intelligently.',
        subSignals: [
            'output_review_quality',
            'flaw_detection',
            'hallucination_awareness',
            'missing_risk_detection',
            'improvement_reasoning',
            'trust_calibration'
        ]
    },
    STAKEHOLDER_FLUENCY: {
        name: 'Stakeholder Fluency',
        definition: 'How effectively the candidate explains decisions to different audiences with the right level of clarity, translation, and persuasion.',
        subSignals: [
            'audience_adaptation',
            'clarity_of_translation',
            'persuasion_under_tension',
            'executive_conciseness',
            'client_safe_language',
            'expectation_management'
        ]
    },
    DECISION_QUALITY: {
        name: 'Decision Quality',
        definition: 'How sound, practical, and defensible the candidate’s choices are.',
        subSignals: [
            'recommendation_quality',
            'criteria_based_choice',
            'practicality_of_path',
            'alignment_to_goal',
            'judgment_under_constraints',
            'actionability'
        ]
    },
    INTELLECTUAL_HONESTY: {
        name: 'Intellectual Honesty',
        definition: 'How truthfully and maturely the candidate handles limits in knowledge, reasoning, and confidence.',
        subSignals: [
            'bluff_avoidance',
            'assumption_transparency',
            'confidence_calibration',
            'evidence_respect',
            'limit_acknowledgment',
            'honest_revision'
        ]
    },
    RECOVERY_QUALITY: {
        name: 'Recovery Quality',
        definition: 'How well the candidate responds after pushback, challenge, confusion, or an initially weak answer.',
        subSignals: [
            'composure_after_pushback',
            'revision_quality',
            'responsiveness_to_feedback',
            'adaptive_reasoning',
            'mistake_correction',
            'learning_in_motion'
        ]
    },
    NARRATIVE_COHERENCE: {
        name: 'Narrative Coherence',
        definition: 'How clearly and logically the candidate tells the story of a project, decision, challenge, or experience.',
        subSignals: [
            'structure_of_explanation',
            'chronology_control',
            'relevance_filtering',
            'decision_storytelling',
            'outcome_connection',
            'reflection_clarity'
        ]
    }
} as const;

export type DimensionKey = keyof typeof APPROVED_DIMENSIONS;

// Approved Mode Matrix v1.1
export const ACTIVE_DIMENSIONS_BY_MODE: Record<string, DimensionKey[]> = {
    classic_behavioral: ['NARRATIVE_COHERENCE', 'STAKEHOLDER_FLUENCY', 'RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY', 'DECISION_QUALITY'],
    classic_technical: ['SYSTEMS_THINKING', 'TRADEOFF_CLARITY', 'DECISION_QUALITY', 'PROBLEM_FRAMING', 'INTELLECTUAL_HONESTY'],
    narrative_reasoning: ['NARRATIVE_COHERENCE', 'PROBLEM_FRAMING', 'SYSTEMS_THINKING', 'INTELLECTUAL_HONESTY', 'STAKEHOLDER_FLUENCY'],
    problem_framing: ['PROBLEM_FRAMING', 'UNCERTAINTY_HANDLING', 'TRADEOFF_CLARITY', 'DECISION_QUALITY', 'STAKEHOLDER_FLUENCY'],
    tradeoff_decision: ['TRADEOFF_CLARITY', 'DECISION_QUALITY', 'SYSTEMS_THINKING', 'UNCERTAINTY_HANDLING', 'INTELLECTUAL_HONESTY'],
    stakeholder_pressure: ['STAKEHOLDER_FLUENCY', 'RECOVERY_QUALITY', 'TRADEOFF_CLARITY', 'DECISION_QUALITY', 'NARRATIVE_COHERENCE'],
    ai_collaboration_review: ['AI_COLLABORATION', 'SYSTEMS_THINKING', 'PROBLEM_FRAMING', 'TRADEOFF_CLARITY', 'INTELLECTUAL_HONESTY'],
    uncertainty_handling: ['UNCERTAINTY_HANDLING', 'PROBLEM_FRAMING', 'DECISION_QUALITY', 'RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY'],
    adversarial_pushback: ['RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY', 'STAKEHOLDER_FLUENCY', 'TRADEOFF_CLARITY', 'DECISION_QUALITY']
};

export const DEFAULT_WEIGHTS_BY_MODE: Record<string, Partial<Record<DimensionKey, number>>> = {
    classic_behavioral: { NARRATIVE_COHERENCE: 30, STAKEHOLDER_FLUENCY: 20, RECOVERY_QUALITY: 20, INTELLECTUAL_HONESTY: 15, DECISION_QUALITY: 15 },
    classic_technical: { SYSTEMS_THINKING: 30, TRADEOFF_CLARITY: 20, DECISION_QUALITY: 20, PROBLEM_FRAMING: 15, INTELLECTUAL_HONESTY: 15 },
    narrative_reasoning: { NARRATIVE_COHERENCE: 40, PROBLEM_FRAMING: 15, SYSTEMS_THINKING: 15, INTELLECTUAL_HONESTY: 15, STAKEHOLDER_FLUENCY: 15 },
    problem_framing: { PROBLEM_FRAMING: 50, UNCERTAINTY_HANDLING: 15, TRADEOFF_CLARITY: 15, DECISION_QUALITY: 10, STAKEHOLDER_FLUENCY: 10 },
    tradeoff_decision: { TRADEOFF_CLARITY: 40, DECISION_QUALITY: 20, SYSTEMS_THINKING: 15, UNCERTAINTY_HANDLING: 15, INTELLECTUAL_HONESTY: 10 },
    stakeholder_pressure: { STAKEHOLDER_FLUENCY: 40, RECOVERY_QUALITY: 20, TRADEOFF_CLARITY: 15, DECISION_QUALITY: 15, NARRATIVE_COHERENCE: 10 },
    ai_collaboration_review: { AI_COLLABORATION: 50, SYSTEMS_THINKING: 15, PROBLEM_FRAMING: 15, TRADEOFF_CLARITY: 10, INTELLECTUAL_HONESTY: 10 },
    uncertainty_handling: { UNCERTAINTY_HANDLING: 40, PROBLEM_FRAMING: 20, DECISION_QUALITY: 15, RECOVERY_QUALITY: 15, INTELLECTUAL_HONESTY: 10 },
    adversarial_pushback: { RECOVERY_QUALITY: 40, INTELLECTUAL_HONESTY: 20, STAKEHOLDER_FLUENCY: 15, TRADEOFF_CLARITY: 15, DECISION_QUALITY: 10 }
};
