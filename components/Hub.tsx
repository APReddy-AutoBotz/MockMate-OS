import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, FileText, Mic, Trash2, Users } from 'lucide-react';
import { UserProfile } from '../types';

interface HubProps {
    userProfile: UserProfile | null;
    betaEnabled: boolean;
    onNavigate: (module: 'RESUME' | 'SPEAK' | 'INTERVIEW') => void;
    onViewHistory: () => void;
    onDeleteData: () => Promise<void>;
}

const ToolCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    action: string;
    badge?: string;
    delay: number;
    onClick: () => void;
}> = ({ icon, title, description, action, badge, onClick }) => (
    <motion.button
        onClick={onClick}
        initial={false}
        className="group relative flex min-h-[220px] w-full flex-col justify-between overflow-hidden rounded-[22px] border border-brand-tint/15 bg-white/[0.035] p-6 text-left shadow-[0_22px_60px_-32px_rgba(0,0,0,0.75)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-primary/30 hover:bg-white/[0.055] md:min-h-[300px] md:rounded-[24px] md:p-9"
    >
        <div>
            <div className="mb-5 flex items-start justify-between md:mb-7">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-primary/25 bg-brand-primary/10 text-brand-primary transition-all group-hover:bg-brand-primary group-hover:text-brand-dark">
                    {icon}
                </div>
                {badge && (
                    <span className="rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-brand-primary">
                        {badge}
                    </span>
                )}
            </div>
            <h3 className="mb-3 text-xl font-medium tracking-tight text-white md:mb-4 md:text-2xl">{title}</h3>
            <p className="text-sm leading-relaxed text-brand-tint">{description}</p>
        </div>

        <div className="mt-10 flex items-center text-[11px] font-bold uppercase tracking-[0.12em] text-brand-primary">
            <span className="transition-all group-hover:mr-3">{action}</span>
            <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
    </motion.button>
);

export const Hub: React.FC<HubProps> = ({ userProfile, onNavigate, onViewHistory, onDeleteData }) => {
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [deleteError, setDeleteError] = React.useState('');

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }

        setIsDeleting(true);
        setDeleteError('');
        try {
            await onDeleteData();
        } catch (error: any) {
            setDeleteError(error?.message || 'Could not delete your data.');
            setIsDeleting(false);
        }
    };

    return (
        <div className="z-10 mx-auto flex w-full max-w-5xl flex-col px-1 py-4 sm:px-4 md:px-10 md:py-10 lg:py-20">
            <header className="mb-8 space-y-4 md:mb-12 lg:mb-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                    <span className="mb-4 block text-[10px] font-bold uppercase tracking-[0.14em] text-brand-primary">
                        Your practice home
                    </span>
                    <h1 className="mb-5 text-3xl font-medium tracking-tight text-white md:text-5xl">
                        {userProfile ? `Welcome back, ${userProfile.name}.` : 'Ready to practice?'}
                    </h1>
                    <p className="max-w-xl text-base leading-relaxed text-brand-tint md:text-lg">
                        {userProfile?.targetRole
                            ? `Get ready for your ${userProfile.targetRole} role with resume, spoken English, and interview practice.`
                            : 'Choose where you want help today. You can move at your own pace.'}
                    </p>
                </motion.div>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-8">
                <ToolCard
                    icon={<FileText className="h-6 w-6" />}
                    title="Resume builder"
                    description="Build an ATS-friendly resume with guided support and simple wording."
                    action="Start resume"
                    delay={0.1}
                    onClick={() => onNavigate('RESUME')}
                />

                <ToolCard
                    icon={<Mic className="h-6 w-6" />}
                    title="Speaking coach"
                    description="Practice spoken English for interviews and get clear, kind feedback."
                    action="Start speaking"
                    delay={0.2}
                    onClick={() => onNavigate('SPEAK')}
                />

                <ToolCard
                    icon={<Users className="h-6 w-6" />}
                    title="Mock interview"
                    description="Practice real interview questions and learn how to improve your answers."
                    action="Start interview practice"
                    delay={0.3}
                    onClick={() => onNavigate('INTERVIEW')}
                />
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-14 border-t border-brand-tint/15 pt-7 md:mt-20"
            >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center text-xs font-medium text-brand-tint">
                            <div className="mr-3 h-2 w-2 rounded-full bg-brand-primary" />
                            Your practice stays private.
                        </div>
                        {deleteError && (
                            <p className="mt-2 text-xs font-medium text-brand-primary">{deleteError}</p>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {confirmDelete && (
                            <p className="max-w-xs text-xs leading-relaxed text-brand-tint">
                                This removes saved practice data from MockMate. Press delete again to confirm.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={onViewHistory}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-tint/15 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-tint transition-colors hover:border-brand-primary/30 hover:text-white"
                        >
                            <BookOpen className="h-4 w-4" />
                            Practice journal
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-tint/15 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-tint transition-colors hover:border-brand-primary/30 hover:text-white disabled:opacity-50"
                        >
                            <Trash2 className="h-4 w-4" />
                            {isDeleting ? 'Deleting...' : confirmDelete ? 'Delete my data' : 'Data controls'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Hub;
