import { z } from 'zod';
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
    return apiClient.post<any>('interview/calibrate', { intentText, additionalContext }, z.any());
};

export const generateInterviewPlan = async (
    intentText: string,
    jdText: string | null,
    sessionControls: any,
    selectedPanelIDs: string[]
): Promise<InterviewPlan> => {
    return apiClient.post<any>('interview/plan', { intentText, jdText, controls: sessionControls, selectedPanelIDs }, z.any());
};

export const generateInterviewPlanV2 = async (
    intentText: string,
    jdText: string | null,
    sessionControls: any,
    selectedPanelIDs: string[],
    contextData: any
): Promise<InterviewPlan> => {
    return apiClient.post<any>('interview/plan', { intentText, jdText, controls: sessionControls, selectedPanelIDs, contextData }, z.any());
};

export const startInterviewSession = async (
    context: InterviewSessionContext
): Promise<{ firstQuestion: QuestionBlueprint; personaId: string; sessionId: string }> => {
    const data = await apiClient.post<{ sessionId: string; firstQuestion: QuestionBlueprint }>('interview/sessions', { context }, z.any());
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
    return apiClient.post<any>(`interview/sessions/${sessionId}/answers`, { questionId, answerText }, z.any());
};

export const analyzeCode = async (blueprint: QuestionBlueprint, code: string): Promise<string> => {
    const data = await apiClient.post<{ feedback: string }>('interview/code/analyze', { blueprint, code }, z.any());
    return data.feedback;
};

export const simulateExecution = async (code: string, language: string): Promise<{ stdout: string; stderr: string }> => {
    return apiClient.post<any>('interview/code/simulate', { code, language }, z.any());
};

export const getHintForQuestion = async (question: string): Promise<string> => {
    const data = await apiClient.post<{ hint: string }>('interview/hint', { question }, z.any());
    return data.hint;
};

export const generateIdealAnswer = async (
    question: string,
    blueprint: QuestionBlueprint | null,
    userAnswer: string
): Promise<string> => {
    const data = await apiClient.post<{ idealResponse: string }>('interview/ideal-response', { question, blueprint, userAnswer }, z.any());
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

export const transcribeAudio = async (blob: Blob): Promise<string> => {
    try {
        const base64Audio = await blobToBase64(blob);
        const data = await apiClient.post<{ transcript: string }>('interview/transcribe', { audioBase64: base64Audio, mimeType: blob.type }, z.any());
        return data.transcript;
    } catch (error) {
        console.error("Transcription failed", error);
        return "I'm ready to move to the next question. (Transcription Unavailable)";
    }
};

export const generateFinalReport = async (sessionId: string): Promise<FinalReport> => {
    return apiClient.post(`interview/sessions/${sessionId}/report`);
};

export default {
    calibrateIntent,
    generateInterviewPlan,
    generateInterviewPlanV2,
    startInterviewSession,
    submitAnswerAndGetNext,
    analyzeCode,
    simulateExecution,
    getHintForQuestion,
    transcribeAudio,
    generateFinalReport,
    generateIdealAnswer
};
