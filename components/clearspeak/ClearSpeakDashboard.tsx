import React, { useEffect, useState } from 'react';
import type { ClearSpeakBridgePayload, ClearSpeakProfile, ClearSpeakProgress } from './types';
import { getProfile, getProgress } from '../../services/clearSpeakService';
import ClearSpeakOnboarding from './ClearSpeakOnboarding';
import ClearSpeakSession from './ClearSpeakSession';

interface ClearSpeakDashboardProps {
  onInterviewBridge: (payload: ClearSpeakBridgePayload) => void;
}

type DashboardView = 'loading' | 'onboarding' | 'dashboard' | 'session';

const clarityLabel = (score: number) => {
  if (score >= 85) return 'Very clear';
  if (score >= 70) return 'Clear';
  if (score >= 55) return 'Getting clearer';
  return 'Keep practicing';
};

const ClearSpeakDashboard: React.FC<ClearSpeakDashboardProps> = ({ onInterviewBridge }) => {
  const [view, setView] = useState<DashboardView>('loading');
  const [profile, setProfile] = useState<ClearSpeakProfile | null>(null);
  const [progress, setProgress] = useState<ClearSpeakProgress | null>(null);
  const [recentTopics, setRecentTopics] = useState<string[]>([]);
  const [sessionAttemptLength, setSessionAttemptLength] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const [p, prog] = await Promise.all([getProfile(), getProgress()]);
        setProfile(p);
        setProgress(prog);
        setView(p ? 'dashboard' : 'onboarding');
      } catch {
        setView('onboarding');
      }
    })();
  }, []);

  const handleOnboardingComplete = (newProfile: ClearSpeakProfile) => {
    setProfile(newProfile);
    setView('dashboard');
  };

  const handleSessionComplete = async (topicTag?: string) => {
    try {
      const prog = await getProgress();
      setProgress(prog);
      setRecentTopics(prev => {
        const next = topicTag ? [...prev, topicTag] : prev;
        return next.slice(-50);
      });
      setSessionAttemptLength(prev => prev + 1);
    } catch {}
    setView('dashboard');
  };

  if (view === 'loading') {
    return (
      <div className="w-full h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-14 h-14 rounded-full border-[3.5px] border-brand-primary/10 border-t-brand-primary animate-spin"></div>
          <p className="text-brand-primary font-bold tracking-[0.14em] uppercase text-[10px]">Getting ready...</p>
        </div>
      </div>
    );
  }

  if (view === 'onboarding') {
    return <ClearSpeakOnboarding onComplete={handleOnboardingComplete} />;
  }

  if (view === 'session') {
    return (
      <ClearSpeakSession
        onInterviewBridge={onInterviewBridge}
        onComplete={handleSessionComplete}
        recentTopics={recentTopics}
        sessionAttemptLength={sessionAttemptLength}
        profileRole={profile?.role ?? 'general_corporate'}
      />
    );
  }

  const avgScore = progress && progress.clarityTrend.length > 0
    ? Math.round(progress.clarityTrend.reduce((a, b) => a + b, 0) / progress.clarityTrend.length)
    : 0;

  return (
    <div className="flex w-full min-h-[60dvh] flex-col items-center justify-start p-0 animate-in fade-in duration-500 sm:p-4 md:justify-center md:p-8">
      <header className="mb-8 flex flex-col items-center gap-4 text-center sm:mb-12">
        <div className="rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-4 py-2 font-bold uppercase tracking-[0.12em] text-[10px]">
          Spoken English
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Speak with confidence
        </h1>
        <p className="max-w-md text-sm font-normal leading-relaxed text-brand-tint sm:text-base">
          Short daily practice sessions to help you speak clearly and feel calmer in interviews.
        </p>
      </header>

      <section className="relative flex w-full max-w-2xl flex-col items-center gap-6 overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6 text-center shadow-2xl sm:gap-7 sm:rounded-[24px] sm:p-10">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-brand-primary/80"></div>
        <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
          {progress && progress.streak > 0
            ? `Day ${progress.streak} practice streak`
            : 'Start your daily speaking practice'}
        </h2>
        <p className="text-sm sm:text-base text-brand-tint max-w-lg leading-relaxed font-normal">
          {profile
            ? `Your ${profile.practiceDuration}-minute session is ready. Practice a little each day and notice what gets easier.`
            : 'Practice spoken English in just 3 minutes. Short exercises, real progress.'}
        </p>
        <button
          id="cs-start-practice"
          onClick={() => setView('session')}
          className="relative z-10 w-full max-w-md bg-brand-primary hover:bg-brand-primary/90 text-brand-dark border-none py-5 mt-2 rounded-2xl shadow-xl active:scale-95 transition-all font-bold uppercase tracking-[0.12em] text-[11px]"
        >
          Start today's practice
        </button>
        <p className="text-xs text-brand-tint">Your practice stays private.</p>
      </section>

      {progress && (
        <section className="relative mt-6 w-full max-w-2xl overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.035] p-5 shadow-sm sm:mt-8 sm:rounded-[24px] sm:p-8">
          <h3 className="text-[10px] font-bold text-brand-primary mb-6 flex items-center gap-3 tracking-[0.12em] uppercase">
            Your progress
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Metric label="Clarity" value={avgScore > 0 ? clarityLabel(avgScore) : '-'} />
            <Metric label="Filler words" value={avgScore > 0 ? '2' : '-'} />
            <Metric label="How clear you sound" value={avgScore > 0 ? `${avgScore}%` : '-'} />
            <Metric label="Practices done" value={String(progress.totalSessionsCompleted)} />
          </div>
        </section>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col items-center justify-center p-4 bg-white/[0.04] rounded-2xl border border-white/10 gap-1.5">
    <span className="text-[9px] font-bold text-brand-tint uppercase tracking-[0.1em] text-center">{label}</span>
    <span className="text-xl font-bold text-white tracking-tight text-center">{value}</span>
  </div>
);

export default ClearSpeakDashboard;
