import type { UserProfile } from '../types/ui';
import { useState, type FC, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, FileText, Mic, Trash2, Users } from 'lucide-react';

interface HubProps {
    userProfile: UserProfile | null;
    onNavigate: (module: 'RESUME' | 'SPEAK' | 'INTERVIEW') => void;
    onViewHistory: () => void;
    onOpenCareerContext: () => void;
    onDeleteData: () => Promise<{ cleanupWarning?: string }>;
}

const ToolCard: FC<{
    icon: ReactNode;
    title: string;
    description: string;
    action: string;
    onClick: () => void;
}> = ({ icon, title, description, action, onClick }) => (
    <motion.button
        onClick={onClick}
        initial={false}
        className="group flex min-h-[210px] w-full flex-col justify-between border-b border-white/10 p-6 text-left transition-colors hover:bg-white/[0.045] focus-visible:z-10 md:min-h-[250px] md:border-b-0 md:border-r md:p-8 last:border-b-0 md:last:border-r-0"
    >
        <div>
            <div className="mb-6 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-primary/25 bg-brand-primary/10 text-brand-primary transition-colors group-hover:bg-brand-primary group-hover:text-brand-dark">
                    {icon}
                </div>
            </div>
            <h3 className="mb-3 text-xl font-semibold tracking-tight text-white md:text-2xl">{title}</h3>
            <p className="text-sm leading-relaxed text-brand-tint">{description}</p>
        </div>

        <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <span>{action}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
    </motion.button>
);

export const Hub: FC<HubProps> = ({ userProfile, onNavigate, onViewHistory, onOpenCareerContext, onDeleteData }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deleteSuccess, setDeleteSuccess] = useState('');

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }

        setIsDeleting(true);
        setDeleteError('');
        setDeleteSuccess('');
        try {
            const result = await onDeleteData();
            setDeleteSuccess('Your MockMate app data was deleted.');
            setDeleteError(result.cleanupWarning || '');
            setConfirmDelete(false);
            setIsDeleting(false);
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

            <div className="grid grid-cols-1 overflow-hidden rounded-[24px] border border-brand-tint/15 bg-white/[0.025] shadow-[0_24px_70px_-40px_rgba(0,0,0,0.8)] md:grid-cols-3">
                <ToolCard
                    icon={<FileText className="h-6 w-6" />}
                    title="Resume builder"
                    description="Build an ATS-friendly resume with guided support and simple wording."
                    action="Start resume"
                    onClick={() => onNavigate('RESUME')}
                />

                <ToolCard
                    icon={<Mic className="h-6 w-6" />}
                    title="ClearSpeak"
                    description="Record and listen back in private. Evidence-backed feedback appears only when reliable scoring is available."
                    action="Open speaking practice"
                    onClick={() => onNavigate('SPEAK')}
                />

                <ToolCard
                    icon={<Users className="h-6 w-6" />}
                    title="Mock interview"
                    description="Practice real interview questions and learn how to improve your answers."
                    action="Start interview practice"
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
                        {deleteSuccess && (
                            <p role="status" className="mt-2 text-xs font-medium text-emerald-300">{deleteSuccess}</p>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {confirmDelete && (
                            <p className="max-w-xs text-xs leading-relaxed text-brand-tint">
                                This removes saved practice data from MockMate. Press delete again to confirm.
                            </p>
                        )}
                        {onOpenCareerContext && (
                            <button
                                type="button"
                                onClick={onOpenCareerContext}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-tint/15 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-tint transition-colors hover:border-brand-primary/30 hover:text-white"
                            >
                                Career context
                            </button>
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
