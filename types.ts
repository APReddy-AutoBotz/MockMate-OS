
export interface UserProfile {
    name: string;
    experienceLevel: 'entry' | 'mid' | 'senior' | 'lead';
    primaryGoal: 'specific_interview' | 'skill_building' | 'career_change';
    targetRole?: string;   // Shared across Resume, Speak, and Interview modules
    companyName?: string;
    companyUrl?: string;
    pilot_user?: boolean;
}

export interface PilotFeedback {
    ratings: {
        fairness: number;
        replayUsefulness: number;
        auditAccuracy: number;
        coachingUsefulness: number;
    };
    issues: string[];
    openText: string;
    timestamp: string;
    updatedAt?: string;
}

export interface SessionContext {
    candidateRole: string;
    intentText: string;
    selectedPanelIDs: string[];
    jdInsights?: JDInsights;
    competencyWeights?: CompetencyWeight[];
    interviewPlan?: InterviewPlan;
    sessionType: 'structured' | 'conversational';
    sessionMode: 'exam' | 'coach';
    companyName?: string;
    companyUrl?: string;
    companyBrief?: string;
    targetStarBullets?: string[]; // Used for deeper Mockmate Interview integration
    sessionId?: string; // Phase 3: Added for backend persistence
}

export interface SessionControls {
    // OLD: totalQuestions (derived from mode now)
    // NEW: difficulty defines the mix and length
    difficulty: 'starter' | 'intermediate' | 'expert';

    // Explicit overrides
    totalQuestions?: number;

    // Flags
    includeBehavioral: boolean;
    includeCoding?: boolean;

    // Time controls
    timePerQuestion: '45s' | '90s' | '120s' | 'none';
    sessionMode: 'exam' | 'coach';

    // Context Mode
    sourceMode: 'job_description' | 'question_bank';
}

export interface JDInsights {
    source: 'realJD' | 'genericProfile' | 'questionBank' | 'attachment';
    role?: string;
    level?: string;
    mustHaveSkills: string[];
    niceToHave: string[];
    domains: string[];
    tools: string[];
    softSkills: string[];
    competencyWeights: {
        [key: string]: number;
    };
}

export interface QuestionBlueprint {
    id: string;
    phase: 'knowledge' | 'process' | 'scenario' | 'behavioral' | 'coding';
    difficulty: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
    type: 'recall' | 'concept' | 'process' | 'case' | 'roleplay' | 'algorithm';
    question: string;
    expectedSignals: string[];
    failureModes: string[];
    evaluationCriteria?: string[];
    personaFocus?: string;
    rubric: {
        [key: string]: {
            score1: string[];
            score3: string[];
            score5: string[];
        };
    };
    sourceBullets: string[];
    estTimeSec: number;
    language?: string;
    timeAllocation?: number; // Premium Enhancement: AI-estimated realistic time for this question
}

export interface InterviewPlan {
    meta: {
        mode: 'tailored' | 'generic';
        candidateRole: string;
        language: string;
        controls: SessionControls;
    };
    jdInsights: JDInsights;
    questionSet: QuestionBlueprint[];
    orderingNotes: string;
    adaptSpec: {
        rules: string;
    };
    coachPack: {
        competency: string;
        why: string;
        microDrills: string[];
        modelAnswer: string;
    }[];
    researchLinks?: { uri: string; title: string; }[];
}

export interface CompetencyWeight {
    competency: string;
    weight: number;
}

export interface BARS {
    criteria: string;
    score_5_description: string;
    score_3_description: string;
    score_1_description: string;
}

export interface QuestionPerformance {
    question_text: string;
    question_phase?: string;
    user_transcript: string;
    max_impact_response: string;
    feedback: string;
    strengths?: string[];
    improvements?: string[];
    bars_rubric?: BARS[];
}

export interface QuantitativeAnalysis {
    competency_scores: {
        competency: string;
        score: number;
        reason: string;
    }[];
}

