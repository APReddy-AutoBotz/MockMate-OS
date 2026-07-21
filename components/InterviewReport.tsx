// @ts-nocheck
import { UserProfile } from "../types/ui";

import React, { useMemo, useCallback } from 'react';
import { FinalReport, QuestionPerformance, AdvisoryPanel } from "mockmate-shared";
import { generatePdf } from '../services/pdfGenerator';
import { motion } from 'framer-motion';
import { PERSONAS_CONFIG } from '../personas.config';
import { useIsMobile } from '../hooks/useIsMobile';
import PilotFeedbackCard from './PilotFeedbackCard';
;

const sectionAnimation = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-50px" },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }
};

/* ─── Advisor Score Card ────────────────────────────────────────────────── */
const PersonaScoreCard: React.FC<{ advisory: AdvisoryPanel[] }> = React.memo(({ advisory }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {advisory.map((adv, i) => {
            const personaNameOnly = adv?.split('—')[0]?.split('(')[0].trim();
            const personaDetails = useMemo(() => PERSONAS_CONFIG.find(p => p.name.toLowerCase().includes(personaNameOnly.toLowerCase())), [personaNameOnly]);
            const Icon = personaDetails?.icon;

            return (
                <motion.div
                    key={i}
                    {...sectionAnimation}
                    className="bg-white/[0.02] p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden group border border-white/[0.06] rounded-2xl shadow-xl hover:bg-white/[0.04] transition-all"
                >
                    <div className="flex items-start justify-between relative z-10">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl bg-brand-primary/5 border border-brand-primary/20 flex items-center justify-center transition-all duration-500`}>
                                {Icon ? <Icon className="w-6 h-6 text-brand-primary transition-colors" /> : <span className="text-lg">💬</span>}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-base font-bold text-white tracking-tight leading-tight">{adv}</span>
                                <span className="text-[9px] font-bold text-brand-primary uppercase mt-1 tracking-[0.2em] opacity-40">Interviewer Verdict</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end">
                            <div className="text-2xl font-bold text-white tracking-tight leading-none">{adv?.[0]?.score || (adv as any).score || '-'}<span className="text-[10px] text-brand-tint ml-0.5">/5</span></div>
                            <div className="w-16 h-1 bg-white/5 mt-2 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    whileInView={{ width: `${((adv?.[0]?.score || (adv as any).score || 0) / 5) * 100}%` }}
                                    className={`h-full bg-brand-primary`}
                                />
                            </div>
                        </div>
                    </div>
                    <p className="text-sm text-white/60 leading-relaxed italic border-l-2 border-brand-primary/20 pl-4 py-0.5">
                        "{adv.assessment}"
                    </p>
                </motion.div>
            );
        })}
    </div>
));

/* ─── Main Scorecard ────────────────────────────────────────────────────── */
const Scorecard: React.FC<{ report: FinalReport; userProfile?: UserProfile | null }> = ({ report, userProfile }) => {
    const rawScore = report.simplifiedScore
        ?? report.quantitativeAnalysis?.dimension_scores?.find(d => d.normalized_score !== null)?.normalized_score
        ?? report.quantitativeAnalysis?.dimension_scores?.[0]?.score;
        
    const hasValidScore = rawScore !== undefined && rawScore !== null;
    const overallScore = rawScore ?? 0;
    
    const tier = !hasValidScore ? 'INCOMPLETE' : overallScore >= 90 ? 'Very strong' : overallScore >= 80 ? 'Solid progress' : 'Keep practicing';

    const getDimensionScore = (term: string) => {
        const found = report.quantitativeAnalysis?.dimension_scores?.find(d => d.dimension.toLowerCase().includes(term));
        return found?.normalized_score;
    };

    const dimensions = [
        { name: 'Communication', score: getDimensionScore('comm') },
        { name: 'Role knowledge', score: getDimensionScore('tech') },
        { name: 'Confidence', score: getDimensionScore('conf') },
        { name: 'Structure', score: getDimensionScore('struct') },
    ];

    return (
        <div className="bg-white/[0.02] p-8 md:p-12 border border-white/[0.06] rounded-3xl overflow-hidden relative group backdrop-blur-2xl shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />

            <div className="flex flex-col lg:flex-row justify-between items-center gap-10 relative z-10">
                <div className="text-center md:text-left space-y-4">
                    <div className="flex items-center justify-center md:justify-start gap-6">
                        <span className="text-6xl md:text-8xl font-black text-white tracking-tight leading-none drop-shadow-lg">
                            {hasValidScore ? overallScore : 'N/A'}
                        </span>
                        <div className="flex flex-col items-start gap-2">
                            {hasValidScore && <span className="text-xl text-white/10 font-bold">/ 100</span>}
                            <span className="bg-brand-primary text-brand-dark px-3 py-1 rounded-lg font-black text-[9px] tracking-[0.2em] uppercase">{tier}</span>
                        </div>
                    </div>
                    <h1 className="text-2xl md:text-4xl font-medium text-white tracking-tight">Your interview performance summary</h1>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full lg:w-auto">
                    {dimensions.map(d => (
                        <div key={d.name} className="flex flex-col gap-2">
                            <span className="text-[9px] text-brand-tint font-bold tracking-[0.12em] uppercase">{d.name}</span>
                            <div className="flex items-center gap-4">
                                <div className="w-32 md:w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand-primary" style={{ width: `${d.score ?? 0}%` }}></div>
                                </div>
                                <span className="text-xs text-white/50 font-medium tracking-wide">
                                    {d.score !== undefined && d.score !== null ? d.score : 'N/A'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-center gap-6 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary font-bold text-xl shadow-lg">
                        {userProfile?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white tracking-tight">{userProfile?.name || 'Job Seeker'}</span>
                        <span className="text-[10px] text-brand-tint mt-1">{userProfile?.targetRole || 'Candidate'} · {userProfile?.companyName || 'Target company'}</span>
                    </div>
                </div>
                <div className="text-center sm:text-right">
                    <span className="text-[9px] text-brand-tint font-bold tracking-[0.12em] uppercase block mb-1">Session Type</span>
                    <span className="text-xs font-bold text-brand-primary italic">Expert Interview Practice</span>
                </div>
            </div>
        </div>
    );
};

/* ─── Question Breakdown ────────────────────────────────────────────────── */
const GranularAuditSection: React.FC<{ performance: QuestionPerformance[] }> = React.memo(({ performance }) => {
    return (
        <div className="space-y-12">
            <div className="text-center space-y-2">
                <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.12em]">Deep dive</span>
                <h2 className="text-2xl md:text-4xl font-medium text-white tracking-tight">Question-by-question analysis</h2>
            </div>

            <div className="space-y-6">
                {(performance || []).map((q, i) => {
                    const isSkipped = q.user_transcript === '[SKIPPED]';
                    return (
                        <motion.div
                            key={i}
                            {...sectionAnimation}
                            className="bg-white/[0.02] border border-white/[0.06] overflow-hidden rounded-2xl"
                        >
                            <div className="px-6 md:px-8 py-4 md:py-6 bg-white/[0.02] border-b border-white/[0.06]">
                                <span className="text-[9px] text-brand-tint font-bold mb-2 block tracking-[0.12em] uppercase">Question {i + 1}</span>
                                <h4 className="text-base md:text-xl font-medium text-white leading-relaxed italic">"{q.question_text}"</h4>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2">
                                <div className="p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
                                    <h5 className="text-[9px] text-brand-tint font-bold mb-4 uppercase tracking-[0.12em]">Your Answer {isSkipped ? "(Skipped)" : ""}</h5>
                                    <div className={`p-5 rounded-xl border ${isSkipped ? 'bg-white/5 border-white/10' : 'bg-black/20 border-white/[0.04]'} min-h-[100px]`}>
                                        <p className={`text-sm ${isSkipped ? 'text-brand-tint italic' : 'text-white/70'} leading-relaxed`}>
                                            {isSkipped ? "You chose to skip this question during the session." : `"${q.user_transcript}"`}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-6 md:p-8 bg-brand-primary/[0.02]">
                                    <h5 className="text-[9px] text-brand-primary font-bold mb-4 uppercase tracking-widest">Expert Advice</h5>
                                    <div className="bg-black/30 p-5 rounded-xl border border-brand-primary/10 min-h-[100px] shadow-inner">
                                        <p className="text-sm text-brand-primary/80 font-normal leading-relaxed italic">
                                            {q.max_impact_response || 'Our AI is still processing the best approach for this specific question.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 md:px-8 py-6 md:py-8 bg-black/10 border-t border-white/[0.06]">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Strengths */}
                                    {q.strengths && q.strengths.length > 0 && (
                                        <div className="space-y-3">
                                            <h5 className="text-[9px] text-brand-primary font-bold mb-2 flex items-center gap-2 tracking-widest uppercase">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" /> Key Strengths
                                            </h5>
                                            <ul className="space-y-2">
                                                {q.strengths.map((s, idx) => (
                                                    <li key={idx} className="text-xs text-white/50 flex items-start gap-3 leading-relaxed">
                                                        <span className="text-brand-primary font-bold">✓</span>
                                                        {s}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Improvements */}
                                    {q.improvements && q.improvements.length > 0 && (
                                        <div className="space-y-3">
                                            <h5 className="text-[9px] text-white/40 font-bold mb-2 flex items-center gap-2 tracking-widest uppercase">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" /> Areas to improve
                                            </h5>
                                            <ul className="space-y-2">
                                                {q.improvements.map((s, idx) => (
                                                    <li key={idx} className="text-xs text-white/50 flex items-start gap-3 leading-relaxed">
                                                        <span className="text-brand-primary font-bold">•</span>
                                                        {s}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Fallback Legacy Feedback */}
                                    {(!q.strengths || q.strengths.length === 0) && (
                                        <div className="col-span-full">
                                            <p className="text-sm text-white/40 leading-relaxed italic border-l-2 border-white/5 pl-4">
                                                {q.feedback}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
});

interface InterviewReportProps {
    report: FinalReport;
    onRestart: () => void;
    userProfile?: UserProfile | null;
    sessionId?: string;
}

const InterviewReport: React.FC<InterviewReportProps> = React.memo(({ report, onRestart, userProfile, sessionId }) => {
    const [isDownloading, setIsDownloading] = React.useState(false);

    const handleDownload = useCallback(async () => {
        setIsDownloading(true);
        try {
            await generatePdf(report);
        } catch (error) {
            console.error('PDF generation failed:', error);
        } finally {
            setIsDownloading(false);
        }
    }, [report]);

    const handleRestart = useCallback(() => {
        onRestart();
    }, [onRestart]);

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'INTERVIEW_READY': return 'text-brand-primary border-brand-primary/30 bg-brand-primary/5';
            case 'ALMOST_READY': return 'text-white/60 border-white/10 bg-white/5';
            case 'NOT_READY': return 'text-brand-tint border-white/10 bg-transparent';
            default: return 'text-brand-tint border-white/10 bg-transparent';
        }
    };

    const statusClasses = getStatusColor(report.readiness?.status);

    return (
        <div className="w-full max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-16 space-y-16 md:space-y-24 pb-32">
            {/* Header Scorecard */}
            <Scorecard report={report} userProfile={userProfile} />

            {/* Overall Verdict */}
            <header className="text-center space-y-8">
                <p className="text-lg md:text-2xl text-white/40 max-w-3xl mx-auto leading-relaxed font-normal italic">
                    {report?.overallSummary || "We're putting together your final performance results..."}
                </p>

                {report?.readiness && (
                    <motion.div
                        {...sectionAnimation}
                        className="mt-12 p-8 md:p-12 bg-white/[0.02] border border-white/[0.06] rounded-3xl max-w-3xl mx-auto shadow-2xl relative group overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-brand-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                        <div className="flex flex-col items-center relative z-10">
                            <div className="mb-8 flex flex-col items-center">
                                <span className="text-[9px] text-brand-primary font-bold tracking-[0.12em] uppercase mb-4">Hiring readiness</span>
                                <div className={`px-8 py-3 border rounded-full flex items-center gap-3 ${statusClasses} transition-all shadow-xl`}>
                                    <div className={`w-2 h-2 rounded-full bg-current animate-pulse shadow-[0_0_8px_rgba(255,188,3,1)]`} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">
                                        {(report.readiness.status || "Evaluating").replace(/_/g, ' ')}
                                    </span>
                                </div>
                            </div>

                            <p className="text-base md:text-xl text-white font-medium leading-relaxed max-w-2xl mx-auto italic opacity-80 text-center">
                                "{report.readiness.reasoning || "Analyzing your session data to determine your interview readiness level..."}"
                            </p>
                        </div>
                    </motion.div>
                )}
            </header>

            {/* Detail Sections */}
            {report?.questionPerformance && <GranularAuditSection performance={report.questionPerformance} />}

            {report?.advisoryPanel && report.advisoryPanel.length > 0 && (
                <section className="space-y-10">
                    <div className="text-center space-y-2">
                        <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.12em]">Advisor panel</span>
                        <h3 className="text-2xl md:text-4xl font-medium text-white tracking-tight">Interviewer feedback</h3>
                    </div>
                    <PersonaScoreCard advisory={report.advisoryPanel} />
                </section>
            )}

            {/* Pilot Feedback */}
            {userProfile?.pilot_user && (
                <section {...sectionAnimation}>
                    <PilotFeedbackCard
                        sessionId={sessionId || ''}
                        existingFeedback={report}
                    />
                </section>
            )}

            {/* Action Footer */}
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-12">
                <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="px-10 py-5 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all font-bold text-[10px] tracking-widest uppercase border border-white/[0.08] active:scale-95"
                >
                    {isDownloading ? 'Downloading...' : 'Download Report (PDF)'}
                </button>
                <button
                    onClick={handleRestart}
                    className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark px-12 py-5 rounded-2xl shadow-xl shadow-brand-primary/20 transition-all active:scale-95 font-bold text-[10px] tracking-widest uppercase"
                >
                    Start New Session
                </button>
            </div>
        </div>
    );
});

export default InterviewReport;
