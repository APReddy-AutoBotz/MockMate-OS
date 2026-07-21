// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { InterviewSessionContext, InterviewPlan, SessionControls } from 'mockmate-shared';
import * as mockGeminiService from '../services/mockGeminiService';
import PanelSelector from './PanelSelector';
import SessionBuilder from './SessionBuilder';
import SessionControlsEditor from './SessionControlsEditor';
import { UploadIcon } from './icons/UploadIcon';
import { audioService } from '../services/audioService';

interface SessionPrepProps {
    onContextReady: (context: InterviewSessionContext) => void;
    context: InterviewSessionContext;
    onGoBack: () => void;
}

const defaultControls: SessionControls = {
    difficulty: 'intermediate',
    totalQuestions: 15,
    includeBehavioral: true,
    includeCoding: false,
    timePerQuestion: '90s',
    deliveryMode: 'exam', reasoningMode: 'classic_behavioral',
    sourceMode: 'job_description',
};

const DEFAULT_PANEL_IDS = ['p1', 'p2', 'p3'];
const CALIBRATION_TIMEOUT_MS = 12000;

const withSetupTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
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

const buildFallbackInterviewPlan = (
    intentText: string,
    controls: SessionControls,
    panelIDs: string[],
    candidateRole: string,
): InterviewPlan => {
    const safePanelIDs = panelIDs.length ? panelIDs : DEFAULT_PANEL_IDS;
    const fallbackControls: SessionControls = {
        ...controls,
        totalQuestions: Math.min(controls.totalQuestions || 5, 5),
    };
    const role = candidateRole || intentText || 'your target role';
    const baseRubric: Record<string, string> = {
        communication: 'Clear and structured',
        relevance: 'Directly answers the prompt',
    };
    const questions = [
        `Tell me about your background and why you are interested in ${role}.`,
        `Describe a project or responsibility that best shows you are ready for ${role}.`,
        `Tell me about a difficult problem you handled and how you worked through it.`,
        `How do you explain your work clearly to someone who does not know the technical details?`,
        `What would you improve in your current skills before starting this role?`,
    ];

    return {
        meta: {
            intent: 'General Mock Interview',
            controls: fallbackControls,
        },
        jdInsights: {
            source: 'genericProfile',
            role,
            mustHaveSkills: ['Role fundamentals', 'Problem solving', 'Clear communication'],
            niceToHave: ['Examples with measurable results'],
            domains: ['General'],
            tools: [],
            softSkills: ['Communication', 'Ownership', 'Adaptability'],
            competencyWeights: { communication: 1, relevance: 1 },
        },
        questionSet: questions.slice(0, fallbackControls.totalQuestions).map((question, index) => ({
            id: `fallback-${index + 1}`,
            phase: index === 2 ? 'scenario' : index === 3 ? 'process' : 'behavioral',
            difficulty: 'L2',
            type: index === 2 ? 'case' : index === 3 ? 'process' : 'roleplay',
            question,
            expectedSignals: ['Specific example', 'Clear structure', 'Role connection'],
            failureModes: ['Vague answer', 'No example', 'Unclear outcome'],
            evaluationCriteria: ['Clarity', 'Specificity', 'Relevance'],
            personaFocus: safePanelIDs[index % safePanelIDs.length],
            rubric: baseRubric, sourceBullets: [intentText], estTimeSec: 90 })),
    };
};

