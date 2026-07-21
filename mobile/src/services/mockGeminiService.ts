import { apiClient } from './apiClient';
import {
  InterviewPlan,
  InterviewSessionContext,
  FinalReport,
  QuestionBlueprint,
} from 'mockmate-shared';

export const calibrateIntent = async (
    intentText: string,
    additionalContext?: string
): Promise<{ recommendedPanelIDs: string[]; recommendedRole: string; matchReasons?: Record<string, string> }> => {
    return apiClient.post('interview/calibrate', { intentText, additionalContext });
};

export const generateInterviewPlan = async (
    intentText: string,
    jdText: string | null,
    sessionControls: any,
    selectedPanelIDs: string[]
): Promise<InterviewPlan> => {
    return apiClient.post('interview/plan', { intentText, jdText, controls: sessionControls, selectedPanelIDs });
};

export const startInterviewSession = async (
    context: InterviewSessionContext
): Promise<{ firstQuestion: QuestionBlueprint; personaId: string; sessionId: string }> => {
    const data = await apiClient.post<{ sessionId: string; firstQuestion: QuestionBlueprint }>('interview/sessions', { context });
    return {
        firstQuestion: data.firstQuestion,
        personaId: context.selectedPanelIDs?.[0] || 'p1',
        sessionId: data.sessionId
    };
};

export const submitAnswerAndGetNext = async (
    sessionId: string,
    questionId: string,
    answerText: string
): Promise<{ nextQuestion: QuestionBlueprint | null; isLastQuestion: boolean }> => {
    return apiClient.post(`interview/sessions/${sessionId}/answers`, { questionId, answerText });
};

export const getHintForQuestion = async (question: string): Promise<string> => {
    const data = await apiClient.post<{ hint: string }>('interview/hint', { question });
    return data.hint;
};

export const generateIdealAnswer = async (
    question: string,
    blueprint: QuestionBlueprint | null,
    userAnswer: string
): Promise<string> => {
    const data = await apiClient.post<{ idealResponse: string }>('interview/ideal-response', { question, blueprint, userAnswer });
    return data.idealResponse;
};

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
    const data = await apiClient.post<{ transcript: string }>('interview/transcribe', { audioBase64: base64Audio, mimeType });
    return data.transcript;
  } catch (error) {
    console.error('Transcription failed', error);
    return "I am ready for the next question. (Audio Transcription Unavailable)";
  }
};

export const generateFinalReport = async (sessionId: string): Promise<FinalReport> => {
    return apiClient.post(`interview/sessions/${sessionId}/report`);
};

export default {
    calibrateIntent,
    generateInterviewPlan,
    startInterviewSession,
    submitAnswerAndGetNext,
    getHintForQuestion,
    transcribeAudio,
    generateFinalReport,
    generateIdealAnswer
};
