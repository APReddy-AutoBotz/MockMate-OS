import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Check, FileText, Lock, Mic, Users } from 'lucide-react';
import { Logo } from './icons/Logo';

interface LandingPageProps {
    onGetStarted: () => void;
    onOpenPrivacy: () => void;
    onOpenTerms: () => void;
}

const PRACTICE_AREAS = [
    {
        icon: FileText,
        title: 'Resume builder',
        description: 'Build or upload a resume, review ATS diagnostics, and improve wording without losing your own voice.',
        action: 'Prepare your resume',
    },
    {
        icon: Mic,
        title: 'ClearSpeak',
        description: 'Available to every signed-in user. Record, listen back, and receive speech feedback only when reliable scoring is available.',
        action: 'Practice speaking',
    },
    {
        icon: Users,
        title: 'Mock interviews',
        description: 'Answer role-based questions in private and review practical feedback after each practice session.',
        action: 'Rehearse an interview',
    },
] as const;

const NEXT_PRACTICES = [
    { icon: FileText, label: 'Resume', task: 'Strengthen one experience bullet' },
    { icon: Mic, label: 'ClearSpeak', task: 'Record a 60-second answer and listen back' },
    { icon: Users, label: 'Interview', task: 'Practice “Tell me about yourself”' },
] as const;

