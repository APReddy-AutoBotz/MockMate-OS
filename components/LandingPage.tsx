import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    FileText, Mic, Users, ArrowRight, Sparkles, CheckCircle2,
    Lock, RefreshCw, Volume2, ShieldAlert, ChevronRight,
    Check, AlertCircle, ThumbsUp
} from 'lucide-react';
import { Logo } from './icons/Logo';

interface LandingPageProps {
    onGetStarted: () => void;
    onOpenPrivacy: () => void;
    onOpenTerms: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onOpenPrivacy, onOpenTerms }) => {
    // Before/After comparison active tab for mobile viewports
    const [beforeAfterToggle, setBeforeAfterToggle] = useState<'before' | 'after'>('after');

    return (
        <div className="relative flex min-h-screen w-full flex-col items-center overflow-x-hidden bg-brand-navy custom-scroll text-white font-sans">
            {/* Subtle texture only; keep the brand surface calm and readable. */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div className="noise-texture" />
            </div>

            {/* ── GLOBAL HEADER ────────────────────────────────────────────────────── */}
            <header className="z-50 flex w-full max-w-7xl items-center justify-between px-6 py-6 md:px-12">
                <div className="flex items-center gap-3">
                    <Logo className="h-9 w-auto md:h-12" />
                    <span className="hidden rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.15em] text-brand-primary sm:inline-block">
                        Speaking Coach
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={onGetStarted}
                        className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest text-brand-tint/70 hover:text-white transition-colors"
                    >
                        Sign In
                    </button>
                    <button
                        onClick={onGetStarted}
                        className="rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-brand-primary/30 text-white font-bold uppercase tracking-widest text-[9px] md:text-[11px] px-4 py-2 transition-all active:scale-[0.98]"
                    >
                        Start Free
                    </button>
                </div>
            </header>

            {/* ── 1. HERO SECTION & CONNECTED 3-MODULE PREVIEW ──────────────────────── */}
            <section className="z-10 mx-auto flex w-full max-w-7xl flex-grow flex-col items-center justify-start px-6 pb-16 pt-6 md:px-12 md:pt-12">
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8 items-center w-full">
                    {/* Hero Left Content */}
                    <div className="lg:col-span-6 space-y-5 text-left">
                        <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/5 px-3 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-brand-primary">
                            <Sparkles className="h-3 w-3 text-brand-primary" />
                            JOB PREP COMPANION
                        </div>
                        <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.1] tracking-tight text-white">
                            Build your resume. <br />
                            <span className="text-brand-primary">Improve your English.</span> <br />
                            Practice interviews.
                        </h1>
                        <p className="max-w-lg text-sm md:text-base font-normal leading-relaxed text-brand-tint/80">
                            MockMate helps you prepare for job success through guided resume improvement, private spoken English practice, and gentle interview practice in one beginner-friendly app.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <button
                                onClick={onGetStarted}
                                className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-brand-primary px-7 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-dark shadow-[0_15px_30px_-12px_rgba(255,188,3,0.5)] hover:bg-brand-primary/95 active:scale-[0.98] transition-premium"
                            >
                                Start Free Practice
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-dark/10 group-hover:translate-x-0.5 transition-transform">
                                    <ArrowRight className="h-3 w-3 text-brand-dark" />
                                </div>
                            </button>
                            <button
                                onClick={() => document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' })}
                                className="inline-flex items-center justify-center rounded-full border border-brand-tint/15 bg-white/5 px-7 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white hover:bg-white/10 active:scale-[0.98] transition-premium"
                            >
                                Learn More
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-brand-tint/50">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
                            100% Private. No webcams. Self-paced practice.
                        </div>
                    </div>

                    {/* Hero Right Visual: Connected 3-Module Workspace Preview */}
                    <div className="lg:col-span-6 w-full flex flex-col items-center">
                        <div className="w-full max-w-[500px] p-1.5 bg-white/5 border border-white/10 rounded-[28px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-md">
                            <div className="p-4 md:p-5 bg-brand-navy/95 rounded-[calc(28px-6px)] border border-white/5 space-y-3">
                                {/* Connected Cockpit Preview */}
                                <div className="border border-white/5 bg-white/[0.01] p-3.5 rounded-xl text-left">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-brand-primary" />
                                            01 / Resume Review
                                        </h4>
                                        <span className="font-mono text-[9px] text-brand-primary bg-brand-primary/10 px-1.5 rounded">68 → 89 ATS</span>
                                    </div>
                                    <p className="text-[10px] text-brand-tint/70 leading-relaxed">
                                        Swap <span className="line-through text-red-400/70">"did resume checks"</span> for <span className="font-medium text-brand-primary">"Improved resume bullets with clear results"</span>.
                                    </p>
                                </div>

                                <div className="border border-white/5 bg-white/[0.01] p-3.5 rounded-xl text-left">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                                            <Mic className="h-3.5 w-3.5 text-brand-primary" />
                                            02 / Spoken English
                                        </h4>
                                        <span className="rounded-full bg-brand-primary/10 px-2 text-[8px] uppercase text-brand-primary">Clear pace</span>
                                    </div>
                                    <p className="text-[10px] text-brand-tint/70 leading-relaxed">
                                        Practice prompt: swap <span className="text-white">"I want to say"</span> with <span className="text-white">"My main contribution was"</span>.
                                    </p>
                                </div>

                                <div className="border border-white/5 bg-white/[0.01] p-3.5 rounded-xl text-left">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                                            <Users className="h-3.5 w-3.5 text-brand-tint" />
                                            03 / Mock Interview
                                        </h4>
                                        <span className="font-mono text-[9px] text-brand-tint bg-white/5 px-1.5 rounded">STAR Method</span>
                                    </div>
                                    <p className="text-[10px] text-brand-tint/70 leading-relaxed">
                                        Situation and Action mapped correctly. <span className="text-brand-primary font-medium">Tip:</span> State the final metric (e.g., "saved 20 hours").
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 2. THREE-MODULE OVERVIEW ─────────────────────────────────────────── */}
            <section id="overview" className="relative w-full max-w-7xl px-6 py-16 md:px-12 border-t border-white/5">
                <div className="text-center space-y-3 mb-12">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-primary">
                        Practice Areas
                    </span>
                    <h2 className="font-heading text-2xl md:text-4xl font-semibold tracking-tight">
                        Three modules. One unified path.
                    </h2>
                </div>

                {/* Staggered lightweight rows */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {/* Resume Card */}
                    <div className="bezel-outer p-1 bg-white/[0.005]">
                        <div className="bezel-inner p-6 flex flex-col justify-between h-full">
                            <div className="space-y-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-primary/20 bg-brand-primary/5 text-brand-primary">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <h3 className="font-heading text-xl font-medium tracking-tight">Resume builder</h3>
                                <p className="text-xs leading-relaxed text-brand-tint/80">
                                    Write clean, metrics-focused templates. MockMate scans your formatting and aligns achievements with recruiter keyword standards.
                                </p>
                            </div>
                            <button onClick={onGetStarted} className="mt-6 flex items-center gap-1.5 text-[10px] text-brand-primary font-bold uppercase tracking-wider hover:underline">
                                Start Resume Prep <ChevronRight className="h-3 w-3" />
                            </button>
                        </div>
                    </div>

                    {/* ClearSpeak Card */}
                    <div className="bezel-outer p-1 bg-white/[0.005]">
                        <div className="bezel-inner p-6 flex flex-col justify-between h-full">
                            <div className="space-y-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-primary/20 bg-brand-primary/5 text-brand-primary">
                                    <Mic className="h-5 w-5" />
                                </div>
                                <h3 className="font-heading text-xl font-medium tracking-tight">Speaking coach</h3>
                                <p className="text-xs leading-relaxed text-brand-tint/80">
                                    Practice spoken English in private, slow down when needed, and build clearer interview answers.
                                </p>
                            </div>
                            <button onClick={onGetStarted} className="mt-6 flex items-center gap-1.5 text-[10px] text-brand-primary font-bold uppercase tracking-wider hover:underline">
                                Practice Speaking <ChevronRight className="h-3 w-3" />
                            </button>
                        </div>
                    </div>

                    {/* Interview Card */}
                    <div className="bezel-outer p-1 bg-white/[0.005]">
                        <div className="bezel-inner p-6 flex flex-col justify-between h-full">
                            <div className="space-y-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/5 text-brand-tint">
                                    <Users className="h-5 w-5" />
                                </div>
                                <h3 className="font-heading text-xl font-medium tracking-tight">Interview practice</h3>
                                <p className="text-xs leading-relaxed text-brand-tint/80">
                                    Practice role-based questions, speak responses out loud, and get ready with simple answer structure.
                                </p>
                            </div>
                            <button onClick={onGetStarted} className="mt-6 flex items-center gap-1.5 text-[10px] text-white font-bold uppercase tracking-wider hover:underline">
                                Start interview practice <ChevronRight className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 3. HOW MOCKMATE WORKS JOURNEY ───────────────────────────────────── */}
            <section className="relative w-full max-w-5xl px-6 py-16 md:px-12 border-t border-white/5 bg-brand-dark/15">
                <div className="text-center space-y-3 mb-12">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-primary">
                        Step-by-step
                    </span>
                    <h2 className="font-heading text-2xl md:text-4xl font-semibold tracking-tight">
                        How MockMate Works
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                    {/* Step 1 */}
                    <div className="relative p-5 bg-white/[0.01] border border-white/5 rounded-xl text-left">
                        <div className="font-mono text-xs font-bold text-brand-primary mb-2">01 // UPLOAD</div>
                        <h4 className="text-xs font-bold text-white mb-1.5">Import Resume</h4>
                        <p className="text-[11px] text-brand-tint leading-relaxed">
                            Add your resume and get simple suggestions to make it easier for hiring tools and recruiters to read.
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="relative p-5 bg-white/[0.01] border border-white/5 rounded-xl text-left">
                        <div className="font-mono text-xs font-bold text-brand-primary mb-2">02 // SPEAK</div>
                        <h4 className="text-xs font-bold text-white mb-1.5">Practice Speaking</h4>
                        <p className="text-[11px] text-brand-tint leading-relaxed">
                            Practice speaking prompts in private. Review vocal clarity, pacing, and filler sounds.
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div className="relative p-5 bg-white/[0.01] border border-white/5 rounded-xl text-left">
                        <div className="font-mono text-xs font-bold text-brand-primary mb-2">03 // PRACTICE</div>
                        <h4 className="text-xs font-bold text-white mb-1.5">Mock Interviews</h4>
                        <p className="text-[11px] text-brand-tint leading-relaxed">
                            Respond to role-based questions and learn how to make answers clearer.
                        </p>
                    </div>

                    {/* Step 4 */}
                    <div className="relative p-5 bg-white/[0.01] border border-white/5 rounded-xl text-left">
                        <div className="font-mono text-xs font-bold text-white/50 mb-2">04 // TRACK</div>
                        <h4 className="text-xs font-bold text-white mb-1.5">Build Readiness</h4>
                        <p className="text-[11px] text-brand-tint leading-relaxed">
                            Track your overall Job Readiness score climb after every practice round.
                        </p>
                    </div>
                </div>
            </section>

            {/* ── 4. SIGNATURE JOB READINESS INDEX ──────────────────────────────────── */}
            <section className="w-full max-w-7xl px-6 py-16 md:px-12 border-t border-white/5">
                <div className="bezel-outer p-1 bg-white/[0.01]">
                    <div className="bezel-inner p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 bg-brand-navy">
                        <div className="space-y-4 text-left md:w-3/5">
                            <span className="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.25em] text-brand-primary">
                                Readiness Score
                            </span>
                            <h2 className="font-heading text-2xl md:text-4xl font-semibold text-white leading-tight">
                                See how ready you are for the next interview.
                            </h2>
                            <p className="text-xs md:text-sm text-brand-tint leading-relaxed">
                                MockMate brings your resume, spoken English, and interview practice into one simple progress score so you know what to improve next.
                            </p>

                            {/* Horizontal progress meters */}
                            <div className="space-y-3 pt-2">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-mono text-brand-tint">
                                        <span>RESUME READINESS</span>
                                        <span>88%</span>
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-brand-primary" style={{ width: '88%' }} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-mono text-brand-tint">
                                        <span>SPEAKING PRACTICE</span>
                                        <span>82%</span>
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-brand-primary" style={{ width: '82%' }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Signature Visual Radial/Display Score */}
                        <div className="md:w-2/5 flex flex-col items-center justify-center shrink-0 p-4 border border-white/5 bg-white/[0.01] rounded-2xl min-w-[200px]">
                            <span className="font-mono text-6xl md:text-8xl font-bold text-brand-primary tracking-tighter">
                                84%
                            </span>
                            <div className="text-[9px] uppercase tracking-widest text-brand-tint/40 mt-2 font-mono">
                                READINESS INDEX // PASS
                            </div>
                            <span className="mt-1 text-[10px] font-medium text-brand-primary/80">Ready to Apply</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 5. BEGINNER-FIRST PRIVATE PRACTICE & TRANSFORMATION ───────────────── */}
            <section className="w-full max-w-7xl px-6 py-16 md:px-12 border-t border-white/5 bg-brand-dark/10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                    {/* Explanation */}
                    <div className="lg:col-span-5 space-y-5 text-left">
                        <span className="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.2em] text-brand-primary">
                            Beginner First
                        </span>
                        <h2 className="font-heading text-2xl md:text-4xl font-semibold tracking-tight">
                            Build confidence in a private practice space.
                        </h2>
                        <p className="text-xs md:text-sm text-brand-tint leading-relaxed">
                            Preparation shouldn't cause anxiety. MockMate runs completely camera-free, provides unlimited answer restarts, and guides you with friendly, constructive speech suggestions.
                        </p>

                        <div className="space-y-3 pt-2">
                            <div className="flex items-start gap-2.5">
                                <Lock className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
                                <p className="text-xs text-brand-tint/80 leading-relaxed">
                                    <span className="font-bold text-white">Private practice:</span> Nobody watches you practice. Reset sessions at any moment.
                                </p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <Volume2 className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
                                <p className="text-xs text-brand-tint/80 leading-relaxed">
                                    <span className="font-bold text-white">Slow pacing coach:</span> Clear feedback on word density and filler sounds.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Before/After Transformation Slider Container */}
                    <div className="lg:col-span-7 w-full">
                        {/* Mobile Tab Switcher */}
                        <div className="flex sm:hidden justify-center mb-4">
                            <div className="inline-flex rounded-full bg-white/5 p-0.5 border border-white/5">
                                <button
                                    onClick={() => setBeforeAfterToggle('before')}
                                    className={`rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                                        beforeAfterToggle === 'before'
                                            ? 'bg-red-500/20 text-red-300'
                                            : 'text-brand-tint/60'
                                    }`}
                                >
                                    Before
                                </button>
                                <button
                                    onClick={() => setBeforeAfterToggle('after')}
                                    className={`rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                                        beforeAfterToggle === 'after'
                                            ? 'bg-brand-primary/20 text-brand-primary'
                                            : 'text-brand-tint/60'
                                    }`}
                                >
                                    With MockMate
                                </button>
                            </div>
                        </div>

                        {/* Comparative content */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                            {/* Before Panel */}
                            <div className={`bezel-outer p-1 bg-white/[0.005] ${beforeAfterToggle === 'before' ? 'block' : 'hidden sm:block'}`}>
                                <div className="bezel-inner p-5 bg-brand-dark/40 min-h-[220px] flex flex-col justify-between border border-red-500/5">
                                    <div className="space-y-4">
                                        <span className="text-[8px] font-mono font-bold text-red-400 uppercase tracking-widest">
                                            UNPREPARED STATE
                                        </span>
                                        <ul className="space-y-2 text-xs text-brand-tint/70">
                                            <li>• Untailored formatting CVs</li>
                                            <li>• Rapid 180+ WPM anxious speech</li>
                                            <li>• Missing impact metrics & STAR format</li>
                                        </ul>
                                    </div>
                                    <span className="text-[9px] font-mono text-red-400/40 border-t border-white/5 pt-3">
                                        READINESS LEVEL // 50%
                                    </span>
                                </div>
                            </div>

                            {/* After Panel */}
                            <div className={`bezel-outer p-1 bg-white/[0.005] ${beforeAfterToggle === 'after' ? 'block' : 'hidden sm:block'}`}>
                                <div className="bezel-inner p-5 bg-brand-dark/40 min-h-[220px] flex flex-col justify-between border border-brand-primary/10">
                                    <div className="space-y-4">
                                        <span className="text-[8px] font-mono font-bold text-brand-primary uppercase tracking-widest">
                                            READY STATE
                                        </span>
                                        <ul className="space-y-2 text-xs text-brand-tint">
                                            <li className="flex items-center gap-1">✓ ATS-Optimized formatting</li>
                                            <li className="flex items-center gap-1">✓ Calm 130 WPM pacing rate</li>
                                            <li className="flex items-center gap-1">✓ Mapped STAR metrics impact</li>
                                        </ul>
                                    </div>
                                    <span className="text-[9px] font-mono text-brand-primary/70 border-t border-white/5 pt-3">
                                        READINESS LEVEL // 85%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 6. PRIVACY & DATA CONTROLS ───────────────────────────────────────── */}
            <section className="w-full max-w-7xl px-6 py-16 md:px-12 border-t border-white/5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    <div className="lg:col-span-7 space-y-4 text-left">
                        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-brand-primary">
                            Data Privacy
                        </span>
                        <h2 className="font-heading text-2xl md:text-4xl font-semibold tracking-tight">
                            You retain complete data control.
                        </h2>
                        <p className="text-xs md:text-sm text-brand-tint leading-relaxed">
                            We do not sell your personal files or voice recordings. Your practice stays private, and you can delete your saved app data from the practice home.
                        </p>
                    </div>

                    <div className="lg:col-span-5 w-full">
                        <div className="bezel-outer p-1 bg-white/[0.005]">
                            <div className="bezel-inner p-5 text-center space-y-3">
                                <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-brand-tint">
                                    <Lock className="h-5 w-5" />
                                </div>
                                <h4 className="text-xs font-bold text-white">Secure Practice Policy</h4>
                                <p className="text-[10px] text-brand-tint/60 leading-relaxed max-w-xs mx-auto">
                                    We support complete data deletion. Click the controls in your Hub to clear practice history instantly.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 7. FINAL CTA & FOOTER ────────────────────────────────────────────── */}
            <section className="w-full max-w-7xl px-6 py-16 md:px-12 border-t border-white/5">
                <div className="bezel-outer p-1 bg-white/[0.01] w-full">
                    <div className="bezel-inner p-8 md:p-12 text-center space-y-6 bg-gradient-to-b from-brand-navy to-brand-dark/95 rounded-[22px]">
                        <div className="space-y-3 max-w-xl mx-auto">
                            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-brand-primary">
                                Practice Rooms Open
                            </span>
                            <h2 className="font-heading text-2xl md:text-4xl font-semibold tracking-tight text-white leading-tight">
                                Build your career confidence today.
                            </h2>
                            <p className="text-xs md:text-sm text-brand-tint/80 leading-relaxed">
                                Join students and freshers preparing for jobs. Scan CV formats, stabilize pacing, and practice answers.
                            </p>
                        </div>

                        <div className="pt-2 flex justify-center">
                            <button
                                onClick={onGetStarted}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-full bg-brand-primary px-8 py-4 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-dark shadow-[0_15px_30px_-12px_rgba(255,188,3,0.55)] hover:bg-brand-primary/95 transition-premium active:scale-[0.98]"
                            >
                                Start Practicing Free
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>

                        <p className="text-[10px] text-brand-tint/40 tracking-wider font-mono">
                            NO CREDIT CARD // PRIVATE WORKSPACE
                        </p>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="z-10 w-full max-w-7xl border-t border-white/5 py-8 px-6 text-center md:px-12">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-brand-tint/40">
                        © 2026 MOCKMATE. ALL RIGHTS RESERVED.
                    </span>
                    <div className="flex items-center gap-5">
                        <button
                            type="button"
                            onClick={onOpenPrivacy}
                            className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-tint/60 hover:text-white transition-colors"
                        >
                            Privacy
                        </button>
                        <button
                            type="button"
                            onClick={onOpenTerms}
                            className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-tint/60 hover:text-white transition-colors"
                        >
                            Terms
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
