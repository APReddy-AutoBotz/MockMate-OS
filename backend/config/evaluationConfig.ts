import { DimensionKey } from 'mockmate-shared';

export interface DimensionRubric {
  name: string;
  definition: string;
  subSignals: string[];
  anchors: Record<0 | 1 | 2 | 3 | 4, string>;
}

export const APPROVED_DIMENSIONS: Record<DimensionKey, DimensionRubric> = {
  PROBLEM_FRAMING: {
    name: 'Problem Framing',
    definition: 'How well the candidate defines the actual problem, scope, constraints, and objectives before rushing into a solution.',
    subSignals: [
      'clarifying_questions',
      'scope_definition',
      'assumption_identification',
      'constraint_identification',
      'risk_identification',
      'objective_alignment'
    ],
    anchors: {
      0: 'Contradictory or absent problem framing. Jumps straight into unguided implementation without clarifying goals or scope.',
      1: 'Emerging framing. Identifies superficial requirements but leaves critical assumptions and constraints implicit.',
      2: 'Adequate framing. Defines basic problem boundaries, asks relevant clarifying questions, and identifies core goals.',
      3: 'Strong framing. Explicitly deconstructs the problem, maps constraints, states key assumptions, and aligns success criteria.',
      4: 'Exceptional framing. Rigorously dissects ambiguous boundaries, anticipates hidden risks, and establishes a clear strategic framework.'
    }
  },
  SYSTEMS_THINKING: {
    name: 'Systems Thinking',
    definition: 'How well the candidate understands broader system dynamics, interconnections, second-order effects, and failure modes.',
    subSignals: [
      'dependency_awareness',
      'end_to_end_flow_thinking',
      'stakeholder_interconnections',
      'second_order_effects',
      'failure_mode_awareness',
      'scalability_consideration'
    ],
    anchors: {
      0: 'Narrow point-solution thinking. Ignores upstream dependencies, system boundaries, and critical failure modes.',
      1: 'Emerging systems awareness. Recognizes immediate component dependencies but misses second-order impacts or downstream risks.',
      2: 'Adequate systems thinking. Explains end-to-end component flow and identifies standard technical/operational dependencies.',
      3: 'Strong systems thinking. Articulates secondary system effects, failure modes, scalability limits, and cross-functional impacts.',
      4: 'Exceptional systems thinking. Holistically maps multi-tier interactions, resilience strategies, and long-term system evolution.'
    }
  },
  TRADEOFF_CLARITY: {
    name: 'Tradeoff Clarity',
    definition: 'How clearly the candidate compares options and explicitly explains what is gained, lost, prioritized, or sacrificed.',
    subSignals: [
      'option_comparison',
      'prioritization_logic',
      'cost_vs_speed_reasoning',
      'quality_vs_speed_reasoning',
      'simplicity_vs_scale_reasoning',
      'explicit_sacrifice_awareness'
    ],
    anchors: {
      0: 'Presents a single choice as ideal without acknowledging downsides, costs, or alternatives.',
      1: 'Mentions alternative options casually but fails to compare them using structured criteria or explicit trade-offs.',
      2: 'Adequate comparison. Evaluates at least two options and states primary advantages and drawbacks.',
      3: 'Strong trade-off clarity. Systematically weighs speed, cost, complexity, and scale, explicitly stating sacrificed benefits.',
      4: 'Exceptional trade-off clarity. Quantifies criteria, defines reversal triggers, and articulates nuanced compromise logic.'
    }
  },
  UNCERTAINTY_HANDLING: {
    name: 'Uncertainty Handling',
    definition: 'How effectively the candidate operates under ambiguity, separates knowns from unknowns, and makes risk-managed progress.',
    subSignals: [
      'known_unknown_separation',
      'bounded_assumption_making',
      'uncertainty_language',
      'information_request_quality',
      'next_step_under_ambiguity',
      'risk_managed_progress'
    ],
    anchors: {
      0: 'Paralyzed by ambiguity or presents speculative guesses as facts without acknowledging uncertainty.',
      1: 'Recognizes incomplete information but lacks a structured method to bound assumptions or request missing data.',
      2: 'Adequate uncertainty handling. Explicitly separates known facts from assumptions and proposes sensible next steps.',
      3: 'Strong uncertainty handling. Calibrates confidence levels, defines low-risk reversible experiments, and bounds key unknowns.',
      4: 'Exceptional uncertainty handling. Thrives under high ambiguity, establishing decision thresholds and risk-hedged execution paths.'
    }
  },
  AI_COLLABORATION: {
    name: 'AI Collaboration',
    definition: 'How critically, responsibly, and effectively the candidate evaluates, refines, and applies AI-generated recommendations.',
    subSignals: [
      'output_review_quality',
      'flaw_detection',
      'hallucination_awareness',
      'missing_risk_detection',
      'improvement_reasoning',
      'trust_calibration'
    ],
    anchors: {
      0: 'Blindly trusts or rejects AI output without critical inspection, verification, or risk awareness.',
      1: 'Performs surface-level review of AI output but misses subtle hallucinations, edge-case bugs, or security risks.',
      2: 'Adequate review. Identifies obvious flaws in AI output and proposes basic manual corrections.',
      3: 'Strong AI collaboration. Detects subtle logical errors or unstated assumptions, outlining concrete verification steps.',
      4: 'Exceptional AI collaboration. Exemplifies optimal trust calibration, combining automated capability with deep human oversight.'
    }
  },
  STAKEHOLDER_FLUENCY: {
    name: 'Stakeholder Fluency',
    definition: 'How effectively the candidate translates complex decisions for diverse audiences and navigates tension with empathy.',
    subSignals: [
      'audience_adaptation',
      'clarity_of_translation',
      'persuasion_under_tension',
      'executive_conciseness',
      'client_safe_language',
      'expectation_management'
    ],
    anchors: {
      0: 'Uses inappropriate jargon, displays insensitivity to stakeholder concerns, or fails to communicate decisions clearly.',
      1: 'Attempts audience adaptation but struggles to translate technical details into business impact under tension.',
      2: 'Adequate fluency. Explains choices clearly to non-technical stakeholders and acknowledges divergent priorities.',
      3: 'Strong fluency. Tailors narrative precisely, manages expectations proactively, and negotiates win-win compromises.',
      4: 'Exceptional fluency. Navigates high-stakes executive tension effortlessly, building consensus through empathetic framing.'
    }
  },
  DECISION_QUALITY: {
    name: 'Decision Quality',
    definition: 'How sound, practical, defensible, and actionable the candidate’s final recommendations are under constraints.',
    subSignals: [
      'recommendation_quality',
      'criteria_based_choice',
      'practicality_of_path',
      'alignment_to_goal',
      'judgment_under_constraints',
      'actionability'
    ],
    anchors: {
      0: 'Recommends impractical, contradictory, or high-risk actions unsuited to stated goals and constraints.',
      1: 'Proposes plausible actions but lacks clear criteria, execution structure, or risk mitigation.',
      2: 'Adequate decision quality. Makes defensible choices aligned with primary goals and basic constraints.',
      3: 'Strong decision quality. Delivers structured, criteria-driven recommendations with actionable implementation steps.',
      4: 'Exceptional decision quality. Formulates highly resilient, pragmatically optimized decisions with clear fallback contingencies.'
    }
  },
  INTELLECTUAL_HONESTY: {
    name: 'Intellectual Honesty',
    definition: 'How truthfully and transparently the candidate acknowledges knowledge limits, assumptions, errors, and updated evidence.',
    subSignals: [
      'bluff_avoidance',
      'assumption_transparency',
      'confidence_calibration',
      'evidence_respect',
      'limit_acknowledgment',
      'honest_revision'
    ],
    anchors: {
      0: 'Bluffs knowledge, conceals mistakes, or clings stubbornly to discredited claims when evidence proves otherwise.',
      1: 'Reluctantly admits gaps only when directly cornered, maintaining uncalibrated confidence.',
      2: 'Adequate honesty. Openly acknowledges knowledge limits and states underlying assumptions when asked.',
      3: 'Strong intellectual honesty. Transparently highlights unverified assumptions, calibrates confidence, and updates views on new data.',
      4: 'Exceptional intellectual honesty. Exemplifies scientific rigor, proactively seeking counter-evidence and revising stance.'
    }
  },
  RECOVERY_QUALITY: {
    name: 'Recovery Quality',
    definition: 'How calmly, adaptively, and constructively the candidate responds to pushback, unexpected challenges, or initial mistakes.',
    subSignals: [
      'composure_after_pushback',
      'revision_quality',
      'responsiveness_to_feedback',
      'adaptive_reasoning',
      'mistake_correction',
      'learning_in_motion'
    ],
    anchors: {
      0: 'Becomes defensive, flustered, or completely rigid when challenged or corrected.',
      1: 'Accepts pushback passively without integrating feedback into a revised, coherent reasoning path.',
      2: 'Adequate recovery. Maintains composure under pushback and makes reasonable course corrections.',
      3: 'Strong recovery. Gracefully processes counterarguments, adjusts reasoning dynamically, and strengthens final position.',
      4: 'Exceptional recovery. Turns adversarial pushback into an opportunity to demonstrate profound adaptive reasoning and growth.'
    }
  },
  NARRATIVE_COHERENCE: {
    name: 'Narrative Coherence',
    definition: 'How logically, structurally, and clearly the candidate constructs their explanations and reasoning progression.',
    subSignals: [
      'structure_of_explanation',
      'chronology_control',
      'relevance_filtering',
      'decision_storytelling',
      'outcome_connection',
      'reflection_clarity'
    ],
    anchors: {
      0: 'Disjointed, confusing, or rambling delivery with no recognizable logical structure.',
      1: 'Follows a rough narrative but includes tangential details, weak transitions, or unclear cause-and-effect links.',
      2: 'Adequate coherence. Uses standard logical structure (e.g. STAR) with clear chronology and outcomes.',
      3: 'Strong narrative coherence. Delivers crisp, structured explanations filtering noise and highlighting core causal drivers.',
      4: 'Exceptional narrative coherence. Crafts compelling, highly disciplined, and memorable explanations with flawless structure.'
    }
  }
};

