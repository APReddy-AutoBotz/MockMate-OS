import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserProfile } from '../types';

interface RoleCaptureProps {
    userProfile: UserProfile | null;
    onRoleSubmit: (role: string, sessionType: 'structured' | 'conversational', companyData?: { name: string, url: string }) => void;
    onBack: () => void;
    onViewHistory: () => void;
}

const RoleCapture: React.FC<RoleCaptureProps> = ({ userProfile, onRoleSubmit, onBack }) => {
    const [intentText, setIntentText] = useState('');
    const [companyName, setCompanyName] = useState(userProfile?.companyName || '');
    const [companyUrl, setCompanyUrl] = useState(userProfile?.companyUrl || '');
    const [showCompanyFields, setShowCompanyFields] = useState(false);

    const handleSubmit = (sessionType: 'structured' | 'conversational') => {
        const trimmedIntent = intentText.trim();
        if (trimmedIntent) {
            onRoleSubmit(trimmedIntent, sessionType, { name: companyName, url: companyUrl });
        }
    };

    return (
        <div className="relative z-10 flex w-full flex-col items-center px-6 py-10 md:px-10 md:py-16">
            <header className="mb-10 w-full max-w-3xl space-y-4 text-center md:mb-14">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary">Interview setup</span>
                <h2 className="text-3xl font-medium tracking-tight text-white md:text-5xl">
                    What job are you practicing for?
                </h2>
                <p className="mx-auto max-w-xl text-sm leading-relaxed text-brand-tint md:text-base">
                    Tell us the role you want. We will set up practice questions that match your goal.
                </p>
            </header>

            <div className="w-full max-w-4xl space-y-10">
                <div className="space-y-4">
                    <div className="mb-2 flex items-center gap-4">
                        <div className="h-px flex-grow bg-brand-tint/15" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint">Target role</span>
                        <div className="h-px flex-grow bg-brand-tint/15" />
                    </div>

                    <textarea
                        value={intentText}
                        onChange={(e) => setIntentText(e.target.value)}
                        placeholder="e.g. Sales Manager, Teacher, Engineer..."
                        className="h-32 w-full resize-none rounded-[24px] border border-brand-tint/15 bg-white/[0.03] px-8 py-6 text-xl font-medium tracking-tight text-white shadow-2xl outline-none backdrop-blur-2xl transition-all placeholder:text-brand-tint/45 focus:border-brand-primary/50 focus:bg-white/[0.05] md:h-40 md:px-10 md:py-8 md:text-3xl"
                        autoFocus
                    />

                    <div className="pt-2">
                        <button
                            onClick={() => setShowCompanyFields(!showCompanyFields)}
                            className="mx-auto flex items-center gap-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint transition-all hover:text-brand-primary"
                        >
                            <span>{showCompanyFields ? '-' : '+'}</span>
                            {showCompanyFields ? 'Hide company details' : 'Add company details (optional)'}
                        </button>

                        <AnimatePresence>
                            {showCompanyFields && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="mt-6 overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <input
                                            type="text"
                                            placeholder="Company name"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            className="rounded-xl border border-brand-tint/15 bg-white/[0.03] px-6 py-4 text-base font-medium text-white outline-none transition-all placeholder:text-brand-tint/45 focus:border-brand-primary/40"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Company website (optional)"
                                            value={companyUrl}
                                            onChange={(e) => setCompanyUrl(e.target.value)}
                                            className="rounded-xl border border-brand-tint/15 bg-white/[0.03] px-6 py-4 text-base font-medium text-white outline-none transition-all placeholder:text-brand-tint/45 focus:border-brand-primary/40"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <button
                        onClick={() => handleSubmit('structured')}
                        disabled={!intentText.trim()}
                        className="group relative rounded-[24px] border border-brand-tint/15 bg-white/[0.035] p-8 text-left shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-primary/30 disabled:opacity-70 disabled:hover:translate-y-0"
                    >
                        <div className="space-y-4">
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary">Guided practice</span>
                            <h3 className="text-2xl font-medium tracking-tight text-white">Question by question</h3>
                            <p className="text-sm leading-relaxed text-brand-tint">Answer one question at a time and get comfortable with the basics.</p>
                        </div>
                        <div className="mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-primary">Start practice</div>
                    </button>

                    <button
                        onClick={() => handleSubmit('conversational')}
                        disabled={!intentText.trim()}
                        className="group relative rounded-[24px] border border-brand-tint/15 bg-white/[0.035] p-8 text-left shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-primary/30 disabled:opacity-70 disabled:hover:translate-y-0"
                    >
                        <div className="space-y-4">
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary">Conversation practice</span>
                            <h3 className="text-2xl font-medium tracking-tight text-white">Natural back and forth</h3>
                            <p className="text-sm leading-relaxed text-brand-tint">Practice speaking through a realistic interview conversation.</p>
                        </div>
                        <div className="mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-primary">Start conversation</div>
                    </button>
                </div>

                <div className="flex justify-center pt-6">
                    <button onClick={onBack} className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint transition-all hover:text-white">
                        Back to practice home
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoleCapture;
