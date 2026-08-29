import { SessionHistoryRecord, QuestionHistoryItem } from "../types/ui";
import { FinalReport } from "mockmate-shared";

const HISTORY_KEY = 'mockmate_session_history';
const QUESTION_TRACKER_KEY = 'mockmate_question_usage';
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export const saveSessionToHistory = (
  report: FinalReport,
  role: string,
  type: 'structured' | 'conversational',
  serverSessionId?: string,
): boolean => {
  try {
    if (!report) return false;

    const historyJson = localStorage.getItem(HISTORY_KEY);
    const parsedHistory = historyJson ? JSON.parse(historyJson) : [];
    const history: SessionHistoryRecord[] = Array.isArray(parsedHistory) ? parsedHistory : [];
    const canonicalScore = typeof report.simplifiedScore === 'number' && Number.isFinite(report.simplifiedScore)
      ? report.simplifiedScore
      : null;
    const stableId = serverSessionId ? `interview_${serverSessionId}` : `session_${Date.now()}`;
    const existingRecord = history.find(record => record.id === stableId);

    const newRecord: SessionHistoryRecord = {
      id: stableId,
      timestamp: existingRecord?.timestamp ?? Date.now(),
      role: role || 'Unknown Role',
      avgScore: canonicalScore,
      readinessStatus: report.readiness?.status || 'NOT_READY',
      biggestRisk: report.biggestRiskArea?.title || 'No major risk identified',
      sessionType: type,
      fullReport: report
    };

    const updatedHistory = [newRecord, ...history.filter(record => record.id !== stableId)].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    return true;
  } catch (e) {
    console.error("Failed to save session history:", e);
    return false;
  }
};

export const trackQuestionUsage = (question: string | null | undefined, role: string) => {
  if (!question || typeof question !== 'string') return;

  try {
    const trackerJson = localStorage.getItem(QUESTION_TRACKER_KEY);
    let tracker: QuestionHistoryItem[] = trackerJson ? JSON.parse(trackerJson) : [];

    tracker.push({
      id: Math.random().toString(36).substring(2, 9),
      question: question.trim(),
      role: role,
      timestamp: Date.now()
    });

    const now = Date.now();
    tracker = tracker.filter(item => (now - item.timestamp) < FIFTEEN_DAYS_MS);

    localStorage.setItem(QUESTION_TRACKER_KEY, JSON.stringify(tracker));
  } catch (e) {
    console.error("Failed to track question usage:", e);
  }
};

export const getRecentQuestionsForRole = (role: string): string[] => {
  try {
    const trackerJson = localStorage.getItem(QUESTION_TRACKER_KEY);
    if (!trackerJson) return [];

    const tracker: QuestionHistoryItem[] = JSON.parse(trackerJson);
    const now = Date.now();

    return tracker
      .filter(item => item.role === role && (now - item.timestamp) < FIFTEEN_DAYS_MS)
      .map(item => item.question);
  } catch (e) {
    return [];
  }
};

export const getSessionHistory = (): SessionHistoryRecord[] => {
  try {
    const historyJson = localStorage.getItem(HISTORY_KEY);
    return historyJson ? JSON.parse(historyJson) : [];
  } catch (e) {
    console.error("Failed to read session history:", e);
    return [];
  }
};

export const clearAllHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(QUESTION_TRACKER_KEY);
};