export const ACTIVE_DIMENSIONS_BY_MODE: Record<string, DimensionKey[]> = {
  classic_behavioral: ['NARRATIVE_COHERENCE', 'STAKEHOLDER_FLUENCY', 'DECISION_QUALITY', 'INTELLECTUAL_HONESTY'],
  classic_technical: ['PROBLEM_FRAMING', 'SYSTEMS_THINKING', 'TRADEOFF_CLARITY', 'DECISION_QUALITY', 'UNCERTAINTY_HANDLING'],
  narrative_reasoning: ['NARRATIVE_COHERENCE', 'INTELLECTUAL_HONESTY', 'STAKEHOLDER_FLUENCY', 'DECISION_QUALITY'],
  problem_framing: ['PROBLEM_FRAMING', 'SYSTEMS_THINKING', 'UNCERTAINTY_HANDLING', 'DECISION_QUALITY'],
  tradeoff_decision: ['TRADEOFF_CLARITY', 'DECISION_QUALITY', 'SYSTEMS_THINKING', 'UNCERTAINTY_HANDLING'],
  stakeholder_pressure: ['STAKEHOLDER_FLUENCY', 'DECISION_QUALITY', 'RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY'],
  ai_collaboration_review: ['AI_COLLABORATION', 'INTELLECTUAL_HONESTY', 'UNCERTAINTY_HANDLING', 'DECISION_QUALITY', 'SYSTEMS_THINKING'],
  uncertainty_handling: ['UNCERTAINTY_HANDLING', 'INTELLECTUAL_HONESTY', 'PROBLEM_FRAMING', 'DECISION_QUALITY'],
  adversarial_pushback: ['RECOVERY_QUALITY', 'INTELLECTUAL_HONESTY', 'NARRATIVE_COHERENCE', 'DECISION_QUALITY']
};

