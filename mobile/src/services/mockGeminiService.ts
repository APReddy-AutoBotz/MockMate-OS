import { API_BASE } from './apiBase';
import { getAccessToken } from './supabaseClient';

const authHeader = async (): Promise<Record<string, string>> => {
  const token = await getAccessToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const postToInterviewAPI = async (endpoint: string, body: any = {}) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  };

  const response = await fetch(`${API_BASE}/interview/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown Error' }));
    throw new Error(err.error || `Backend request failed: ${response.statusText}`);
  }
  return response.json();
};

export const calibrateIntent = async (
  intentText: string,
  additionalContext?: string
): Promise<{ recommendedPanelIDs: string[]; recommendedRole: string; matchReasons?: Record<string, string> }> => {
  return postToInterviewAPI('calibrate', { intentText, additionalContext });
};

export const generateInterviewPlan = async (
  intentText: string,
  jdText: string | null,
  sessionControls: any,
  selectedPanelIDs: string[]
): Promise<any> => {
  return postToInterviewAPI('plan', {
    intentText,
    jdText,
    controls: sessionControls,
    selectedPanelIDs,
  });
};

export const startInterviewSession = async (
  context: any
): Promise<{ firstQuestion: string; pendingQuestion: any; personaId: string; updatedContext: any }> => {
  const data = await postToInterviewAPI('sessions', { context });
  
  return {
    firstQuestion: data.openingMessage || data.firstQuestion?.question || "Hello, let's begin.",
    pendingQuestion: data.firstQuestion,
    personaId: context.selectedPanelIDs?.[0] || 'p1',
    updatedContext: { ...context, sessionId: data.sessionId },
  };
};

export const submitAnswerAndGetNext = async (
  context: any,
  questionId: string,
  answerText: string
): Promise<{ nextQuestion: string; pendingQuestion: any; isLastQuestion: boolean }> => {
  if (context.sessionId) {
    const data = await postToInterviewAPI(`sessions/${context.sessionId}/answers`, {
      questionId,
      answerText,
    });

    return {
      nextQuestion: data.nextQuestion?.question || "That concludes our interview.",
      pendingQuestion: data.nextQuestion,
      isLastQuestion: data.isLastQuestion,
    };
  }

  // Fallback if somehow sessionId is missing (should not happen with server-authoritative flow)
  return {
    nextQuestion: `Session error. Please restart the interview.`,
    pendingQuestion: null,
    isLastQuestion: true,
  };
};

export const getHintForQuestion = async (question: string): Promise<string> => {
  const data = await postToInterviewAPI('hint', { question });
  return data.hint;
};

export const generateIdealAnswer = async (
  question: string,
  blueprint: any | null,
  userAnswer: string
): Promise<string> => {
  const data = await postToInterviewAPI('ideal-response', { question, blueprint, userAnswer });
  return data.idealResponse;
};

// Helper to convert Local File URI to Base64 using standard FileReader
const uriToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const transcribeAudio = async (uri: string, mimeType: string): Promise<string> => {
  try {
    const base64Audio = await uriToBase64(uri);
    const data = await postToInterviewAPI('transcribe', { audioBase64: base64Audio, mimeType });
    return data.transcript;
  } catch (error) {
    console.error('Transcription failed', error);
    return "I am ready for the next question. (Audio Transcription Unavailable)";
  }
};

export const generateFinalReport = async (
  sessionId: string
): Promise<any> => {
  return postToInterviewAPI(`sessions/${sessionId}/report`);
};

export default {
  calibrateIntent,
  generateInterviewPlan,
  startInterviewSession,
  submitAnswerAndGetNext,
  getHintForQuestion,
  transcribeAudio,
  generateFinalReport,
  generateIdealAnswer,
};
