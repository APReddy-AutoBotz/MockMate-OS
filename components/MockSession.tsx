
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionContext, FinalReport, InterviewTurn, QuestionBlueprint } from '../types';
import * as mockGeminiService from '../services/mockGeminiService';
import PushToTalkInput from './PushToTalkInput';
import CodeEditor from './CodeEditor';
import { PERSONAS_CONFIG } from '../personas.config';
import { audioService } from '../services/audioService';
import { trackQuestionUsage } from '../services/storageService';
import { useIsMobile } from '../hooks/useIsMobile';

interface MockSessionProps {
    sessionContext: SessionContext;
    onReportGenerated: (report: FinalReport) => void;
    onCancel: () => void;
}

type SessionPhase = 'loading_question' | 'asking' | 'thinking' | 'reviewing' | 'feedback_shown' | 'confirm_exit' | 'confirm_skip' | 'generating_report';

const IDEAL_ANSWER_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
    }
};

const MockSession: React.FC<MockSessionProps> = ({ sessionContext, onReportGenerated, onCancel }) => {
    const isMobile = useIsMobile();
    const [sessionPhase, setSessionPhase] = useState<SessionPhase>('loading_question');
    const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
    const [currentPersonaId, setCurrentPersonaId] = useState<string>('p1');
    const [currentBlueprint, setCurrentBlueprint] = useState<QuestionBlueprint | null>(null);
    const [lastTranscript, setLastTranscript] = useState<string | null>(null);
    const [codeValue, setCodeValue] = useState<string>('');
    const [codeFeedback, setCodeFeedback] = useState<string | null>(null);
    const [isAnalyzingCode, setIsAnalyzingCode] = useState(false);
    const [hint, setHint] = useState<string | null>(null);
    const [isHintLoading, setIsHintLoading] = useState(false);
    const [idealAnswer, setIdealAnswer] = useState<string | null>(null);
    const [isGeneratingIdeal, setIsGeneratingIdeal] = useState(false);
    const [reportError, setReportError] = useState('');
    const [localContext, setLocalContext] = useState(sessionContext);

    const sessionHistory = useRef<InterviewTurn[]>([]);
    const currentQuestionIndex = useRef(0);

    const totalExpectedQuestions = sessionContext.interviewPlan?.meta?.controls?.totalQuestions || 7;

    useEffect(() => {
        const startSession = async () => {
            setSessionPhase('loading_question');
            let qText = '';
            let personaId = '';

            try {
                if (sessionContext.sessionType === 'structured' && sessionContext.interviewPlan?.questionSet?.length) {
                    const firstQuestion = sessionContext.interviewPlan.questionSet[0];
                    if (firstQuestion && firstQuestion.question) {
                        setCurrentBlueprint(firstQuestion);
                        setCurrentQuestion(firstQuestion.question);
                        personaId = firstQuestion.personaFocus || sessionContext.selectedPanelIDs[0] || 'p1';
                        setCurrentPersonaId(personaId);
                        qText = firstQuestion.question;
                    }
                } else {
                    const { firstQuestion, personaId: startId, updatedContext } = await mockGeminiService.startInterviewSession(sessionContext);
                    setLocalContext(updatedContext);
                    setCurrentQuestion(firstQuestion);
                    setCurrentPersonaId(startId);
                    qText = firstQuestion;
                }

                if (!qText || qText.trim() === "") {
                    qText = "Welcome. Please describe your most relevant experience for this role.";
                    setCurrentQuestion(qText);
                    setCurrentPersonaId(sessionContext.selectedPanelIDs[0] || 'p1');
                }

                trackQuestionUsage(qText, sessionContext.candidateRole);
                audioService.playNotify();
                setSessionPhase('asking');
            } catch (err) {
                console.error("Session start error", err);
                onCancel();
            }
        };
        startSession();
    }, [sessionContext]);

    const handleAnswerSubmit = async (transcript: string) => {
        if (!currentQuestion || !currentPersonaId) return;
        audioService.playConfirm();
        setHint(null);
        setLastTranscript(transcript);
        setSessionPhase('reviewing');
    };

    const handleCodeSubmit = async (code: string) => {
        if (!currentBlueprint) return;
        setIsAnalyzingCode(true);
        audioService.playStart();
        try {
            const feedback = await mockGeminiService.analyzeCode(currentBlueprint, code);
            setCodeFeedback(feedback);
            setLastTranscript(code);
            setSessionPhase('reviewing');
        } catch (e) {
            setLastTranscript(code);
            setSessionPhase('reviewing');
        } finally {
            setIsAnalyzingCode(false);
        }
    };

    const handleConfirmTranscript = async () => {
        if (!currentQuestion || !currentPersonaId || !lastTranscript) return;
        audioService.playConfirm();
        setSessionPhase('feedback_shown');
        setIsGeneratingIdeal(true);

        try {
            const idealResponse = await withTimeout(
                mockGeminiService.generateIdealAnswer(
                    currentQuestion,
                    currentBlueprint,
                    lastTranscript
                ),
                IDEAL_ANSWER_TIMEOUT_MS,
                'Sample answer generation timed out'
            );
            setIdealAnswer(idealResponse);
        } catch (error) {
            setIdealAnswer('Keep practicing. A strong answer would include a specific example, the action you took, and a measurable result.');
        } finally {
            setIsGeneratingIdeal(false);
        }
    };

    const handleProceedAfterFeedback = () => {
        if (!currentQuestion || !currentPersonaId || !lastTranscript) return;

        const persona = PERSONAS_CONFIG.find(p => p.id === currentPersonaId) || PERSONAS_CONFIG[0];
        sessionHistory.current.push({
            interviewer: `${persona.name} — ${persona.title}`,
            question: currentQuestion,
            candidateResponse: lastTranscript,
            questionBlueprint: currentBlueprint ?? undefined,
            codeFeedback: codeFeedback || undefined
        });

        setIdealAnswer(null);
        handleProceedToNextQuestion();
    };

    const handleReRecord = () => {
        audioService.playEnd();
        setLastTranscript(null);
        setCodeFeedback(null);
        setSessionPhase('asking');
    };

    const handleRequestHint = async () => {
        if (!currentQuestion || isHintLoading) return;
        setIsHintLoading(true);
        audioService.playConfirm();
        try {
            const nudge = await mockGeminiService.getHintForQuestion(currentQuestion);
            setHint(nudge);
        } catch (e) {
            setHint("Focus on the primary technical tradeoff of your chosen approach.");
        } finally {
            setIsHintLoading(false);
        }
    };

    const handleSkipClick = () => {
        audioService.playConfirm();
        setSessionPhase('confirm_skip');
    };

    const handleConfirmSkip = () => {
        if (!currentQuestion || !currentPersonaId) return;
        audioService.playConfirm();
        const persona = PERSONAS_CONFIG.find(p => p.id === currentPersonaId) || PERSONAS_CONFIG[0];
        sessionHistory.current.push({
            interviewer: `${persona.name} — ${persona.title}`,
            question: currentQuestion,
            candidateResponse: '[SKIPPED]',
            questionBlueprint: currentBlueprint ?? undefined
        });
        handleProceedToNextQuestion();
    };

    const handleProceedToNextQuestion = async () => {
        const currentTotal = localContext.interviewPlan?.meta?.controls?.totalQuestions || 7;
        if (sessionHistory.current.length >= currentTotal) {
            generateReport();
            return;
        }

        setSessionPhase('thinking');
        setCurrentQuestion(null);
        setCurrentBlueprint(null);
        setLastTranscript(null);
        setCodeValue('');
        setCodeFeedback(null);
        setHint(null);

        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            if (localContext.sessionType === 'structured' && localContext.interviewPlan?.questionSet?.length) {
                currentQuestionIndex.current++;
                const blueprint = localContext.interviewPlan.questionSet[currentQuestionIndex.current];
                if (blueprint && blueprint.question) {
                    setCurrentBlueprint(blueprint);
                    setCurrentQuestion(blueprint.question);

                    let pId = blueprint.personaFocus;
                    const personaExists = PERSONAS_CONFIG.some(p => p.id === pId);
                    if (!personaExists || !pId) {
                        pId = localContext.selectedPanelIDs[currentQuestionIndex.current % localContext.selectedPanelIDs.length] || 'p1';
                    }

                    setCurrentPersonaId(pId);
                    audioService.playNotify();
                    setSessionPhase('asking');
                    trackQuestionUsage(blueprint.question, localContext.candidateRole);
                } else {
                    generateReport();
                }
            } else {
                const nextIndex = sessionHistory.current.length % localContext.selectedPanelIDs.length;
                const nextPersonaId = localContext.selectedPanelIDs[nextIndex];
                const { nextQuestion, isLastQuestion } = await mockGeminiService.submitAnswerAndGetNext(sessionHistory.current, localContext, nextPersonaId);

                if (isLastQuestion) generateReport();
                else if (nextQuestion) {
                    setCurrentQuestion(nextQuestion);
                    setCurrentPersonaId(nextPersonaId);
                    audioService.playNotify();
                    setSessionPhase('asking');
                    trackQuestionUsage(nextQuestion, localContext.candidateRole);
                } else generateReport();
            }
        } catch (err) { generateReport(); }
    };

    const generateReport = async () => {
        setSessionPhase('generating_report');
        setReportError('');
        try {
            const report = await mockGeminiService.generateFinalReport(sessionHistory.current.slice(), localContext);
            onReportGenerated(report);
        } catch (error) {
            setReportError('Report generation failed. Please try again, or exit without results.');
            setSessionPhase('confirm_exit');
        }
    };

    const currentPersona = PERSONAS_CONFIG.find(p => p.id === currentPersonaId) || PERSONAS_CONFIG[0];
    const isCodingQuestion = currentBlueprint?.phase === 'coding';
    const PersonaIcon = currentPersona.icon;

    return (
        <div className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-brand-dark font-sans">
            {/* Progress Top Bar */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-white/5 z-50">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${((sessionHistory.current.length + (sessionPhase === 'asking' ? 0.5 : 1)) / totalExpectedQuestions) * 100}%` }}
                    className="h-full bg-brand-primary shadow-[0_0_12px_rgba(255,188,3,0.6)] transition-all duration-1000"
                />
            </div>

            {/* Compact session header */}
            <header className="z-30 flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-brand-dark/80 px-3 py-3 backdrop-blur-xl sm:px-5 md:px-10 md:py-4">
                <div className="flex min-w-0 items-center gap-2 md:gap-4">
                    <div className={`w-2 h-2 rounded-full ${sessionPhase === 'asking' ? 'bg-brand-primary animate-pulse shadow-[0_0_10px_rgba(255,188,3,0.8)]' : 'bg-white/10'}`} />
                    <h2 className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-white/50 sm:text-[10px] sm:tracking-[0.2em]">
                        {isCodingQuestion ? 'Coding practice' : 'Interview practice'}
                    </h2>
                </div>
                <div className="flex items-center gap-2 md:gap-8">
                    <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 md:gap-2.5 md:px-3">
                        <span className="hidden text-[9px] font-bold uppercase tracking-widest text-brand-primary opacity-60 sm:inline">Question</span>
                        <span className="text-xs font-bold text-white tracking-widest">{sessionHistory.current.length + 1} / {totalExpectedQuestions}</span>
                    </div>
                    <button
                        onClick={() => {
                            setReportError('');
                            setSessionPhase('confirm_exit');
                        }}
                        className="text-[10px] font-bold text-white/50 hover:text-white transition-colors uppercase tracking-widest py-1.5"
                    >
                        Exit
                    </button>
                </div>
            </header>

            <main className="relative flex min-h-0 flex-grow overflow-hidden">
                <AnimatePresence mode="wait">
                    {/* ── Phase: Transitions ────────────────────────────────── */}
                    {(sessionPhase === 'loading_question' || sessionPhase === 'generating_report' || sessionPhase === 'thinking') && (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark z-40 px-6">
                            <div className="w-12 h-12 rounded-full border-[3px] border-brand-primary/10 border-t-brand-primary animate-spin mb-6"></div>
                            <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em] animate-pulse">
                                {sessionPhase === 'generating_report' ? 'Preparing results…' : sessionPhase === 'thinking' ? 'Next question…' : 'Setting up…'}
                            </p>
                        </motion.div>
                    )}

                    {/* ── Phase: Confirm Exit ────────────────────────────────── */}
                    {sessionPhase === 'confirm_exit' && (
                        <motion.div key="exit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-brand-dark/95 backdrop-blur-xl z-50 p-5">
                            <div className="max-w-sm w-full p-8 text-center space-y-6 bg-brand-dark border border-white/[0.1] rounded-3xl shadow-2xl">
                                <h3 className="text-xl md:text-2xl font-medium text-white tracking-tight">End session early?</h3>
                                <p className="text-xs text-brand-tint leading-relaxed">You can still get a report based on your current progress.</p>
                                {reportError && (
                                    <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/10 px-4 py-3 text-left text-xs font-medium leading-relaxed text-brand-primary">
                                        {reportError}
                                    </div>
                                )}
                                <div className="flex flex-col gap-3">
                                    <button onClick={generateReport} className="bg-brand-primary text-brand-dark font-bold py-4 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-brand-primary/10">Get partial results</button>
                                    <button onClick={onCancel} className="bg-white/5 text-white/40 font-bold py-4 rounded-xl border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10">Exit completely</button>
                                    <button onClick={() => setSessionPhase('asking')} className="text-[10px] font-bold text-brand-primary uppercase py-2 tracking-[0.12em]">Back to practice</button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Phase: Confirm Skip ────────────────────────────────── */}
                    {sessionPhase === 'confirm_skip' && (
                        <motion.div key="skip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-brand-dark/95 backdrop-blur-xl z-50 p-5">
                            <div className="max-w-sm w-full p-8 text-center space-y-6 bg-brand-dark border border-white/[0.1] rounded-3xl shadow-2xl">
                                <h3 className="text-xl md:text-2xl font-medium text-white tracking-tight">Skip this question?</h3>
                                <p className="text-xs text-brand-tint leading-relaxed">It is okay to skip. This will be noted in your final report.</p>
                                <div className="flex flex-col gap-3">
                                    <button onClick={handleConfirmSkip} className="bg-brand-primary text-brand-dark font-bold py-4 rounded-xl text-[10px] uppercase tracking-widest">Yes, skip</button>
                                    <button onClick={() => setSessionPhase('asking')} className="bg-white/5 text-white font-bold py-4 rounded-xl border border-white/10 text-[10px] uppercase tracking-widest">Never mind</button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Phase: Reviewing Answer ────────────────────────────── */}
                    {sessionPhase === 'reviewing' && (
                        <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-center justify-center bg-brand-dark/95 p-4 backdrop-blur-xl sm:p-5">
                            <div className="flex h-full w-full max-w-2xl flex-col justify-center text-center md:h-auto">
                                <span className="mb-4 text-[9px] font-bold uppercase tracking-[0.12em] text-brand-primary md:mb-6">Review your answer</span>
                                <div className="custom-scrollbar mb-6 max-h-[56dvh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/20 p-4 shadow-inner sm:p-6 md:mb-8 md:p-10">
                                    {isCodingQuestion ? (
                                        <pre className="text-left text-brand-primary font-mono text-xs md:text-sm whitespace-pre-wrap leading-relaxed">{lastTranscript}</pre>
                                    ) : (
                                        <textarea
                                            value={lastTranscript || ''}
                                            onChange={(e) => setLastTranscript(e.target.value)}
                                            className="w-full bg-transparent text-white font-medium text-lg md:text-2xl leading-relaxed focus:outline-none resize-none text-center custom-scrollbar"
                                            rows={6}
                                        />
                                    )}
                                </div>
                                <div className="flex flex-col justify-center gap-3 px-0 sm:flex-row sm:px-4">
                                    <button onClick={handleConfirmTranscript} className="w-full sm:w-auto bg-brand-primary text-brand-dark font-bold py-4 px-10 rounded-xl text-[10px] uppercase tracking-widest shadow-xl shadow-brand-primary/10 order-1 sm:order-2">Proceed</button>
                                    <button onClick={handleReRecord} className="w-full sm:w-auto bg-white/5 text-white px-10 py-4 rounded-xl border border-white/10 text-[10px] uppercase tracking-widest order-2 sm:order-1">Re-record</button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Phase: Feedback / Ideal Answer ─────────────────────── */}
                    {sessionPhase === 'feedback_shown' && (
                        <motion.div key="feedback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-dark/98 p-4 backdrop-blur-2xl sm:p-5 md:items-center">
                            <div className="w-full max-w-2xl space-y-5 py-6 md:space-y-6 md:py-10">
                                <div className="text-center space-y-2">
                                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.14em] opacity-90">Clear feedback</span>
                                    <h3 className="text-2xl font-medium tracking-tight text-white md:text-4xl">A stronger sample answer</h3>
                                </div>

                                {/* User's Answer (Summary) */}
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 text-left">
                                    <p className="text-[9px] font-bold text-brand-tint uppercase tracking-[0.12em] mb-2">Your response</p>
                                    <p className="text-xs md:text-sm text-white/40 line-clamp-2 italic leading-relaxed">"{lastTranscript}"</p>
                                </div>

                                {/* Ideal Answer Card */}
                                <div className="bg-brand-primary/[0.03] border border-brand-primary/10 rounded-2xl p-6 md:p-10 text-left relative overflow-hidden group shadow-2xl shadow-brand-primary/5">
                                    <div className="absolute top-0 right-0 w-48 h-48 bg-brand-primary/5 rounded-full blur-[60px] -mr-24 -mt-24" />
                                    <div className="flex items-center gap-3 mb-6 relative z-10">
                                        <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary text-sm">✦</div>
                                        <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em]">Sample response</span>
                                    </div>

                                    {isGeneratingIdeal ? (
                                        <div className="flex flex-col items-center gap-4 py-4">
                                            <div className="w-6 h-6 rounded-full border-2 border-brand-primary/10 border-t-brand-primary animate-spin" />
                                            <p className="text-[10px] text-brand-primary/70 font-bold tracking-[0.12em] uppercase">Preparing sample answer...</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-base md:text-xl text-white font-normal leading-relaxed relative z-10">
                                                "{idealAnswer}"
                                            </p>
                                            <div className="mt-8 pt-5 border-t border-brand-primary/10 relative z-10">
                                                <p className="text-[10px] md:text-xs text-brand-primary/50 font-medium leading-relaxed">
                                                    💡 Key takeaway: This answer uses concrete evidence and clear structure. Focus on these in your next answer.
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Continue Button */}
                                <div className="flex justify-center pt-4">
                                    <button
                                        onClick={handleProceedAfterFeedback}
                                        disabled={isGeneratingIdeal}
                                        className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary/90 disabled:bg-white/5 text-brand-dark disabled:text-brand-tint font-bold py-4 px-16 rounded-xl text-[10px] uppercase tracking-[0.12em] shadow-xl shadow-brand-primary/10 transition-all active:scale-95"
                                    >
                                        {isGeneratingIdeal ? 'Preparing...' : 'Next question'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── Phase: Active Question ────────────────────────────── */}
                    {sessionPhase === 'asking' && (
                        <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full flex-grow overflow-hidden">
                            {isCodingQuestion ? (
                                <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 w-full h-full overflow-hidden">
                                    {/* Sidebar */}
                                    <div className="col-span-12 lg:col-span-4 h-auto lg:h-full bg-black/20 border-b lg:border-r border-white/5 flex flex-col relative z-20 shrink-0">
                                        <div className="overflow-y-auto lg:flex-grow custom-scrollbar p-6 md:p-8 space-y-8">
                                            {/* Interviewer */}
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-brand-primary/5 border border-brand-primary/30 shrink-0">
                                                    {PersonaIcon && <PersonaIcon className="w-6 h-6 text-brand-primary" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white tracking-widest uppercase">{currentPersona.name}</span>
                                                    <p className="text-[9px] text-brand-primary font-bold tracking-widest uppercase opacity-40 mt-1">{currentPersona.title}</p>
                                                </div>
                                            </div>

                                            {/* Question */}
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-[1px] w-8 bg-brand-primary/40" />
                                                    <span className="text-[9px] font-bold text-brand-primary/70 uppercase tracking-[0.12em]">Coding question</span>
                                                </div>
                                                <h3 className="font-medium text-white tracking-tight leading-snug text-lg md:text-xl">
                                                    {currentQuestion || "Preparing challenge…"}
                                                </h3>
                                            </div>

                                            {/* Hint */}
                                            <AnimatePresence>
                                                {hint && (
                                                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="bg-brand-primary/5 border-l-2 border-brand-primary/60 p-4 rounded-r-xl">
                                                        <p className="text-[11px] text-brand-tint leading-relaxed italic opacity-80">"{hint}"</p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <div className="p-6 border-t border-white/5 bg-black/20">
                                            <div className="flex items-center gap-3">
                                                <button onClick={handleRequestHint} disabled={isHintLoading} className="flex-1 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-bold py-3 rounded-lg text-[9px] uppercase tracking-widest transition-all">
                                                    Hint
                                                </button>
                                                <button onClick={handleSkipClick} className="flex-1 bg-white/5 hover:bg-white/10 text-brand-tint border border-white/[0.08] font-bold py-3 rounded-lg text-[9px] uppercase tracking-[0.12em] transition-all">
                                                    Skip
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Editor Area */}
                                    <div className="col-span-12 lg:col-span-8 h-full bg-ink overflow-hidden relative group">
                                        <CodeEditor
                                            value={codeValue}
                                            onChange={setCodeValue}
                                            onSubmit={handleCodeSubmit}
                                            isProcessing={isAnalyzingCode}
                                            feedback={codeFeedback}
                                            language={currentBlueprint?.language}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex w-full flex-grow flex-col items-center justify-start overflow-y-auto bg-ink/30 p-4 pt-6 sm:p-6 md:justify-center md:p-12">
                                    <div className="flex w-full max-w-2xl flex-col items-center space-y-7 text-center md:space-y-12">
                                        {/* Interviewer Profile */}
                                        <div className="flex flex-col items-center space-y-3 md:space-y-4">
                                            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-primary/30 bg-brand-primary/5 shadow-[0_0_40px_rgba(255,188,3,0.1)] md:h-20 md:w-20">
                                                {PersonaIcon && <PersonaIcon className="h-7 w-7 text-brand-primary md:h-10 md:w-10" />}
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-xs md:text-sm font-bold text-white tracking-[0.2em] uppercase">{currentPersona.name}</span>
                                                <p className="text-[9px] md:text-[10px] text-brand-primary font-bold tracking-[0.2em] uppercase opacity-40">{currentPersona.title}</p>
                                            </div>
                                        </div>

                                        {/* The Question */}
                                        <h3 className="px-0 text-2xl font-medium leading-tight tracking-tight text-white sm:px-4 md:text-4xl lg:text-5xl">
                                            {currentQuestion ? `"${currentQuestion}"` : "Next question coming up…"}
                                        </h3>

                                        {/* Active Hint */}
                                        <AnimatePresence>
                                            {hint && (
                                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-brand-primary/5 border-l-2 border-brand-primary/60 p-5 rounded-r-2xl text-left max-w-lg self-center shadow-xl">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                                                        <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">Hint</span>
                                                    </div>
                                                    <p className="text-xs md:text-sm text-brand-tint leading-relaxed italic opacity-80">"{hint}"</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Input Area */}
                                        <div className="flex w-full flex-col items-center gap-6 pt-2 md:gap-12 md:pt-6">
                                            <PushToTalkInput onTranscriptSubmit={handleAnswerSubmit} disabled={false} />
                                            <div className="flex gap-4 items-center">
                                                <button onClick={handleRequestHint} disabled={isHintLoading} className="font-bold text-[9px] text-brand-primary hover:text-white transition-all uppercase tracking-widest px-6 py-2.5 border border-brand-primary/20 rounded-xl bg-brand-primary/5">
                                                    {isHintLoading ? '…' : 'Hint'}
                                                </button>
                                                <button onClick={handleSkipClick} className="font-bold text-[9px] text-brand-tint hover:text-white transition-all uppercase tracking-[0.12em] px-6 py-2.5 border border-white/[0.06] rounded-xl bg-white/[0.02]">
                                                    Skip
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default MockSession;
