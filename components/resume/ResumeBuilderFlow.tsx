import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResumeData } from '../../types';
import ErrorBoundary from '../ErrorBoundary';
import { audioService } from '../../services/audioService';

import UploadSetupScreen from './UploadSetupScreen';
import DiagnosticsScreen from './DiagnosticsScreen';
import RewriteEditorScreen from './RewriteEditorScreen';
import ExportScreen from './ExportScreen';

type ResumeFlowStage = 'SETUP' | 'DIAGNOSTICS' | 'EDITOR' | 'EXPORT';

interface ResumeBuilderFlowProps {
    onInterviewBridge: (jdText: string, resumeData: ResumeData) => void;
    onSpeakBridge: (summary: string) => void;
}

export const ResumeBuilderFlow: React.FC<ResumeBuilderFlowProps> = ({ onInterviewBridge, onSpeakBridge }) => {
    const [stage, setStage] = useState<ResumeFlowStage>('SETUP');
    const [resumeData, setResumeData] = useState<ResumeData | null>(null);
    const [jdText, setJdText] = useState<string>('');
    const [rawText, setRawText] = useState<string>('');
    const [scores, setScores] = useState<any>(null);

    const handleSetupComplete = (data: ResumeData, jd: string, raw: string, atsMetrics: any) => {
        audioService.playConfirm();
        setResumeData(data);
        setJdText(jd);
        setRawText(raw);
        setScores(atsMetrics);
        setStage('DIAGNOSTICS');
    };

    const handleDiagnosticsProceed = () => {
        audioService.playConfirm();
        setStage('EDITOR');
    };

    const handleEditorProceed = (updatedData: ResumeData) => {
        audioService.playConfirm();
        setResumeData(updatedData);
        setStage('EXPORT');
    };

    const handleExportRestart = () => {
        audioService.playConfirm();
        setResumeData(null);
        setJdText('');
        setStage('SETUP');
    };

    const stageIndex = { SETUP: 0, DIAGNOSTICS: 1, EDITOR: 2, EXPORT: 3 };
    const steps = ['Start', 'Review', 'Improve', 'Download'];

    const flowAnimation = {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
        transition: { duration: 0.4 }
    };

    return (
        <div className="flex w-full flex-col items-center pt-2 sm:pt-4 lg:pt-8">

            {/* ── 4-Step Progress Stepper ─────────────────────────────── */}
            <div className="mb-8 w-full max-w-2xl px-1 sm:mb-12 sm:px-6 lg:mb-16">
                <div className="relative flex items-center justify-between">

                    {/* Base track */}
                    <div className="absolute left-0 right-0 top-[15px] h-[1px] bg-white/10 z-0" />

                    {/* Amber fill track */}
                    <div
                        className="absolute left-0 top-[15px] h-[1px] bg-brand-primary z-0 transition-all duration-1000 ease-in-out"
                        style={{
                            width: `${(stageIndex[stage] / (steps.length - 1)) * 100}%`,
                            boxShadow: '0 0 8px rgba(255,188,3,0.5)',
                        }}
                    />

                    {steps.map((label, i) => {
                        const done = i < stageIndex[stage];
                        const active = i === stageIndex[stage];
                        return (
                            <div key={label} className="relative z-10 flex flex-col items-center gap-3">
                                {/* Step bubble */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all duration-500 ${
                                    done
                                        ? 'bg-brand-primary border-brand-primary text-brand-dark shadow-[0_0_16px_rgba(255,188,3,0.5)]'
                                        : active
                                        ? 'bg-brand-dark border-brand-primary text-brand-primary scale-110 shadow-[0_0_20px_rgba(255,188,3,0.4)]'
                                        : 'bg-white/5 border-white/20 text-brand-tint'
                                }`}>
                                    {done ? '✓' : i + 1}
                                </div>

                                {/* Step label */}
                                <span className={`text-[9px] font-bold uppercase tracking-[0.1em] transition-all whitespace-nowrap sm:text-[10px] sm:tracking-[0.18em] ${
                                    active
                                        ? 'text-brand-primary opacity-100'
                                        : done
                                        ? 'text-white/60'
                                        : 'text-brand-tint'
                                }`}>
                                    {label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Stage Content ──────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {stage === 'SETUP' && (
                    <motion.div key="setup" {...flowAnimation} className="w-full max-w-2xl">
                        <header className="mb-8 text-center sm:mb-10">
                            <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.16em] mb-4 opacity-90">Resume builder</p>
                            <h1 className="mb-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
                                Build your resume.
                            </h1>
                            <p className="mx-auto max-w-md text-sm leading-relaxed text-brand-tint sm:text-base">
                                Your experience is unique. We'll help you present it clearly so employers take notice.
                            </p>
                        </header>
                        <UploadSetupScreen onComplete={handleSetupComplete} />
                    </motion.div>
                )}
                {stage === 'DIAGNOSTICS' && (
                    <motion.div key="diagnostics" {...flowAnimation} className="w-full max-w-4xl mode-light">
                        <DiagnosticsScreen
                            resumeData={resumeData!}
                            scores={scores}
                            onProceed={handleDiagnosticsProceed}
                            onBack={() => setStage('SETUP')}
                        />
                    </motion.div>
                )}
                {stage === 'EDITOR' && (
                    <motion.div key="editor" {...flowAnimation} className="w-full max-w-5xl mode-light">
                        <RewriteEditorScreen
                            resumeData={resumeData!}
                            jdText={jdText}
                            onProceed={handleEditorProceed}
                            onBack={() => setStage('DIAGNOSTICS')}
                            onSpeakBridge={onSpeakBridge}
                        />
                    </motion.div>
                )}
                {stage === 'EXPORT' && (
                    <motion.div key="export" {...flowAnimation} className="w-full max-w-3xl mode-light">
                        <ExportScreen
                            resumeData={resumeData!}
                            onInterviewBridge={() => onInterviewBridge(jdText, resumeData!)}
                            onRestart={handleExportRestart}
                            onBack={() => setStage('EDITOR')}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ResumeBuilderFlow;
