import React, { useState, useCallback } from 'react';
import { FinalReport, PrioritizedAction } from 'mockmate-shared';
import { motion, AnimatePresence } from 'framer-motion';
import { generatePdf } from '../services/pdfGenerator';

interface SimplifiedReportProps {
    report: FinalReport;
    onRestart: () => void;
    onShowDetails?: () => void;
}

const SimplifiedReport: React.FC<SimplifiedReportProps> = ({ report, onRestart, onShowDetails }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

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

    const isNotAssessed = report.readiness?.status === 'NOT_ASSESSED' || report.simplifiedScore === null;
    const score = report.simplifiedScore;
    const readinessPercent = score !== null && typeof score === 'number' ? Math.round(score) : null;

    const getReadinessText = () => {
        if (isNotAssessed || readinessPercent === null) return 'NOT ASSESSED';
        if (readinessPercent >= 80) return 'Interview Ready';
        if (readinessPercent >= 60) return 'Almost Ready';
        return 'Needs Practice';
    };

    return (
        <div className="w-full max-w-3xl mx-auto px-5 md:px-8 py-10 md:py-16 space-y-8">
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/[0.02] border border-white/[0.06] rounded-2xl md:rounded-3xl p-8 md:p-12 text-center space-y-8 shadow-2xl relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-[80px] -mr-32 -mt-32" />

                <div className="space-y-2 relative z-10">
                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.12em]">Session result</span>
                    <h1 className="text-2xl md:text-4xl font-medium text-white tracking-tight">Your practice performance</h1>
                </div>

                <div className="relative z-10">
                    <div className="text-7xl md:text-9xl font-black text-white tracking-tighter leading-none mb-4">
                        {readinessPercent !== null ? readinessPercent : '--'}
                        <span className="text-xl md:text-2xl text-brand-tint font-bold ml-1">/100</span>
                    </div>

                    <div className="w-full max-w-sm mx-auto h-1.5 bg-white/5 rounded-full overflow-hidden mt-6 shadow-inner">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${readinessPercent !== null ? readinessPercent : 0}%` }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            className="h-full bg-brand-primary shadow-[0_0_12px_rgba(255,188,3,0.6)]"
                        />
                    </div>
                </div>

                <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-brand-primary/20 bg-brand-primary/5 relative z-10">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">
                        {getReadinessText()}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12 relative z-10">
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 text-left">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-brand-primary text-xs font-bold uppercase tracking-widest opacity-60">Strength</span>
                        </div>
                        <p className="text-sm text-white/80 font-medium italic leading-relaxed">
                            "{report.topStrength || getTopStrength(report)}"
                        </p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 text-left">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-brand-tint text-xs font-bold uppercase tracking-[0.12em]">Focus area</span>
                        </div>
                        <p className="text-sm text-white/40 font-medium italic leading-relaxed">
                            "{report.topWeakness || getTopWeakness(report)}"
                        </p>
                    </div>
                </div>
            </motion.section>

            <motion.section
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
            >
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between transition-all group"
                >
                    <span className="text-sm font-bold text-white/50 group-hover:text-white uppercase tracking-widest">Show detailed breakdown</span>
                    <motion.span
                        animate={{ rotate: showDetails ? 180 : 0 }}
                        className="text-brand-primary text-xs"
                    >
                        ▼
                    </motion.span>
                </button>

                <AnimatePresence>
                    {showDetails && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="p-6 md:p-10 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-10">
                                {report.quantitativeAnalysis && report.quantitativeAnalysis.dimension_scores.length > 0 && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1 h-1 rounded-full bg-brand-primary" />
                                            <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">Skills Matrix</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {report.quantitativeAnalysis.dimension_scores.slice(0, 5)?.map((skill, i) => (
                                                <div key={i} className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[11px] text-white/50 font-medium uppercase tracking-widest">{skill.dimension}</span>
                                                        <span className="text-[11px] font-bold text-brand-primary tracking-widest">{skill.normalized_score ?? 0}%</span>
                                                    </div>
                                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            style={{ width: `${skill.normalized_score ?? 0}%` }}
                                                            className="h-full bg-brand-primary/60"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {report.questionPerformance && report.questionPerformance.length > 0 && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1 h-1 rounded-full bg-brand-primary" />
                                            <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">Practice Gems</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {report.questionPerformance
                                                .filter(q => q.max_impact_response && q.user_transcript !== '[SKIPPED]')
                                                .slice(0, 2)
                                                ?.map((q, i) => (
                                                    <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5 space-y-4">
                                                        <p className="text-[11px] text-brand-tint font-bold uppercase tracking-[0.12em]">Question {i + 1}</p>
                                                        <p className="text-xs md:text-sm text-white/80 font-medium italic leading-relaxed">"{q.question_text}"</p>
                                                        <div className="bg-brand-primary/[0.03] border border-brand-primary/10 rounded-lg p-4">
                                                            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest mb-2 block">Better approach</span>
                                                            <p className="text-xs md:text-sm text-brand-primary/70 leading-relaxed italic">
                                                                "{q.max_impact_response}"
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.section>

            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-brand-primary/[0.02] border border-brand-primary/10 rounded-2xl md:rounded-3xl p-8 md:p-12 space-y-8"
            >
                <div className="text-center space-y-2">
                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.12em]">Improvement plan</span>
                    <h2 className="text-xl md:text-3xl font-medium text-white tracking-tight">Your path to success</h2>
                </div>

                {report.quickWins && report.quickWins.length > 0 && (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
                        <h3 className="text-[10px] font-bold text-brand-primary mb-4 flex items-center gap-2 uppercase tracking-widest">
                            <span className="text-xs">⚡</span> Quick adjustments
                        </h3>
                        <ul className="space-y-3">
                            {report.quickWins?.map((win, i) => (
                                <li key={i} className="text-xs md:text-sm text-white/60 flex items-start gap-3 leading-relaxed">
                                    <span className="text-brand-primary font-bold mt-0.5">•</span>
                                    <span>{win}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="space-y-4">
                    {report.prioritizedActions?.map((action, i) => (
                        <div
                            key={i}
                            className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 space-y-4"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-brand-primary opacity-40">{i + 1}.</span>
                                        <h4 className="text-sm font-bold text-white tracking-tight">{action.action}</h4>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
                                            action.impact === 'high' ? 'border-brand-primary/40 text-brand-primary bg-brand-primary/5' : 'border-white/10 text-white/40'
                                        }`}>
                                            {action.impact} Impact
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.section>

            <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex-1 px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/[0.08] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]"
                >
                    {isDownloading ? 'Downloading...' : 'Get PDF Report'}
                </button>
                <button
                    onClick={onRestart}
                    className="flex-1 px-8 py-5 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-brand-primary/10 active:scale-[0.98]"
                >
                    Start New Session
                </button>
            </div>
        </div>
    );
};

