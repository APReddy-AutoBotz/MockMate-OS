export interface UserProfile {
    name?: string;
    targetRole?: string;
    companyName?: string;
    companyUrl?: string;
    experienceLevel?: string;
    primaryGoal?: string;
    pilot_user?: boolean;
}

export interface SessionHistoryRecord {
    id: string;
    timestamp: number;
    role: string;
    avgScore: number | null;
    readinessStatus: string;
    biggestRisk: string;
    sessionType: 'structured' | 'conversational';
    fullReport: any;
}

export interface QuestionHistoryItem {
    id: string;
    question: string;
    role: string;
    timestamp: number;
}

export interface PilotFeedback {
    id?: string;
    timestamp: number;
    ratings: {
        scoreFairness: number;
        auditAccuracy: number;
        coachingUsefulness: number;
    };
    issues: string[];
    openText: string;
}
