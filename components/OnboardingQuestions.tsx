import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserProfile } from '../types';

interface OnboardingQuestionsProps {
    onComplete: (profile: UserProfile, targetRole: string) => void;
}

const OnboardingQuestions: React.FC<OnboardingQuestionsProps> = ({ onComplete }) => {
    const [targetRole, setTargetRole] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetRole.trim()) return;
        const profile: UserProfile = {
            name: 'Candidate',
            experienceLevel: 'mid',
            primaryGoal: 'skill_building',
            targetRole: targetRole.trim(),
        };
        onComplete(profile, targetRole.trim());
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-12 text-center md:py-20"
        >
            <header className="mb-12 space-y-4 md:mb-16">
                <span className="mb-4 block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary">
                    Quick setup
                </span>
                <h2 className="text-3xl font-medium leading-tight tracking-tight text-white md:text-5xl">
                    What role are you
                    <br />
                    <span className="text-brand-primary">practicing for?</span>
                </h2>
                <p className="mx-auto max-w-lg text-base font-normal leading-relaxed text-brand-tint md:text-lg">
                    Tell us your target job. We will use it to personalize your resume help, speaking practice, and interview questions.
                </p>
            </header>

            <form onSubmit={handleSubmit} className="flex w-full flex-col items-center gap-8 md:gap-10">
                <input
                    type="text"
                    placeholder="e.g. Sales Manager, Nurse, Engineer"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    autoFocus
                    className="w-full rounded-[24px] border border-brand-tint/15 bg-white/[0.03] px-8 py-6 text-center text-xl font-medium text-white shadow-2xl outline-none backdrop-blur-2xl transition-all placeholder:text-brand-tint/45 focus:border-brand-primary/50 focus:bg-white/[0.05] md:py-8 md:text-3xl"
                    style={{ caretColor: '#FFBC03' }}
                />

                <button
                    type="submit"
                    disabled={!targetRole.trim()}
                    className="w-full max-w-sm rounded-2xl bg-brand-primary px-10 py-5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-dark shadow-xl shadow-brand-primary/10 transition-all hover:bg-brand-primary/90 active:scale-[0.98] disabled:opacity-35"
                >
                    Start practicing
                </button>
            </form>

            <button
                onClick={() => onComplete({ name: 'Candidate', experienceLevel: 'mid', primaryGoal: 'skill_building' }, '')}
                className="mt-12 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint transition-all hover:text-white"
            >
                Skip for now
            </button>
        </motion.div>
    );
};

export default OnboardingQuestions;