function calculateScore(report: FinalReport): number {
    if (!report.quantitativeAnalysis || !report.quantitativeAnalysis.dimension_scores || report.quantitativeAnalysis.dimension_scores.length === 0) return 0;
    const scoredDimensions = report.quantitativeAnalysis.dimension_scores.filter(s => s.normalized_score !== null && s.normalized_score !== undefined);
    if (scoredDimensions.length === 0) return 0;
    const avgScore = scoredDimensions.reduce((sum, s) => sum + (s.normalized_score || 0), 0) / scoredDimensions.length;
    return Math.round(avgScore);
}

function getTopStrength(report: FinalReport): string {
    if (report.quantitativeAnalysis && report.quantitativeAnalysis.dimension_scores.length > 0) {
        const sorted = [...report.quantitativeAnalysis.dimension_scores]
            .filter(s => s.normalized_score !== null)
            .sort((a, b) => (b.normalized_score || 0) - (a.normalized_score || 0));
        if (sorted.length > 0) return sorted[0].dimension;
    }
    return 'Clear communication';
}

function getTopWeakness(report: FinalReport): string {
    if (report.quantitativeAnalysis && report.quantitativeAnalysis.dimension_scores.length > 0) {
        const sorted = [...report.quantitativeAnalysis.dimension_scores]
            .filter(s => s.normalized_score !== null)
            .sort((a, b) => (a.normalized_score || 0) - (b.normalized_score || 0));
        if (sorted.length > 0) return sorted[0].dimension;
    }
    if (report.biggestRiskArea) {
        return report.biggestRiskArea.title;
    }
    return 'Technical depth';
}

export default SimplifiedReport;
