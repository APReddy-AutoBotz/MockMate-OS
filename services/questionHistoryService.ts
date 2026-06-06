export interface QuestionRecord {
    hash: string;
    questionText: string;
    timestamp: number;
}

const STORAGE_KEY = 'mockmate_question_history';
const HISTORY_WINDOW_DAYS = 15;

// Simple string hash for basic deduplication
const hashString = (str: string): string => {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
};

export const questionHistoryService = {
    /**
     * Saves a list of questions to history with current timestamp.
     */
    saveQuestions: (questions: string[]) => {
        try {
            const currentHistory = questionHistoryService.getHistory();
            const newRecords: QuestionRecord[] = questions.map(q => ({
                hash: hashString(q),
                questionText: q,
                timestamp: Date.now()
            }));

            const updatedHistory = [...currentHistory, ...newRecords];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
        } catch (e) {
            console.warn('Failed to save question history', e);
        }
    },

    /**
     * Retrieves questions asked within the exclusion window (default 10 days).
     */
    getRecentQuestionTexts: (days = HISTORY_WINDOW_DAYS): string[] => {
        try {
            const currentHistory = questionHistoryService.getHistory();
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

            // Filter only recent entry
            const recent = currentHistory.filter(r => r.timestamp > cutoff);

            // Return unique texts
            return [...new Set(recent.map(r => r.questionText))];
        } catch (e) {
            console.warn('Failed to retrieve question history', e);
            return [];
        }
    },

    /**
     * Internal helper to parse history safely
     */
    getHistory: (): QuestionRecord[] => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            return JSON.parse(raw) as QuestionRecord[];
        } catch {
            return [];
        }
    },

    /**
     * Clears history (useful for debugging or user reset)
     */
    clearHistory: () => {
        localStorage.removeItem(STORAGE_KEY);
    }
};
