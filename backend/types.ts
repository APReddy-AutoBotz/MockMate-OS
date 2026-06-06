
export interface SessionControls {
  difficulty: string;
  totalQuestions: number;
  includeBehavioral: boolean;
  includeCoding: boolean;
  timePerQuestion: string;
  sessionMode: string;
  sourceMode: string;
}

export interface QuestionBlueprint {
  phase: string;
  competency: string;
  difficulty: string;
  question: string;
  expectedSignals: string[];
  personaFocus: string;
  why: string;
  language?: string;
  timeAllocation: number;
}

export interface JDInsights {
  role: string;
  level: string;
  mustHaveSkills: string[];
  niceToHave: string[];
  domains: string[];
  tools: string[];
  softSkills: string[];
  competencyWeights: Record<string, number>;
}

export interface InterviewPlan {
  jdInsights: JDInsights;
  questionSet: QuestionBlueprint[];
  meta: {
    estimatedDuration: string;
    focusAreas: string[];
  };
}

export interface Persona {
  id: string;
  name: string;
  title: string;
  focus: string;
  domain: string[];
  color: string;
  icon: string;
  keywords: string[];
  seniority: 'junior' | 'mid' | 'senior' | 'staff' | 'exec';
  style: string;
}

export interface InterviewTurn {
  interviewer: string;
  question: string;
  candidateResponse: string;
  timestamp: number;
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

export interface InterviewSession {
  id: string;
  userId: string;
  context: SessionContext; // Includes InterviewPlan
  history: InterviewTurn[];
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'abandoned';
  report?: FinalReport;
  pilotFeedback?: PilotFeedback;
}

export interface CompetencyScore {
  competency: string;
  score: number;
  evidence?: string[];
  recommendation?: string;
}

export interface DimensionScore {
  dimension: string;
  score_status: 'scored' | 'insufficient_evidence' | 'not_tested';
  anchor_score: number | null;
  normalized_score: number | null;
  reason: string;
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface TrajectoryPoint {
  turnIndex?: number;
  turnRange?: [number, number];
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

export interface AdvisoryPanelMember {
  persona: string;
  summary: string;
  scores: { skill: string; score: number }[];
  dimensionScores?: DimensionScore[];
}

export interface QuestionPerformance {
  question_text: string;
  user_transcript: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
  max_impact_response: string;
}

export interface FinalReport {
  overallSummary: string;
  evaluationModel: 'legacy' | 'v1_dimensions';
  readiness: {
    status: 'INTERVIEW_READY' | 'ALMOST_READY' | 'NOT_READY';
    reasoning: string;
  };
  quantitativeAnalysis: {
    competency_scores?: CompetencyScore[];
    dimension_scores?: DimensionScore[];
  };
  advisoryPanel: AdvisoryPanelMember[];
  questionPerformance: QuestionPerformance[];
  biggestRiskArea: {
    title: string;
    observation: string;
    mitigation: string;
  };
  coachPack: {
    title: string;
    redoNow: { question: string; instruction: string };
    micro_drills: { weakness: string; drill_prompt: string; focus_point: string }[];
  };
  trajectoryReplay?: TrajectoryPoint[];
  auditLayer?: AuditFinding[];
  pilotFeedback?: PilotFeedback;
  _metadata?: {
    provider_used: string;
    model_name: string;
    fallback_triggered: boolean;
    session_mode: string;
    role_family: string;
    active_dimensions: string[];
    status_counts: {
        scored: number;
        insufficient_evidence: number;
        not_tested: number;
    };
  };
}

export interface SessionContext {
  candidateRole?: string;
  selectedPanelIDs?: string[];
  jdInsights?: {
    mustHaveSkills: string[];
  };
  interviewPlan?: InterviewPlan;
  competencyWeights?: Record<string, number>;
  controls?: SessionControls;
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
