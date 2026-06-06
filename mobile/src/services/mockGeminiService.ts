import { API_BASE } from './apiBase';
import { getAccessToken } from './supabaseClient';

const authHeader = async (): Promise<Record<string, string>> => {
  const token = await getAccessToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const postToBackend = async (endpoint: string, body: any) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  };

  const response = await fetch(`${API_BASE}/ai/${endpoint}`, {
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
  return postToBackend('calibrate-intent', { intent: intentText, context: additionalContext });
};

export const generateInterviewPlan = async (
  intentText: string,
  jdText: string | null,
  sessionControls: any,
  selectedPanelIDs: string[]
): Promise<any> => {
  return postToBackend('generate-plan', {
    intent: intentText,
    jdText,
    controls: sessionControls,
    panelIDs: selectedPanelIDs,
  });
};

export const startInterviewSession = async (
  context: any
): Promise<{ firstQuestion: string; personaId: string; updatedContext: any }> => {
  const { sessionId, firstMessage } = await postToBackend('start-session', { context });
  return {
    firstQuestion: firstMessage,
    personaId: context.selectedPanelIDs?.[0] || 'p1',
    updatedContext: { ...context, sessionId },
  };
};

export const submitAnswerAndGetNext = async (
  history: any[],
  context: any,
  personaId: string
): Promise<{ nextQuestion: string; isLastQuestion: boolean }> => {
  if (context.sessionId) {
    try {
      const { nextMessage, isLastQuestion } = await postToBackend('submit-answer', {
        sessionId: context.sessionId,
        answer: history[history.length - 1].candidateResponse,
      });

      return {
        nextQuestion: nextMessage,
        isLastQuestion: isLastQuestion,
      };
    } catch (error) {
      console.error('Backend submit failed, falling back locally', error);
    }
  }

  const totalExpected = context.interviewPlan?.meta?.controls?.totalQuestions || 5;
  const isLastQuestion = history.length >= totalExpected;
  if (isLastQuestion) {
    return { nextQuestion: '', isLastQuestion: true };
  }

  return {
    nextQuestion: `Thank you. For the next question: Describe a challenging technical problem you solved recently.`,
    isLastQuestion: false,
  };
};

export const getHintForQuestion = async (question: string): Promise<string> => {
  const data = await postToBackend('get-hint', { question });
  return data.hint;
};

export const generateIdealAnswer = async (
  question: string,
  blueprint: any | null,
  userAnswer: string
): Promise<string> => {
  const data = await postToBackend('generate-ideal', { question, blueprint, userAnswer });
  return data.idealAnswer;
};

// Helper to convert Local File URI to Base64 using standard FileReader
const uriToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // split to remove the "data:*/*;base64," prefix
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const transcribeAudio = async (uri: string, mimeType: string): Promise<string> => {
  try {
    const base64Audio = await uriToBase64(uri);
    const data = await postToBackend('transcribe', { audioData: base64Audio, mimeType });
    return data.transcript;
  } catch (error) {
    console.error('Transcription failed', error);
    return "I am ready for the next question. (Audio Transcription Unavailable)";
  }
};

export const generateFinalReport = async (
  history: any[],
  context: any
): Promise<any> => {
  return postToBackend('generate-report', { history, context });
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
