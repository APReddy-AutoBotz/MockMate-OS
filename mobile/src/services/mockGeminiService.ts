import { apiClient } from './apiClient';
import {
  InterviewPlan,
  InterviewPlanSchema,
  InterviewSessionContext,
  FinalReport,
  FinalReportSchema,
  QuestionBlueprint,
  CalibrateResponse,
  CalibrateResponseSchema,
  InterviewSessionStartResponseSchema,
  AdaptiveAnswerSubmissionResponseSchema,
  AdaptiveAnswerSubmissionResponse,
  HintResponseSchema,
  IdealResponseResponseSchema,
  TranscribeAudioResponseSchema
} from 'mockmate-shared';

export const calibrateIntent = async (
  role: string,
  jobDescription?: string
): Promise<CalibrateResponse> => {
  return apiClient.post('interview/calibrate', CalibrateResponseSchema, { role, jobDescription });
};

export const generateInterviewPlan = async (
  role: string,
  intentText: string,
  sessionControls: any,
  jdText?: string
): Promise<InterviewPlan> => {
  return apiClient.post('interview/plan', InterviewPlanSchema, {
    role,
    intent: intentText,
    controls: sessionControls,
    selectedPanelIDs: ['p1'],
    jdText
  });
};

export const startInterviewSession = async (
  context: InterviewSessionContext
): Promise<{ firstQuestion: QuestionBlueprint; personaId: string; sessionId: string }> => {
  const data = await apiClient.post('interview/sessions', InterviewSessionStartResponseSchema, { context });
  return {
    firstQuestion: data.firstQuestion,
    personaId: context.selectedPanelIDs?.[0] || 'p1',
    sessionId: data.sessionId
  };
};

export const submitAnswerAndGetNext = async (
  sessionId: string,
  questionId: string,
  expectedSessionVersion: number,
  clientSubmissionId: string,
  answerKind: 'answered' | 'skipped',
  answerText?: string
): Promise<AdaptiveAnswerSubmissionResponse> => {
  const data = await apiClient.post(
    `interview/sessions/${sessionId}/answers`,
    AdaptiveAnswerSubmissionResponseSchema,
    { questionId, expectedSessionVersion, clientSubmissionId, answerKind, answerText }
  );
  return data;
};

export const getHintForQuestion = async (questionText: string, expectedSignals?: string[]): Promise<string> => {
  const data = await apiClient.post('interview/hint', HintResponseSchema, { questionText, expectedSignals: expectedSignals || [] });
  return data.hint;
};

export const generateIdealAnswer = async (
  questionText: string,
  expectedSignals?: string[],
  userAnswer?: string
): Promise<string> => {
  const data = await apiClient.post('interview/ideal-response', IdealResponseResponseSchema, { questionText, expectedSignals: expectedSignals || [], userAnswer });
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
    const data = await apiClient.post('interview/transcribe', TranscribeAudioResponseSchema, { audioBase64: base64Audio, mimeType });
    if (data.status === 'transcribed' && data.transcript) {
      return data.transcript;
    }
    return '';
  } catch (error) {
    console.error('Transcription failed', error);
    return "";
  }
};

export const generateFinalReport = async (sessionId: string): Promise<FinalReport> => {
  return apiClient.post(`interview/sessions/${sessionId}/report`, FinalReportSchema, {});
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
