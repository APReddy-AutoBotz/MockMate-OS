
import { motion } from 'framer-motion';
import { JDInsights, CompetencyWeight, QuestionBlueprint } from 'mockmate-shared';
import React from 'react';

interface SessionBuilderProps {
    jdInsights: JDInsights;
    competencyWeights?: CompetencyWeight[];
    dimensionWeights?: CompetencyWeight[]; // legacy alias
    questionSet?: QuestionBlueprint[];
    researchLinks?: { uri: string; title: string; }[];
    onAdjustSpecs?: () => void;
    onInitialize?: () => void;
}

/* ─── Skill Pill List ───────────────────────────────────────────────────── */
const SkillGroup: React.FC<{ title: string; items: string[]; delay?: number }> = ({ title, items, delay = 0 }) => {
    if (!items || items.length === 0) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3"
        >
            <p className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.12em]">{title}</p>
            <div className="flex flex-wrap gap-2">
                {items.map((item, idx) => (
                    <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] text-white/60 font-normal leading-none"
                    >
                        <span className="w-1 h-1 rounded-full bg-brand-primary/50 flex-shrink-0" />
                        {item}
                    </span>
                ))}
            </div>
        </motion.div>
    );
};

/* ─── Competency Bar ────────────────────────────────────────────────────── */
const CompetencyBar: React.FC<{ label: string; pct: number; index: number }> = ({ label, pct, index }) => (
    <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8 + index * 0.06 }}
        className="flex items-center gap-3"
    >
        <span className="text-[10px] text-white/40 font-medium w-28 flex-shrink-0 capitalize">{label}</span>
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 1 + index * 0.06, duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-brand-primary rounded-full shadow-[0_0_6px_rgba(255,188,3,0.6)]"
            />
        </div>
        <span className="text-[10px] font-bold text-brand-primary/60 w-8 text-right">{pct}%</span>
    </motion.div>
);

/* ─── Main ──────────────────────────────────────────────────────────────── */
const SessionBuilder: React.FC<SessionBuilderProps> = ({
    jdInsights,
    competencyWeights,
    dimensionWeights,
    onAdjustSpecs = () => {},
    onInitialize = () => {},
}) => {
    // Support both prop names for backwards compatibility
    const weights = competencyWeights ?? dimensionWeights ?? [];

    const skills      = jdInsights.mustHaveSkills?.length > 0 ? jdInsights.mustHaveSkills : [];
    const niceToHave  = jdInsights.niceToHave?.length     > 0 ? jdInsights.niceToHave    : [];
    const domains     = jdInsights.domains?.length         > 0 ? jdInsights.domains       : [];
    const tools       = jdInsights.tools?.length           > 0 ? jdInsights.tools         : [];
    const softSkills  = jdInsights.softSkills?.length      > 0 ? jdInsights.softSkills    : [];

    const formattedWeights = weights.map(w => ({
        label: w.competency.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase(),
        pct: w.weight <= 1 ? Math.round(w.weight * 100) : Math.round(w.weight),
    }));

    return (
        <div className="w-full max-w-5xl mx-auto px-5 sm:px-8 md:px-12 py-10 md:py-16">

            {/* ── Page Header ─────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="text-center mb-8 md:mb-12 space-y-3"
            >
                <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.5em] opacity-60">
                    Almost ready
                </span>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter leading-[1.1]">
                    Your interview plan
                </h1>
                <p className="text-sm md:text-base text-white/40 max-w-xl mx-auto font-normal italic leading-relaxed">
                    We've tailored your practice session based on your goal. Review it below before you start.
                </p>
            </motion.div>

            {/* ── Blueprint Card ───────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="bg-brand-dark/95 backdrop-blur-3xl border border-white/[0.06] rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)] relative"
            >
                {/* Ambient glow */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary/5 rounded-full blur-[120px] -mr-48 -mt-48 pointer-events-none" />

                {/* Card Header */}
                <div className="px-6 md:px-8 py-5 md:py-6 border-b border-white/[0.06] flex items-center gap-3 relative z-10">
                    <div className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(255,188,3,1)] animate-pulse flex-shrink-0" />
                    <h2 className="text-sm md:text-base font-medium text-white tracking-tight">
                        What your interview will cover
                    </h2>
                    <span className="ml-auto text-[10px] text-brand-tint font-bold uppercase tracking-[0.12em]">
                        {jdInsights.source === 'questionBank' ? 'Question bank' : 'JD analysis'}
                    </span>
                </div>

                {/* Skills Grid */}
                {(skills.length > 0 || niceToHave.length > 0 || domains.length > 0 || tools.length > 0 || softSkills.length > 0) && (
                    <div className="px-6 md:px-8 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 border-b border-white/[0.06]">
                        <SkillGroup title="Must-have skills"   items={skills}     delay={0.3} />
                        <SkillGroup title="Good to have"       items={niceToHave} delay={0.35} />
                        <SkillGroup title="Key areas"          items={domains}    delay={0.4} />
                        <SkillGroup title="Tools & technology" items={tools}      delay={0.45} />
                        <SkillGroup title="Personal strengths" items={softSkills} delay={0.5} />
                    </div>
                )}

                {/* Competency Bars */}
                {formattedWeights.length > 0 && (
                    <div className="px-6 md:px-8 py-5 space-y-3 relative z-10 border-b border-white/[0.06]">
                        <p className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.12em] mb-4">Focus areas</p>
                        {formattedWeights.map((w, i) => (
                            <CompetencyBar key={i} label={w.label} pct={w.pct} index={i} />
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="px-6 md:px-8 py-5 flex flex-col sm:flex-row gap-3 relative z-10">
                    <button
                        onClick={onInitialize}
                        className="flex-[2] bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold py-4 px-8 rounded-xl text-xs uppercase tracking-[0.12em] shadow-[0_10px_30px_-8px_rgba(255,188,3,0.4)] transition-all active:scale-[0.98] order-1 sm:order-2"
                    >
                        Start my interview →
                    </button>
                    <button
                        onClick={onAdjustSpecs}
                        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/[0.07] text-brand-tint hover:text-white font-bold py-4 px-8 rounded-xl text-xs uppercase tracking-[0.12em] transition-all active:scale-[0.98] order-2 sm:order-1"
                    >
                        Go back
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SessionBuilder;
