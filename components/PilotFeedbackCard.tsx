
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PilotFeedback } from 'mockmate-shared';

interface PilotFeedbackCardProps {
    sessionId: string;
    existingFeedback?: PilotFeedback;
}

const ISSUES_CHECKLIST = [
    { id: 'harsh_score', label: 'Score felt too harsh' },
    { id: 'generous_score', label: 'Score felt too generous' },
    { id: 'generic_replay', label: 'Feedback felt generic' },
    { id: 'audit_mismatch', label: 'Report did not match my answers' },
    { id: 'coaching_not_actionable', label: 'Advice was not clear' },
    { id: 'concise_underrated', label: 'Short answers were scored too low' },
    { id: 'non_native_bias', label: 'Accent or phrasing affected my score' },
    { id: 'other', label: 'Other' },
];

const savePilotFeedback = (sessionId: string, feedback: PilotFeedback) => {
    localStorage.setItem(`mockmate_pilot_feedback_${sessionId || 'local'}`, JSON.stringify(feedback));
};

const PilotFeedbackCard: React.FC<PilotFeedbackCardProps> = ({ sessionId, existingFeedback }) => {
    const [ratings, setRatings] = useState(existingFeedback?.ratings || {
        fairness: 0,
        replayUsefulness: 0,
        auditAccuracy: 0,
        coachingUsefulness: 0
    });
    const [selectedIssues, setSelectedIssues] = useState<string[]>(existingFeedback?.issues || []);
    const [openText, setOpenText] = useState(existingFeedback?.openText || '');
    const [isSubmitted, setIsSubmitted] = useState(!!existingFeedback);
    const [isSaving, setIsSaving] = useState(false);

    const handleRating = (key: keyof typeof ratings, value: number) => {
        setRatings(prev => ({ ...prev, [key]: value }));
    };

    const toggleIssue = (id: string) => {
        setSelectedIssues(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        setIsSaving(true);
        const feedback: PilotFeedback = {
            ratings,
            issues: selectedIssues,
            openText,
            timestamp: existingFeedback?.timestamp || new Date().toISOString(),
            updatedAt: existingFeedback ? new Date().toISOString() : undefined
        };

        try {
            savePilotFeedback(sessionId, feedback);
            setIsSubmitted(true);
        } catch (error) {
            console.error("Failed to save feedback", error);
        } finally {
            setIsSaving(false);
        }
    };

    const RatingPills = ({ label, value, onSelect }: { label: string, value: number, onSelect: (v: number) => void }) => (
        <div className="space-y-3">
            <label className="text-[10px] text-brand-tint uppercase tracking-[0.12em] font-bold">{label}</label>
            <div className="flex gap-1.5 md:gap-2">
                {[1, 2, 3, 4, 5].map(num => (
                    <button
                        key={num}
                        onClick={() => onSelect(num)}
                        className={`flex-1 py-3 rounded-xl text-[11px] font-bold transition-all border ${
                            value === num 
                                ? 'bg-brand-primary text-brand-dark border-brand-primary shadow-lg shadow-brand-primary/20' 
                                : 'bg-white/5 text-white/40 border-white/[0.06] hover:bg-white/10'
                        }`}
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="relative group max-w-3xl mx-auto">
            {/* Subtle Amber Glow */}
            <div className="absolute -inset-0.5 bg-brand-primary/10 rounded-[24px] blur opacity-0 group-hover:opacity-40 transition duration-1000"></div>
            
            <div className="relative bg-brand-dark/80 backdrop-blur-2xl border border-white/[0.08] rounded-[2rem] overflow-hidden p-8 md:p-12">
                <AnimatePresence mode="wait">
                    {!isSubmitted ? (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-10"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em] mb-2 block">Help us improve</span>
                                    <h3 className="text-2xl font-medium text-white tracking-tight">Your experience feedback</h3>
                                </div>
                                <div className="px-3 py-1 bg-brand-primary/5 border border-brand-primary/20 rounded-full">
                                    <span className="text-[9px] text-brand-primary font-bold uppercase tracking-widest">Pilot Feature</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-8">
                                    <RatingPills label="Was the score fair?" value={ratings.fairness} onSelect={(v) => handleRating('fairness', v)} />
                                    <RatingPills label="Was the advice useful?" value={ratings.coachingUsefulness} onSelect={(v) => handleRating('coachingUsefulness', v)} />
                                    <RatingPills label="Was the report accurate?" value={ratings.auditAccuracy} onSelect={(v) => handleRating('auditAccuracy', v)} />
                                </div>

                                <div className="space-y-5">
                                    <label className="text-[10px] text-brand-tint uppercase tracking-[0.12em] font-bold">Specific issues</label>
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {ISSUES_CHECKLIST.map(issue => (
                                            <button
                                                key={issue.id}
                                                onClick={() => toggleIssue(issue.id)}
                                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-[11px] font-medium text-left transition-all ${
                                                    selectedIssues.includes(issue.id)
                                                        ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary'
                                                        : 'bg-white/5 border-white/[0.04] text-white/40 hover:bg-white/10'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                                    selectedIssues.includes(issue.id) ? 'bg-brand-primary border-brand-primary' : 'border-white/20'
                                                }`}>
                                                    {selectedIssues.includes(issue.id) && <span className="text-brand-dark text-[10px] font-bold">✓</span>}
                                                </div>
                                                {issue.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] text-brand-tint uppercase tracking-[0.12em] font-bold">Additional comments</label>
                                <textarea
                                    value={openText}
                                    onChange={(e) => setOpenText(e.target.value)}
                                    placeholder="What felt most useful or least fair about this session?"
                                    className="w-full h-32 bg-white/5 border border-white/[0.08] rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-brand-primary/40 transition-colors resize-none placeholder:text-brand-tint/60"
                                />
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={isSaving || !ratings.fairness}
                                className="w-full py-5 bg-brand-primary text-brand-dark text-[10px] font-bold uppercase tracking-[0.3em] rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all shadow-xl shadow-brand-primary/10"
                            >
                                {isSaving ? 'Saving...' : 'Send feedback'}
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="thank-you"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="py-16 flex flex-col items-center text-center space-y-8"
                        >
                            <div className="w-20 h-20 bg-brand-primary/5 rounded-full flex items-center justify-center border border-brand-primary/20 mb-2">
                                <span className="text-4xl">🌟</span>
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-medium text-white tracking-tight">Feedback received</h3>
                                <p className="text-white/40 text-[11px] font-bold uppercase tracking-widest max-w-xs leading-relaxed">
                                    Your input helps us make MockMate better for everyone.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsSubmitted(false)}
                                className="px-10 py-4 bg-white/5 text-white/40 text-[9px] font-bold uppercase tracking-widest rounded-xl border border-white/[0.08] hover:bg-white/10 transition-all"
                            >
                                Update my feedback
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default PilotFeedbackCard;