export interface DimensionScore {
    dimension: string;
    score_status: 'scored' | 'insufficient_evidence' | 'not_tested';
    anchor_score: number | null; // 1-5
    normalized_score: number | null; // 0-100
    reason: string;
    evidence: string[]; // Observations from the transcript
    confidence: 'low' | 'medium' | 'high';
}

export interface TrajectoryPoint {
    turnIndex?: number;
    turnRange?: [number, number]; // Added turn range support
    dimension: string;
    observation: string;
    delta: 'improving' | 'declining' | 'stable';
    reasoning: string;
}

export interface AuditFinding {
    title: string;
    dimension: string;
    gap: string;
    impact: 'critical' | 'moderate' | 'marginal';
    mitigation: string;
}

export interface AdvisorAssessment {
    persona: string;
    summary: string;
    scores: {
        skill: string; // Legacy field
        score: number;
    }[];
    dimensionScores?: DimensionScore[]; // New field
}

export interface MicroDrill {
    weakness: string;
    drill_prompt: string;
    focus_point: string;
}

export interface CoachPack {
    title: string;
    redoNow: {
        question: string;
        instruction: string;
    };
    micro_drills: MicroDrill[];
}

export interface PrioritizedAction {
    title: string;
    impact: 'high' | 'medium' | 'low';
    timeEstimate: string;
    exercise: string;
}

export interface FinalReport {
    overallSummary: string;
    evaluationModel: 'legacy' | 'v1_dimensions';
    readiness: {
        status: 'INTERVIEW_READY' | 'ALMOST_READY' | 'NOT_READY';
        reasoning: string;
    };
    quantitativeAnalysis: {
        competency_scores?: {
            competency: string;
            score: number;
            reason: string;
        }[]; // Legacy
        dimension_scores?: DimensionScore[]; // New
    };
    advisoryPanel: AdvisorAssessment[];
    questionPerformance: QuestionPerformance[];
    biggestRiskArea?: {
        title: string;
        observation?: string;
        consequence?: string;
        mitigation?: string;
    };
    coachPack: CoachPack;

    // Scaffolding for new report prioritisation
    trajectoryReplay?: TrajectoryPoint[];
    auditLayer?: AuditFinding[];
    pilotFeedback?: PilotFeedback;

    // Simplified Report Fields (for user-friendly display)
    simplifiedScore?: number; // 0-100 overall score
    topStrength?: string; // Single biggest strength
    topWeakness?: string; // Single biggest gap
    estimatedSessionsToReady?: number; // e.g., 2-3 sessions
    quickWins?: string[]; // 2-3 easy improvements
    prioritizedActions?: PrioritizedAction[]; // Ranked by impact
}

export interface InterviewTurn {
    interviewer: string;
    question: string;
    candidateResponse: string;
    questionBlueprint?: QuestionBlueprint;
    codeFeedback?: string;
}

export interface SessionHistoryRecord {
    id: string;
    timestamp: number;
    role: string;
    avgScore: number;
    readinessStatus: string;
    biggestRisk: string;
    sessionType: string;
    fullReport?: FinalReport;
}

export interface QuestionHistoryItem {
    id: string;
    question: string;
    role: string;
    timestamp: number;
}

export interface ResumeSkillCategory {
    category: string;
    items: string[];
}

export interface ResumeExperience {
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    bullets: string[];
}

export interface ResumeProject {
    name: string;
    description: string;
    tools: string[];
    url?: string;
}

export interface ResumeEducation {
    institution: string;
    degree: string;
    year: string;
}

export interface ResumeCertification {
    name: string;
    issuer: string;
    year: string;
}

export interface ResumeAward {
    title: string;
    description: string;
}

export interface ResumeData {
    basics: {
        name: string;
        email: string;
        phone: string;
        location: string;
        linkedinUrl?: string;
        portfolioUrl?: string;
    };
    summary: string;
    skills: ResumeSkillCategory[];
    experience: ResumeExperience[];
    projects: ResumeProject[];
    education: ResumeEducation[];
    certifications?: ResumeCertification[];
    awards?: ResumeAward[];
    metadata?: {
        parseScore?: number;
        jdScore?: number;
        contentScore?: number;
    };
}