export const DEFAULT_WEIGHTS_BY_MODE: Record<string, Partial<Record<DimensionKey, number>>> = {
  classic_behavioral: { NARRATIVE_COHERENCE: 30, STAKEHOLDER_FLUENCY: 25, DECISION_QUALITY: 25, INTELLECTUAL_HONESTY: 20 },
  classic_technical: { PROBLEM_FRAMING: 25, SYSTEMS_THINKING: 25, TRADEOFF_CLARITY: 20, DECISION_QUALITY: 15, UNCERTAINTY_HANDLING: 15 },
  narrative_reasoning: { NARRATIVE_COHERENCE: 35, INTELLECTUAL_HONESTY: 25, STAKEHOLDER_FLUENCY: 20, DECISION_QUALITY: 20 },
  problem_framing: { PROBLEM_FRAMING: 40, SYSTEMS_THINKING: 20, UNCERTAINTY_HANDLING: 20, DECISION_QUALITY: 20 },
  tradeoff_decision: { TRADEOFF_CLARITY: 40, DECISION_QUALITY: 25, SYSTEMS_THINKING: 20, UNCERTAINTY_HANDLING: 15 },
  stakeholder_pressure: { STAKEHOLDER_FLUENCY: 40, DECISION_QUALITY: 20, RECOVERY_QUALITY: 20, INTELLECTUAL_HONESTY: 20 },
  ai_collaboration_review: { AI_COLLABORATION: 40, INTELLECTUAL_HONESTY: 20, UNCERTAINTY_HANDLING: 15, DECISION_QUALITY: 15, SYSTEMS_THINKING: 10 },
  uncertainty_handling: { UNCERTAINTY_HANDLING: 40, INTELLECTUAL_HONESTY: 25, PROBLEM_FRAMING: 20, DECISION_QUALITY: 15 },
  adversarial_pushback: { RECOVERY_QUALITY: 40, INTELLECTUAL_HONESTY: 25, NARRATIVE_COHERENCE: 20, DECISION_QUALITY: 15 }
};
