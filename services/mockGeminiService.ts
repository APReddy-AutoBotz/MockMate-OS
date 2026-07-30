import { z } from 'zod';
import { apiClient } from './apiClient';
import {
  InterviewPlan,
  InterviewPlanSchema,
  InterviewSessionContext,
  FinalReport,
  FinalReportSchema,
  QuestionBlueprint,
  CalibrateResponseSchema,
  CalibrateResponse,
  InterviewSessionStartResponseSchema,
  InterviewSessionStartResponse,
  AnswerSubmissionResponseSchema,
  AnswerSubmissionResponse,
  AdaptiveAnswerSubmissionResponseSchema,
  AdaptiveAnswerSubmissionResponse,
  HintResponseSchema,
  IdealResponseResponseSchema,
  TranscribeAudioResponseSchema,
  TranscribeAudioResponse,
  CodeAnalysisResponseSchema,
  CodeAnalysisResponse,
  CodeSimulationResponseSchema,
  CodeSimulationResponse
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
  jdText?: string,
  resumeText?: string,
  selectedPanelIDs?: string[]
): Promise<InterviewPlan> => {
  return apiClient.post('interview/plan', InterviewPlanSchema, { 
    role, 
    intent: intentText, 
    controls: sessionControls, 
    jdText, 
    resumeText,
    selectedPanelIDs
  });
};

export const startInterviewSession = async (
  context: InterviewSessionContext
): Promise<InterviewSessionStartResponse> => {
  return apiClient.post('interview/sessions', InterviewSessionStartResponseSchema, { context });
};

export const submitAdaptiveTurn = async (
  sessionId: string,
  questionId: string,
  expectedSessionVersion: number,
  clientSubmissionId: string,
  answerKind: 'answered' | 'skipped',
  answerText?: string
): Promise<AdaptiveAnswerSubmissionResponse> => {
  return apiClient.post(
    `interview/sessions/${sessionId}/answers`,
    AdaptiveAnswerSubmissionResponseSchema,
    {
      questionId,
      expectedSessionVersion,
      clientSubmissionId,
      answerKind,
      answerText,
    }
  );
};

export const submitAnswerAndGetNext = async (
  sessionId: string,
  questionId: string,
  expectedQuestionIndex: number,
  answerKind: 'answered' | 'skipped',
  answerText?: string
): Promise<AnswerSubmissionResponse> => {
  return apiClient.post(
    `interview/sessions/${sessionId}/answers`, 
    AnswerSubmissionResponseSchema, 
    { questionId, expectedQuestionIndex, answerKind, answerText }
  );
};

export const analyzeCode = async (blueprint: QuestionBlueprint, code: string): Promise<CodeAnalysisResponse> => {
  return apiClient.post('interview/code/analyze', CodeAnalysisResponseSchema, { blueprint, code });
};

export const simulateExecution = async (code: string, language: string): Promise<CodeSimulationResponse> => {
  return apiClient.post('interview/code/simulate', CodeSimulationResponseSchema, { code, language });
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

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64data = reader.result as string;
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
  });
};

export const transcribeAudio = async (blob: Blob): Promise<TranscribeAudioResponse> => {
  try {
    const base64Audio = await blobToBase64(blob);
    const data = await apiClient.post('interview/transcribe', TranscribeAudioResponseSchema, { audioBase64: base64Audio, mimeType: blob.type });
    return data;
  } catch (error) {
    console.error("Transcription failed", error);
    return { status: 'unavailable', transcript: null };
  }
};

export const generateFinalReport = async (sessionId: string): Promise<FinalReport> => {
  return apiClient.post(`interview/sessions/${sessionId}/report`, FinalReportSchema, {});
};

export default {
  calibrateIntent,
  generateInterviewPlan,
  startInterviewSession,
  submitAdaptiveTurn,
  submitAnswerAndGetNext,
  analyzeCode,
  simulateExecution,
  getHintForQuestion,
  generateIdealAnswer,
  transcribeAudio,
  generateFinalReport,
};
