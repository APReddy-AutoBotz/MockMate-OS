
import React from 'react';
import { SessionControls } from 'mockmate-shared';

interface SessionControlsEditorProps {
    controls: SessionControls;
    onChange: (newControls: SessionControls) => void;
}

/* ─── Micro Toggle ──────────────────────────────────────────────────────── */
const Toggle: React.FC<{ on: boolean; onToggle: () => void }> = ({ on, onToggle }) => (
    <button
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        className={`relative w-11 h-6 rounded-full transition-all duration-300 focus:outline-none ${
            on ? 'bg-brand-primary shadow-[0_0_12px_rgba(255,188,3,0.5)]' : 'bg-white/10'
        }`}
    >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
);

/* ─── Section Label ─────────────────────────────────────────────────────── */
const Label: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${muted ? 'text-brand-tint' : 'text-white/70'}`}>
        {children}
    </span>
);

/* ─── Divider ───────────────────────────────────────────────────────────── */
const Divider = () => <div className="h-px bg-white/[0.06] w-full" />;

/* ─── Main Component ────────────────────────────────────────────────────── */
const SessionControlsEditor: React.FC<SessionControlsEditorProps> = ({ controls, onChange }) => {

    const setDifficulty = (difficulty: 'starter' | 'intermediate' | 'expert') => {
        const count = difficulty === 'starter' ? 7 : difficulty === 'intermediate' ? 15 : 25;
        onChange({ ...controls, difficulty, totalQuestions: count });
    };

    const DIFFICULTY_OPTIONS = [
        { key: 'starter' as const,      label: 'Starter',       qs: 7,  bar: 33 },
        { key: 'intermediate' as const, label: 'Intermediate',  qs: 15, bar: 66 },
        { key: 'expert' as const,       label: 'Expert',        qs: 25, bar: 100 },
    ];

    const MODE_OPTIONS = [
        {
            key: 'job_description' as const,
            label: 'JD Exploration',
            desc: 'AI mixes trending questions with your job description requirements.',
        },
        {
            key: 'question_bank' as const,
            label: 'Question Bank',
            desc: 'AI strictly uses your uploaded study material for exact phrasing.',
        },
    ];

    const TOGGLE_OPTIONS = [
        {
            label: 'Coach mode',
            desc: 'Get hints and feedback after each answer.',
            checked: controls.deliveryMode === 'coach',
            onToggle: () => onChange({ ...controls, deliveryMode: controls.deliveryMode === 'coach' ? 'exam' : 'coach' }),
        },
        {
            label: 'Coding questions',
            desc: 'Include algorithm challenges (needs a technical interviewer).',
            checked: !!controls.includeCoding,
            onToggle: () => onChange({ ...controls, includeCoding: !controls.includeCoding }),
        },
    ];

    return (
        <div className="w-full bg-white/[0.02] border border-white/[0.06] rounded-2xl md:rounded-3xl overflow-hidden divide-y divide-white/[0.06]">

            {/* ── Preparation Mode ──────────────────────────────────── */}
            <div className="p-5 md:p-7 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                        <Label>Preparation mode</Label>
                        <p className="text-xs text-brand-tint font-normal">How your questions are prepared</p>
                    </div>
                </div>

                {/* Segmented mode pill */}
                <div className="grid grid-cols-2 gap-1.5 bg-black/30 p-1.5 rounded-xl">
                    {MODE_OPTIONS.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => onChange({ ...controls, sourceMode: opt.key })}
                            className={`py-2.5 px-3 rounded-[10px] text-[10px] font-bold uppercase tracking-[0.3em] transition-all duration-200 text-center ${
                                controls.sourceMode === opt.key
                                    ? 'bg-brand-primary text-brand-dark shadow-[0_2px_12px_rgba(255,188,3,0.35)]'
                                    : 'text-brand-tint hover:text-white/70'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Contextual hint */}
                <p className="text-[10px] text-brand-primary/50 leading-relaxed pl-1 italic">
                    {MODE_OPTIONS.find(o => o.key === controls.sourceMode)?.desc}
                </p>
            </div>

            {/* ── Difficulty & Volume ───────────────────────────────── */}
            <div className="p-5 md:p-7 space-y-4">
                <div className="flex items-center justify-between">
                    <Label>Difficulty &amp; volume</Label>
                    <span className="text-xs font-bold text-brand-primary tracking-widest">
                        {controls.totalQuestions} questions
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {DIFFICULTY_OPTIONS.map(opt => {
                        const active = controls.difficulty === opt.key;
                        return (
                            <button
                                key={opt.key}
                                onClick={() => setDifficulty(opt.key)}
                                className={`relative flex flex-col items-center gap-2 pt-4 pb-3 rounded-xl border transition-all duration-250 overflow-hidden ${
                                    active
                                        ? 'border-brand-primary/60 bg-brand-primary/8 text-brand-primary'
                                        : 'border-white/[0.07] bg-white/[0.02] text-white/25 hover:border-white/15 hover:text-white/50'
                                }`}
                            >
                                {/* Active top accent bar */}
                                <span className={`absolute top-0 left-0 right-0 h-[2px] transition-all duration-300 ${active ? 'bg-brand-primary opacity-100' : 'bg-transparent opacity-0'}`} />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">{opt.label}</span>
                                <span className={`text-[9px] font-bold tracking-[0.12em] ${active ? 'text-brand-primary' : 'text-brand-tint'}`}>{opt.qs} Qs</span>
                                {/* Volume bar */}
                                <div className="w-full px-3">
                                    <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${active ? 'bg-brand-primary' : 'bg-white/15'}`}
                                            style={{ width: `${opt.bar}%` }}
                                        />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Toggle Options ────────────────────────────────────── */}
            {TOGGLE_OPTIONS.map((opt, i) => (
                <div key={i} className="px-5 md:px-7 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={opt.onToggle}>
                    <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold uppercase tracking-[0.3em] transition-colors ${opt.checked ? 'text-white' : 'text-white/40'}`}>
                            {opt.label}
                        </p>
                        <p className="text-[10px] text-white/25 mt-0.5 leading-relaxed font-normal">{opt.desc}</p>
                    </div>
                    <Toggle on={opt.checked} onToggle={opt.onToggle} />
                </div>
            ))}
        </div>
    );
};

export default SessionControlsEditor;