const FileDropZone: React.FC<{ onTextReady: (text: string) => void; mode: string }> = ({ onTextReady, mode }) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [isPasting, setIsPasting] = useState(false);
    const [pastedText, setPastedText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isQuestionBank = mode === 'question_bank';

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setIsPasting(false);
        audioService.playConfirm();

        try {
            if (file.type === 'application/pdf') {
                onTextReady(`[Extracted from PDF: ${file.name} - Mode: ${mode}] ${isQuestionBank ? 'STUDY MATERIAL:' : 'REQUIREMENTS:'} `);
            } else {
                const text = await file.text();
                onTextReady(text);
            }
        } catch (err) {
            console.error('Failed to read file', err);
        }
    };

    const handlePasteSubmit = () => {
        if (pastedText.trim()) {
            onTextReady(pastedText);
            setFileName('Pasted text');
            setIsPasting(false);
            audioService.playConfirm();
        }
    };

    return (
        <div className="w-full space-y-5 sm:space-y-8">
            <AnimatePresence mode="wait">
                {!isPasting ? (
                    <motion.div
                        key="dropzone"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full"
                    >
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="group flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-[22px] border-2 border-dashed border-brand-tint/15 bg-brand-dark/40 px-5 py-6 shadow-2xl backdrop-blur-3xl transition-all duration-300 hover:border-brand-primary/35 hover:bg-brand-dark/55 sm:gap-6 sm:px-8 sm:py-10 md:px-12 md:py-14"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".txt,.pdf,.doc,.docx"
                            />
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-primary/20 bg-brand-primary/10 transition-all duration-300 group-hover:bg-brand-primary group-hover:text-brand-dark sm:h-16 sm:w-16">
                                <UploadIcon className="h-7 w-7 text-brand-primary group-hover:text-brand-dark sm:h-9 sm:w-9" />
                            </div>
                            <div className="space-y-2 text-center sm:space-y-3">
                                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-colors group-hover:text-brand-primary md:text-[14px]">
                                    {fileName
                                        ? `Selected: ${fileName}`
                                        : isQuestionBank
                                            ? 'Upload study notes (optional)'
                                            : 'Upload job description (optional)'}
                                </p>
                                <p className="text-[11px] font-medium text-brand-tint">PDF, TXT, or Word file. Tap to browse.</p>
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsPasting(true); }}
                            className="mt-5 w-full text-[11px] font-bold uppercase tracking-[0.1em] text-brand-primary transition-all hover:text-white sm:mt-8 md:text-[12px]"
                        >
                            Or paste text instead
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="paste-area"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full space-y-5 rounded-[22px] border border-brand-tint/15 bg-brand-dark/55 p-5 shadow-[0_40px_80px_-28px_rgba(0,0,0,0.8)] backdrop-blur-3xl sm:space-y-8 sm:p-8 md:p-12"
                    >
                        <textarea
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            placeholder={isQuestionBank ? 'Paste your study notes or questions here...' : 'Paste the job description here...'}
                            className="custom-scrollbar h-44 w-full resize-none bg-transparent text-base leading-relaxed tracking-tight text-white placeholder:text-brand-tint/45 focus:outline-none sm:h-56 sm:text-xl md:h-72 md:text-2xl"
                            autoFocus
                        />
                        <div className="flex flex-col gap-5 md:flex-row">
                            <button
                                onClick={handlePasteSubmit}
                                className="flex-1 rounded-2xl bg-brand-primary py-5 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-dark shadow-2xl shadow-brand-primary/20 transition-all active:scale-95 md:py-6 md:text-[13px]"
                            >
                                Save and continue
                            </button>
                            <button
                                onClick={() => setIsPasting(false)}
                                className="px-10 py-5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-tint transition-all hover:text-white md:px-16 md:py-6 md:text-[12px]"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const SessionPrep: React.FC<SessionPrepProps> = ({ onContextReady, context, onGoBack }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isPlanReady, setIsPlanReady] = useState(false);
    const [plan, setPlan] = useState<InterviewPlan | null>(null);
    const [selectedPanelIDs, setSelectedPanelIDs] = useState<string[]>([]);
    const [showCustomization, setShowCustomization] = useState(false);
    const [sessionControls, setSessionControls] = useState<SessionControls>(defaultControls);
    const [currentContext, setCurrentContext] = useState(context);
    const [jdText, setJdText] = useState<string | null>(null);
    const [matchReasons, setMatchReasons] = useState<Record<string, string>>({});
    const [planError, setPlanError] = useState('');

    useEffect(() => {
        let isActive = true;

        const init = async () => {
            setIsLoading(true);
            setPlanError('');

            try {
                const { recommendedPanelIDs, recommendedRole, matchReasons } = await withSetupTimeout(
                    mockGeminiService.calibrateIntent(context.intentText),
                    CALIBRATION_TIMEOUT_MS,
                    'Interview setup took too long'
                );

                if (!isActive) return;

                const panelIDs = recommendedPanelIDs?.length ? recommendedPanelIDs : DEFAULT_PANEL_IDS;
                setSelectedPanelIDs(panelIDs);
                setMatchReasons(matchReasons || {});
                setCurrentContext(prev => ({
                    ...prev,
                    candidateRole: recommendedRole || prev.candidateRole || context.intentText,
                    selectedPanelIDs: panelIDs,
                }));
            } catch (error) {
                if (!isActive) return;

                setSelectedPanelIDs(DEFAULT_PANEL_IDS);
                setMatchReasons({});
                setCurrentContext(prev => ({
                    ...prev,
                    candidateRole: prev.candidateRole || context.intentText,
                    selectedPanelIDs: DEFAULT_PANEL_IDS,
                }));
            } finally {
                if (isActive) setIsLoading(false);
            }
        };

        init();

        return () => {
            isActive = false;
        };
    }, [context.intentText]);

    const handleGeneratePlan = async () => {
        setIsLoading(true);
        setPlanError('');
        audioService.playStart();
        try {
            const interviewPlan = await mockGeminiService.generateInterviewPlan(
                context.intentText,
                jdText,
                sessionControls,
                selectedPanelIDs,
            );
            setPlan(interviewPlan);
            setIsPlanReady(true);
        } catch (err) {
            const fallbackPlan = buildFallbackInterviewPlan(
                context.intentText,
                sessionControls,
                selectedPanelIDs,
                currentContext.candidateRole,
            );
            setPlan(fallbackPlan);
            setIsPlanReady(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartSession = () => {
        if (!plan) return;
        audioService.playConfirm();
        const weights = plan.jdInsights?.competencyWeights || {};
        onContextReady({
            ...currentContext,
            selectedPanelIDs,
            interviewPlan: plan,
            competencyWeights: weights as Record<string, number>,
            jdInsights: plan.jdInsights,
        });
    };

    if (isPlanReady && plan) {
        return (
            <SessionBuilder
                jdInsights={plan.jdInsights}
                // competencyWeights={Object.entries(plan.jdInsights?.competencyWeights || {}).map(([k, v]) => ({ name: k, weight: v as number }))}
                questionSet={plan.questionSet}
                onAdjustSpecs={() => { audioService.playEnd(); setIsPlanReady(false); }}
                onInitialize={handleStartSession}
            />
        );
    }

    return (
        <div className="mx-auto w-full max-w-5xl px-2 py-3 sm:px-6 sm:py-6 md:px-10 md:py-8">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
            >
                <div className="mb-6 w-full md:mb-10">
                    <FileDropZone onTextReady={setJdText} mode={sessionControls.sourceMode} />
                </div>

                <div className="mb-4 w-full border-l-[3px] border-brand-primary/40 pl-4 text-left md:mb-6 md:pl-5">
                    <h3 className="text-base font-bold uppercase leading-none tracking-[0.12em] text-brand-primary md:text-xl">
                        Your interview panel
                    </h3>
                    <p className="mt-2 text-xs font-medium text-brand-tint">These practice interviewers will ask your questions.</p>
                </div>

                <div className="mb-6 w-full md:mb-10">
                    <PanelSelector selectedPanelIDs={selectedPanelIDs} onSelectionChange={setSelectedPanelIDs} matchReasons={matchReasons} />
                </div>

                <div className="mb-6 w-full overflow-hidden rounded-[22px] border border-brand-tint/15 bg-brand-dark/50 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all duration-300 md:mb-10 md:rounded-[24px]">
                    <button
                        onClick={() => { audioService.playConfirm(); setShowCustomization(!showCustomization); }}
                        className="flex w-full items-center justify-between border-b border-brand-tint/15 px-5 py-4 transition-all hover:bg-white/[0.03] md:px-8 md:py-5"
                    >
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="h-2 w-2 rounded-full bg-brand-primary" />
                            <h4 className="text-sm font-medium tracking-tight text-white md:text-base">Customize your practice</h4>
                        </div>
                        <span className={`text-xs text-brand-primary transition-transform duration-300 ${showCustomization ? 'rotate-180' : 'rotate-0'}`}>v</span>
                    </button>
                    <AnimatePresence initial={false}>
                        {showCustomization && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                className="px-5 py-5 md:px-8 md:py-6"
                            >
                                <SessionControlsEditor controls={sessionControls} onChange={setSessionControls} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {planError && (
                    <div className="mb-4 w-full rounded-2xl border border-brand-primary/20 bg-brand-primary/10 px-4 py-3 text-sm font-medium leading-relaxed text-brand-primary">
                        {planError}
                    </div>
                )}

                <div className="flex w-full flex-col gap-3 sm:flex-row md:gap-4">
                    <button
                        onClick={handleGeneratePlan}
                        disabled={isLoading}
                        className="order-1 flex-[2] rounded-xl bg-brand-primary py-4 text-xs font-bold uppercase tracking-[0.12em] text-brand-dark shadow-[0_10px_30px_-8px_rgba(255,188,3,0.35)] transition-all hover:bg-brand-primary/90 active:scale-[0.98] disabled:opacity-35 sm:order-2 md:py-5"
                    >
                        {isLoading ? 'Setting things up...' : 'Build my interview plan'}
                    </button>
                    <button
                        onClick={onGoBack}
                        className="order-2 flex-1 rounded-xl border border-brand-tint/15 bg-white/5 py-4 text-xs font-bold uppercase tracking-[0.12em] text-brand-tint transition-all hover:bg-white/10 hover:text-white active:scale-[0.98] sm:order-1 md:py-5"
                    >
                        Choose a different practice type
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SessionPrep;