const STEPS = [
    {
        number: '1',
        title: 'Tell us what you are preparing for',
        description: 'Set your target role once, then choose the practice area that matters today.',
    },
    {
        number: '2',
        title: 'Practice in a short, private round',
        description: 'Work at your own pace. Restart when you need to and keep the camera off.',
    },
    {
        number: '3',
        title: 'Review what is worth keeping',
        description: 'Use the practice journal and confirm Career Context before it is reused elsewhere.',
    },
] as const;

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onOpenPrivacy, onOpenTerms }) => (
    <div className="relative min-h-screen overflow-x-hidden bg-brand-navy font-sans text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden">
            <div className="absolute -right-32 top-16 h-80 w-80 rounded-full bg-brand-accent/25 blur-[110px]" />
            <div className="absolute -left-40 top-96 h-72 w-72 rounded-full bg-brand-primary/10 blur-[120px]" />
        </div>

        <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10 lg:py-7">
            <Logo className="h-10 w-auto sm:h-12" />
            <div className="flex items-center gap-2 sm:gap-3">
                <button
                    type="button"
                    onClick={onGetStarted}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-brand-tint transition-colors hover:text-white sm:px-4"
                >
                    Sign in
                </button>
                <button
                    type="button"
                    onClick={onGetStarted}
                    className="rounded-xl bg-brand-primary px-4 py-3 text-sm font-bold text-brand-dark transition-colors hover:bg-amber-300 sm:px-5"
                >
                    Start free
                </button>
            </div>
        </header>

        <main className="relative z-10">
            <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16 lg:px-10 lg:pb-28 lg:pt-24">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55 }}
                >
                    <p className="mb-5 text-sm font-semibold text-brand-primary">Career practice without the pressure</p>
                    <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
                        Practice the parts of job hunting that feel hardest.
                    </h1>
                    <p className="mt-6 max-w-xl text-base leading-7 text-brand-tint sm:text-lg sm:leading-8">
                        Improve your resume, rehearse spoken English, and prepare for interviews in one calm workspace built for independent practice.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={onGetStarted}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 text-sm font-bold text-brand-dark transition-colors hover:bg-amber-300"
                        >
                            Start free practice
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => document.getElementById('practice-areas')?.scrollIntoView({ behavior: 'smooth' })}
                            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06]"
                        >
                            See what is included
                        </button>
                    </div>
                    <p className="mt-5 text-sm text-brand-tint">Free to start · camera-free · daily limits may apply</p>
                </motion.div>

                <motion.aside
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.08 }}
                    aria-label="Example MockMate practice plan"
                    className="overflow-hidden rounded-[26px] border border-white/10 bg-brand-dark/70 shadow-[0_36px_90px_-45px_rgba(0,0,0,0.9)]"
                >
                    <div className="border-b border-white/10 px-6 py-5 sm:px-7">
                        <p className="text-sm font-semibold text-white">Your next practice</p>
                        <p className="mt-1 text-sm text-brand-tint">Choose one small step. There is no required order.</p>
                    </div>
                    <div className="divide-y divide-white/10">
                        {NEXT_PRACTICES.map(({ icon: Icon, label, task }) => (
                            <div key={label} className="flex items-center gap-4 px-6 py-5 sm:px-7">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                                    <Icon aria-hidden="true" className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-brand-primary">{label}</p>
                                    <p className="mt-1 text-sm leading-6 text-white">{task}</p>
                                </div>
                                <Check aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-brand-tint/60" />
                            </div>
                        ))}
                    </div>
                    <div className="bg-white/[0.035] px-6 py-4 text-sm leading-6 text-brand-tint sm:px-7">
                        MockMate never invents a speech score. Record-and-listen practice remains available when automatic scoring is not.
                    </div>
                </motion.aside>
            </section>

            <section id="practice-areas" className="border-y border-white/10 bg-brand-dark/30">
                <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
                    <div className="max-w-2xl">
                        <p className="text-sm font-semibold text-brand-primary">One practice home</p>
                        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Choose the help you need today.</h2>
                        <p className="mt-4 text-base leading-7 text-brand-tint">Each tool works on its own. Career Context can connect them only after you review and confirm what may be reused.</p>
                    </div>

                    <div className="mt-12 overflow-hidden rounded-[24px] border border-white/10 bg-brand-navy/70 md:grid md:grid-cols-3 md:divide-x md:divide-white/10">
                        {PRACTICE_AREAS.map(({ icon: Icon, title, description, action }, index) => (
                            <article key={title} className="flex min-h-[280px] flex-col border-b border-white/10 p-6 last:border-b-0 sm:p-8 md:border-b-0">
                                <div className="flex items-center justify-between">
                                    <Icon aria-hidden="true" className="h-6 w-6 text-brand-primary" />
                                    <span className="text-sm text-brand-tint">0{index + 1}</span>
                                </div>
                                <h3 className="mt-8 text-xl font-semibold text-white">{title}</h3>
                                <p className="mt-3 text-sm leading-6 text-brand-tint">{description}</p>
                                <button
                                    type="button"
                                    onClick={onGetStarted}
                                    className="mt-auto flex items-center gap-2 pt-8 text-left text-sm font-semibold text-brand-primary"
                                >
                                    {action}
                                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                </button>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20 lg:px-10 lg:py-28">
                <div>
                    <p className="text-sm font-semibold text-brand-primary">Designed around real practice</p>
                    <h2 className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                        Small sessions that can build into a useful routine.
                    </h2>
                    <div className="mt-7 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                        <BookOpen aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
                        <p className="text-sm leading-6 text-brand-tint">
                            Your practice journal keeps saved reports and progress together. Career Context lets you review the facts used for personalization.
                        </p>
                    </div>
                </div>
                <ol className="divide-y divide-white/10 border-y border-white/10">
                    {STEPS.map(({ number, title, description }) => (
                        <li key={number} className="grid grid-cols-[36px_1fr] gap-4 py-6 sm:grid-cols-[48px_1fr] sm:py-7">
                            <span className="text-lg font-semibold text-brand-primary">{number}</span>
                            <div>
                                <h3 className="text-lg font-semibold text-white">{title}</h3>
                                <p className="mt-2 text-sm leading-6 text-brand-tint">{description}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="border-y border-white/10 bg-brand-dark/40">
                <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12 sm:px-8 md:grid-cols-[auto_1fr] md:items-start lg:px-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                        <Lock aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">Privacy controls you can find and use</h2>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-tint">
                            Account details, preferences, and derived practice results may be stored so the app can work across sessions. Submitted text or audio may be processed by AI providers. MockMate does not retain raw ClearSpeak audio after server processing, and you can delete saved app data from your practice home.
                        </p>
                        <button type="button" onClick={onOpenPrivacy} className="mt-4 text-sm font-semibold text-brand-primary">
                            Read the privacy policy
                        </button>
                    </div>
                </div>
            </section>

            <section className="mx-auto w-full max-w-6xl px-5 py-20 text-center sm:px-8 lg:px-10 lg:py-28">
                <h2 className="mx-auto max-w-2xl font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Ready for one useful round of practice?</h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-brand-tint">Start with your resume, your voice, or an interview question. You can switch tools whenever you need.</p>
                <button
                    type="button"
                    onClick={onGetStarted}
                    className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-7 text-sm font-bold text-brand-dark transition-colors hover:bg-amber-300 sm:w-auto"
                >
                    Start free practice
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
            </section>
        </main>

        <footer className="relative z-10 border-t border-white/10">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-7 text-sm text-brand-tint sm:flex-row sm:px-8 lg:px-10">
                <span>© 2026 MockMate</span>
                <div className="flex items-center gap-5">
                    <button type="button" onClick={onOpenPrivacy} className="font-medium hover:text-white">Privacy</button>
                    <button type="button" onClick={onOpenTerms} className="font-medium hover:text-white">Terms</button>
                </div>
            </div>
        </footer>
    </div>
);

export default LandingPage;
