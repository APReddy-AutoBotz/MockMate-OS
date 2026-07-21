// --- API Client Helpers ---
import { API_BASE } from './apiBase';
import { ValidationError } from '../utils/errorHandler';
import { InterviewSessionContext, FinalReport, InterviewTurn, QuestionBlueprint, InterviewPlan, SessionControls } from 'mockmate-shared';

const authHeader = async () => {
    const { auth } = await import('./supabaseClient');
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { 'Authorization': `Bearer ${token}` };
};

const postToBackend = async (endpoint: string, body: any) => {
    const headers = {
        'Content-Type': 'application/json',
        ...(await authHeader())
    };

    const response = await fetch(`${API_BASE}/ai/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown Error' }));
        throw new Error(err.error || `Backend request failed: ${response.statusText}`);
    }
    return response.json();
};

export const calibrateIntent = async (intentText: string, additionalContext?: string): Promise<{ recommendedPanelIDs: string[]; recommendedRole: string; matchReasons?: Record<string, string> }> => {
    if (!intentText || intentText.trim().length < 3) {
        throw new ValidationError('Please provide a more detailed job description or career goal.');
    }
    return postToBackend('calibrate-intent', { intent: intentText, context: additionalContext });
};

export function generateInterviewPlan(intentText: string, selectedPanelIDs: string[]): Promise<InterviewPlan>;
export function generateInterviewPlan(
    intentText: string,
    jdText: string | null,
    sessionControls: SessionControls,
    selectedPanelIDs: string[]
): Promise<InterviewPlan>;
export async function generateInterviewPlan(
    intentText: string,
    arg2: string[] | string | null,
    arg3?: SessionControls,
    arg4?: string[]
): Promise<InterviewPlan> {

    let jdText: string | null = null;
    let controls: SessionControls = DEFAULT_CONTROLS;
    let panelIDs: string[] = [];

    // Overload resolution
    if (Array.isArray(arg2)) {
        panelIDs = arg2;
    } else {
        jdText = arg2;
        controls = arg3 || DEFAULT_CONTROLS;
        panelIDs = arg4 || [];
    }

    return postToBackend('generate-plan', {
        intent: intentText,
        jdText,
        controls,
        panelIDs
    });
}

// Stub for V2 to catch legacy calls if any
export const generateInterviewPlanV2 = async (
    intentText: string,
    jdText: string | null,
    sessionControls: SessionControls,
    selectedPanelIDs: string[]
): Promise<InterviewPlan> => {
    return generateInterviewPlan(intentText, jdText, sessionControls, selectedPanelIDs);
};

const DEFAULT_CONTROLS: SessionControls = {
    difficulty: 'intermediate',
    includeBehavioral: true,
    includeCoding: false,
    timePerQuestion: '90s',
    deliveryMode: 'exam', reasoningMode: 'classic_behavioral',
    sourceMode: 'job_description'
};

export const startInterviewSession = async (
    context: InterviewSessionContext
): Promise<{ firstQuestion: string; personaId: string; updatedContext: InterviewSessionContext }> => {
    // Call backend
    const { sessionId, firstMessage } = await postToBackend('start-session', { context });

    // Map to frontend expectation
    return {
        firstQuestion: firstMessage,
        personaId: context.selectedPanelIDs?.[0] || 'p1',
        updatedContext: { ...context, sessionId } // Store sessionId in context
    };
};

export const submitAnswerAndGetNext = async (
    history: InterviewTurn[],
    context: InterviewSessionContext,
    personaId: string
): Promise<{ nextQuestion: string; isLastQuestion: boolean }> => {
    // Phase 3: Use Backend Persistence
    if (context.sessionId) {
        try {
            const { nextMessage, isLastQuestion } = await postToBackend('submit-answer', {
                sessionId: context.sessionId,
                answer: history[history.length - 1].candidateResponse
            });

            return {
                nextQuestion: nextMessage,
                isLastQuestion: isLastQuestion
            };
        } catch (error) {
            console.error("Backend submit failed, falling back locally", error);
        }
    }

    const totalExpected = context.interviewPlan?.meta?.controls?.totalQuestions || 7;
    const isLastQuestion = history.length >= totalExpected;
    if (isLastQuestion) {
        return { nextQuestion: '', isLastQuestion: true };
    }

    // Minimal conversational progression (fallback)
    return {
        nextQuestion: `Thanks. Next: describe a tough problem you solved recently and how you approached it.`,
        isLastQuestion: false
    };
};

export const analyzeCode = async (blueprint: QuestionBlueprint, code: string): Promise<string> => {
    const data = await postToBackend('analyze-code', { blueprint, code });
    return data.feedback;
};

export const simulateExecution = async (code: string, language: string): Promise<{ stdout: string; stderr: string }> => {
    return postToBackend('simulate-execution', { code, language });
};

export const getHintForQuestion = async (question: string): Promise<string> => {
    const data = await postToBackend('get-hint', { question });
    return data.hint;
};

export const generateIdealAnswer = async (
    question: string,
    blueprint: QuestionBlueprint | null,
    userAnswer: string
): Promise<string> => {
    const data = await postToBackend('generate-ideal', { question, blueprint, userAnswer });
    return data.idealAnswer;
};

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64data = reader.result as string;
            // Remove data:audio/webm;codecs=opus;base64, prefix
            resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
    });
};

export const transcribeAudio = async (blob: Blob): Promise<string> => {
    try {
        const base64Audio = await blobToBase64(blob);
        const data = await postToBackend('transcribe', { audioData: base64Audio, mimeType: blob.type });
        return data.transcript;
    } catch (error) {
        console.error("Transcription failed", error);
        return "I'm ready to move to the next question. (Transcription Unavailable)";
    }
};

export const generateFinalReport = async (
    history: InterviewTurn[],
    context: InterviewSessionContext
): Promise<FinalReport> => {
    try {
        return await postToBackend('generate-report', { history, context });
    } catch (error) {
        return buildFallbackFinalReport(history, context);
    }
};

const buildFallbackFinalReport = (history: InterviewTurn[], context: InterviewSessionContext): FinalReport => {
    const answeredTurns = history.filter(turn => turn.candidateResponse && turn.candidateResponse !== '[SKIPPED]');
    const skippedTurns = history.length - answeredTurns.length;
    const baseScore = Math.max(45, Math.min(78, 55 + answeredTurns.length * 8 - skippedTurns * 5));
    const role = context.candidateRole || 'your target role';

    return {
        overallSummary: answeredTurns.length
            ? `You completed a useful practice round for ${role}. Keep improving your structure by giving one clear example, your action, and the result for each answer.`
            : `You started interview practice for ${role}. Try answering at least one question so MockMate can give stronger feedback next time.`,
        evaluationModel: 'v1_dimensions',
        readiness: {
            status: baseScore >= 70 ? 'ALMOST_READY' : 'NOT_READY',
            reasoning: 'This fallback report is based on completed answers and skipped questions because the full report service was unavailable.',
        },
        quantitativeAnalysis: {
            competency_scores: [
                {
                    competency: 'Answer structure',
                    score: baseScore,
                    reason: 'Practice answers need a clear beginning, action, and result.',
                },
                {
                    competency: 'Role relevance',
                    score: Math.max(40, baseScore - 5),
                    reason: 'Connect each answer directly to the role you want.',
                },
            ],
            dimension_scores: [
                {
                    dimension: 'Communication clarity',
                    score_status: answeredTurns.length ? 'scored' : 'insufficient_evidence',
                    anchor_score: answeredTurns.length ? 3 : null,
                    normalized_score: answeredTurns.length ? baseScore : null,
                    reason: answeredTurns.length ? 'Answers were available for basic review.' : 'No completed answer was available.',
                    evidence: answeredTurns.slice(0, 2).map(turn => turn.candidateResponse.slice(0, 160)),
                    confidence: 'low',
                },
            ],
        },
        advisoryPanel: [
            {
                persona: 'MockMate Coach',
                summary: 'Keep practicing with short, specific examples. Focus on one story at a time.',
                scores: [
                    { skill: 'Clarity', score: baseScore },
                    { skill: 'Specificity', score: Math.max(40, baseScore - 8) },
                ],
            },
        ],
        questionPerformance: history.map(turn => ({
            question_text: turn.question,
            question_phase: turn.questionBlueprint?.phase,
            user_transcript: turn.candidateResponse,
            max_impact_response: 'Use a concrete example, explain your action, and close with the result.',
            feedback: turn.candidateResponse === '[SKIPPED]'
                ? 'You skipped this question. Practice a short answer for it next time.'
                : 'Good start. Make the answer stronger by adding a specific result or metric.',
            strengths: turn.candidateResponse === '[SKIPPED]' ? [] : ['You attempted the question.'],
            improvements: ['Add a clear result.', 'Connect the answer to the role.'],
        })),
        biggestRiskArea: {
            title: skippedTurns ? 'Skipped or incomplete answers' : 'Answer specificity',
            observation: skippedTurns
                ? 'Some questions were skipped during the practice session.'
                : 'Answers need stronger evidence and outcomes.',
            mitigation: 'Prepare two or three short stories before the next session.',
        },
        coachPack: {
            title: 'Next practice focus',
            redoNow: {
                question: history[0]?.question || `Tell me why you are ready for ${role}.`,
                instruction: 'Answer in three parts: situation, action, result.',
            },
            micro_drills: [
                {
                    weakness: 'Vague examples',
                    drill_prompt: 'Rewrite one answer with a number, result, or before-and-after detail.',
                    focus_point: 'Make evidence easy to understand.',
                },
            ],
        },
        simplifiedScore: baseScore,
        topStrength: answeredTurns.length ? 'You completed live practice.' : 'You opened the practice flow.',
        topWeakness: skippedTurns ? 'Skipped questions need follow-up practice.' : 'Answers need more concrete results.',
        estimatedSessionsToReady: baseScore >= 70 ? 2 : 4,
        quickWins: ['Use one example per answer.', 'End each answer with the result.', 'Keep answers under two minutes.'],
        prioritizedActions: [
            {
                title: 'Practice one stronger story',
                impact: 'high',
                timeEstimate: '10 minutes',
                exercise: 'Pick one project and write a short situation, action, and result.',
            },
        ],
    };
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
