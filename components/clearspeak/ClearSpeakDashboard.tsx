import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ClearSpeakBridgePayload, ClearSpeakProfile, ClearSpeakProgress } from './types';
import { getCapabilities, getProfile, getProgress } from '../../services/clearSpeakService';
import type { ClearSpeakCapabilities } from '../../services/clearSpeakService';
import ClearSpeakOnboarding from './ClearSpeakOnboarding';
import ClearSpeakSession from './ClearSpeakSession';
import type { CareerContextSnapshot, ModuleBridgeSession } from 'mockmate-shared';
import AccentPracticeV1 from './AccentPracticeV1';

interface ClearSpeakDashboardProps {
  onInterviewBridge: (payload: ClearSpeakBridgePayload) => void;
  grounding?: { snapshot: CareerContextSnapshot; bridge: ModuleBridgeSession };
  onGroundingConsumed?: (bridgeId: string) => void;
}

type DashboardView = 'loading' | 'error' | 'onboarding' | 'dashboard' | 'session' | 'accent';

const matchLabel = (score: number) => {
  if (score >= 85) return 'Strong match';
  if (score >= 70) return 'Good match';
  if (score >= 55) return 'Building consistency';
  return 'Keep practicing';
};

const ClearSpeakDashboard: React.FC<ClearSpeakDashboardProps> = ({ onInterviewBridge, grounding, onGroundingConsumed }) => {
  const [view, setView] = useState<DashboardView>('loading');
  const [profile, setProfile] = useState<ClearSpeakProfile | null>(null);
  const [progress, setProgress] = useState<ClearSpeakProgress | null>(null);
  const [capabilities, setCapabilities] = useState<ClearSpeakCapabilities | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [recentTopics, setRecentTopics] = useState<string[]>([]);
  const [sessionAttemptLength, setSessionAttemptLength] = useState<number>(0);
  const notifiedGroundingBridge = useRef<string | null>(null);

  const notifyGroundingConsumed = useCallback((bridgeId: string) => {
    if (notifiedGroundingBridge.current === bridgeId) return;
    notifiedGroundingBridge.current = bridgeId;
    onGroundingConsumed?.(bridgeId);
  }, [onGroundingConsumed]);

  useEffect(() => {
    (async () => {
      try {
        const [p, prog, capability] = await Promise.all([getProfile(), getProgress(), getCapabilities()]);
        setProfile(p);
        setProgress(prog);
        setCapabilities(capability);
        setLoadError('');
        setView(p ? 'dashboard' : 'onboarding');
      } catch (error: any) {
        setLoadError(error?.message || 'We could not load speaking practice. Check your connection and try again.');
        setView('error');
      }
    })();
  }, [loadAttempt]);

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
    if (grounding) notifyGroundingConsumed(grounding.bridge.id);
    setView('dashboard');
  };

  const handleInterviewBridge = (payload: ClearSpeakBridgePayload) => {
    if (grounding) notifyGroundingConsumed(grounding.bridge.id);
    onInterviewBridge(payload);
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

  if (view === 'error') {
    return (
      <div className="flex min-h-[55dvh] w-full items-center justify-center">
        <div className="flex max-w-lg flex-col items-center gap-5 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-8 text-center">
          <h2 className="text-2xl font-semibold text-white">Speaking practice did not load</h2>
          <p className="text-sm leading-relaxed text-brand-tint">{loadError}</p>
          <button
            type="button"
            onClick={() => { setView('loading'); setLoadAttempt(value => value + 1); }}
            className="rounded-xl bg-brand-primary px-6 py-3 font-bold text-brand-dark focus:outline-none focus:ring-2 focus:ring-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (view === 'session' && capabilities?.standardSessionScoringAvailable) {
    return (
      <ClearSpeakSession
        onInterviewBridge={handleInterviewBridge}
        onComplete={handleSessionComplete}
        onCanonicalGroundedScore={notifyGroundingConsumed}
        recentTopics={recentTopics}
        sessionAttemptLength={sessionAttemptLength}
        profileRole={profile?.role ?? 'general_corporate'}
        grounding={grounding}
      />
    );
  }

  if (view === 'accent') return <AccentPracticeV1 onExit={() => setView('dashboard')} />;

  const hasVerifiedScoreProgress = progress?.scoreEvidenceBasis === 'transcript_timing_heuristic';
  const avgScore = hasVerifiedScoreProgress && progress && progress.clarityTrend.length > 0
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
          Short daily passages with transcript-match, pace, and pause-timing feedback for interview practice.
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
          disabled={!capabilities?.standardSessionScoringAvailable}
          className="relative z-10 mt-2 w-full max-w-md rounded-2xl border-none bg-brand-primary py-5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-dark shadow-xl transition-all hover:bg-brand-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-brand-tint disabled:shadow-none"
        >
          {capabilities?.standardSessionScoringAvailable
            ? "Start today's scored practice"
            : 'Scored practice temporarily unavailable'}
        </button>
        {!capabilities?.standardSessionScoringAvailable && (
          <p role="status" className="max-w-md text-sm leading-relaxed text-brand-tint">
            Delivery scoring needs the transcription provider and is unavailable right now. No quota or progress will be changed. You can still use reference-style practice below.
          </p>
        )}
        <button onClick={() => setView('accent')} className="w-full max-w-md rounded-xl border border-brand-primary/50 px-6 py-3 font-semibold text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary">
          Practice UK / US reference styles
        </button>
        <p className="text-xs text-brand-tint">Your practice stays private.</p>
      </section>

      {progress && (
        <section className="relative mt-6 w-full max-w-2xl overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.035] p-5 shadow-sm sm:mt-8 sm:rounded-[24px] sm:p-8">
          <h3 className="text-[10px] font-bold text-brand-primary mb-6 flex items-center gap-3 tracking-[0.12em] uppercase">
            Your progress
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Metric label="Transcript match" value={avgScore > 0 ? matchLabel(avgScore) : '-'} />
            <Metric label="Hard words practiced" value={String(progress.hardWordCount)} />
            <Metric label="Average text match" value={avgScore > 0 ? `${avgScore}/100` : '-'} />
            <Metric label="Practices done" value={String(progress.totalSessionsCompleted)} />
          </div>
          {!hasVerifiedScoreProgress && progress.totalSessionsCompleted > 0 && (
            <p className="mt-5 text-sm leading-relaxed text-brand-tint">
              Older score trends are hidden because their evidence source was not recorded.
            </p>
          )}
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
