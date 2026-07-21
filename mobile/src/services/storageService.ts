import AsyncStorage from '@react-native-async-storage/async-storage';

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

const HISTORY_KEY = 'mockmate_session_history';
const QUESTION_TRACKER_KEY = 'mockmate_question_usage';
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export const saveSessionToHistory = async (
  report: any,
  role: string,
  type: 'structured' | 'conversational'
) => {
  try {
    if (!report) return;

    const historyJson = await AsyncStorage.getItem(HISTORY_KEY);
    const history: SessionHistoryRecord[] = historyJson ? JSON.parse(historyJson) : [];

    const allScores: number[] = [];
    (report.advisoryPanel || []).forEach((adv: any) => {
      (adv.scores || []).forEach((s: any) => allScores.push(s.score));
    });
    const avgScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : (report.overallScore ?? report.score ?? null);

    const newRecord: SessionHistoryRecord = {
      id: `session_${Date.now()}`,
      timestamp: Date.now(),
      role: role || 'Unknown Role',
      avgScore: avgScore !== null ? parseFloat(avgScore.toFixed(1)) : null,
      readinessStatus: report.readiness?.status || 'NOT_READY',
      biggestRisk: report.biggestRiskArea?.title || 'No major risk identified',
      sessionType: type,
      fullReport: report,
    };

    const updatedHistory = [newRecord, ...history].slice(0, 50);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
  } catch (e) {
    console.error('Failed to save session history:', e);
  }
};

export const trackQuestionUsage = async (question: string | null | undefined, role: string) => {
  if (!question || typeof question !== 'string') return;

  try {
    const trackerJson = await AsyncStorage.getItem(QUESTION_TRACKER_KEY);
    let tracker: QuestionHistoryItem[] = trackerJson ? JSON.parse(trackerJson) : [];

    tracker.push({
      id: Math.random().toString(36).substring(2, 11),
      question: question.trim(),
      role: role,
      timestamp: Date.now(),
    });

    const now = Date.now();
    tracker = tracker.filter(item => (now - item.timestamp) < FIFTEEN_DAYS_MS);

    await AsyncStorage.setItem(QUESTION_TRACKER_KEY, JSON.stringify(tracker));
  } catch (e) {
    console.error('Failed to track question usage:', e);
  }
};

export const getRecentQuestionsForRole = async (role: string): Promise<string[]> => {
  try {
    const trackerJson = await AsyncStorage.getItem(QUESTION_TRACKER_KEY);
    if (!trackerJson) return [];

    const tracker: QuestionHistoryItem[] = JSON.parse(trackerJson);
    const now = Date.now();

    return tracker
      .filter(item => item.role === role && (now - item.timestamp) < FIFTEEN_DAYS_MS)
      .map(item => item.question);
  } catch {
    return [];
  }
};

export const getSessionHistory = async (): Promise<SessionHistoryRecord[]> => {
  try {
    const historyJson = await AsyncStorage.getItem(HISTORY_KEY);
    return historyJson ? JSON.parse(historyJson) : [];
  } catch (e) {
    console.error('Failed to read session history:', e);
    return [];
  }
};

export const clearAllHistory = async () => {
  await AsyncStorage.removeItem(HISTORY_KEY);
  await AsyncStorage.removeItem(QUESTION_TRACKER_KEY);
};

export default {
  saveSessionToHistory,
  trackQuestionUsage,
  getRecentQuestionsForRole,
  getSessionHistory,
  clearAllHistory,
};
