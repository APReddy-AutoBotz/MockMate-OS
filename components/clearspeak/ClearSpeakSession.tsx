/**
 * components/clearspeak/ClearSpeakSession.tsx
 * Mockmate ClearSpeak — main session orchestrator.
 *
 * Implements the screen-by-screen UX flow:
 *   idle → vocab_warmup → guided_read (with live pause/resume & review) → processing
 *       → score_card (with audio playback) → [retry?] → [bridge_prompt?] → complete
 *
 * Polished communication coach experience:
 *   - Native reference voiceover (normal 1.0x & slow 0.8x)
 *   - Interactive tap-to-pronounce on ANY word
 *   - Live recording timer, pause/resume, and discard/start-over
 *   - Audio preview player before scoring (no accidental submissions)
 *   - Scorecard with audio playback of the evaluated attempt
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  ClearSpeakPhase,
  ClearSpeakSessionContent,
  ClearSpeakSessionScore,
  ClearSpeakProgress,
  BridgeTriggerState,
  ClearSpeakBridgePayload,
} from './types';
import type { CareerContextSnapshot, ModuleBridgeSession } from 'mockmate-shared';
import {
  generateSession,
  scoreSession,
  LowConfidenceError,
  ScoringUnavailableError,
} from '../../services/clearSpeakService';
import { csTrack, newSessionId } from '../../services/csAnalytics';
import { useAudioRecorder } from './useAudioRecorder';
import { accentAudioService } from '../../services/accentAudioService';
import PassageRenderer from './PassageRenderer';
import BetaFeedback from './BetaFeedback';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClearSpeakSessionProps {
  onInterviewBridge: (payload: ClearSpeakBridgePayload) => void;
  onScoreCommitStateChange?: (inFlight: boolean) => void;
  onComplete: (topicTag?: string) => void;
  onCanonicalGroundedScore?: (bridgeId: string) => void;
  recentTopics?: string[];
  sessionAttemptLength?: number;
  profileRole: import('./types').ClearSpeakRole;
  grounding?: { snapshot: CareerContextSnapshot; bridge: ModuleBridgeSession };
}

// ─── State Machine ────────────────────────────────────────────────────────────

interface SessionState {
  phase: ClearSpeakPhase;
  content: ClearSpeakSessionContent | null;
  score: ClearSpeakSessionScore | null;
  progress: ClearSpeakProgress | null;
  bridgeTrigger: BridgeTriggerState | null;
  isRetry: boolean;
  error: string | null;
}

type SessionAction =
  | { type: 'CONTENT_LOADED'; content: ClearSpeakSessionContent }
  | { type: 'START_WARMUP' }
  | { type: 'START_READ' }
  | { type: 'START_RECORDING' }
  | { type: 'START_PROCESSING' }
  | { type: 'SCORE_RECEIVED'; score: ClearSpeakSessionScore; progress: ClearSpeakProgress; bridge: BridgeTriggerState }
  | { type: 'TRIGGER_RETRY' }
  | { type: 'TRIGGER_BRIDGE' }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; message: string };

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'CONTENT_LOADED':
      return { ...state, content: action.content, phase: 'vocab_warmup', error: null };
    case 'START_WARMUP':
      return { ...state, phase: 'vocab_warmup' };
    case 'START_READ':
      return { ...state, phase: 'guided_read' };
    case 'START_RECORDING':
      return { ...state, phase: 'recording' };
    case 'START_PROCESSING':
      return { ...state, phase: 'processing' };
    case 'SCORE_RECEIVED':
      return {
        ...state,
        phase: 'score_card',
        score: action.score,
        progress: action.progress,
        bridgeTrigger: action.bridge,
      };
    case 'TRIGGER_RETRY':
      return { ...state, phase: 'retry', isRetry: true };
    case 'TRIGGER_BRIDGE':
      return { ...state, phase: 'bridge_prompt' };
    case 'COMPLETE':
      return { ...state, phase: 'complete' };
    case 'ERROR':
      return { ...state, error: action.message, phase: 'idle' };
    default:
      return state;
  }
}

const INITIAL_STATE: SessionState = {
  phase: 'idle',
  content: null,
  score: null,
  progress: null,
  bridgeTrigger: null,
  isRetry: false,
  error: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

const ClearSpeakSession: React.FC<ClearSpeakSessionProps> = ({
  onInterviewBridge,
  onScoreCommitStateChange,
  onComplete,
  onCanonicalGroundedScore,
  recentTopics = [],
  sessionAttemptLength = 0,
  profileRole,
  grounding,
}) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const recorder = useAudioRecorder();

  const sessionGrounding = useRef(grounding).current;
  const sessionId = useRef(newSessionId()).current;
  const [retryUsed, setRetryUsed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const notifiedGroundedCompletion = useRef<string | null>(null);

  // Audio preview & feedback states
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [isPlayingCoach, setIsPlayingCoach] = useState(false);
  const [lastScoredAudioUrl, setLastScoredAudioUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const previewUrl = useMemo(
    () => recorder.audioBlob ? URL.createObjectURL(recorder.audioBlob) : '',
    [recorder.audioBlob],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Clean up last scored audio object url on unmount
  useEffect(() => () => {
    if (lastScoredAudioUrl) URL.revokeObjectURL(lastScoredAudioUrl);
    accentAudioService.stop();
  }, [lastScoredAudioUrl]);

  // Live timer for recording state
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (recorder.state === 'recording') {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else if (recorder.state === 'idle' || recorder.state === 'canceled') {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recorder.state]);

  useEffect(() => {
    onScoreCommitStateChange?.(state.phase === 'processing');
    return () => onScoreCommitStateChange?.(false);
  }, [onScoreCommitStateChange, state.phase]);

  useEffect(() => {
    const bridgeId = sessionGrounding?.bridge.id;
    if (state.phase !== 'score_card' || !bridgeId || notifiedGroundedCompletion.current === bridgeId) return;
    notifiedGroundedCompletion.current = bridgeId;
    onCanonicalGroundedScore?.(bridgeId);
  }, [sessionGrounding?.bridge.id, onCanonicalGroundedScore, state.phase]);

  // Load content on mount
  useEffect(() => {
    (async () => {
      try {
        const content = await generateSession(recentTopics, sessionAttemptLength, sessionGrounding);
        dispatch({ type: 'CONTENT_LOADED', content });
        void csTrack('session_started', sessionId, {
          topicTag: content.topicTag,
          difficultyLevel: content.difficultyLevel,
        });
      } catch (err: any) {
        dispatch({ type: 'ERROR', message: err.message || 'Failed to load practice content.' });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio Playback Helpers
  const handleWordClick = async (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '').trim().toLowerCase();
    if (!clean) return;
    setActiveWord(clean);
    try {
      await accentAudioService.speakWord(word, 'en-US');
    } catch (e) {
      console.warn('Word audio error', e);
    } finally {
      setActiveWord(null);
    }
  };

  const playCoachAudio = async (text: string, slow = false) => {
    setIsPlayingCoach(true);
    setActiveWord(null);
    try {
      await accentAudioService.speak(text, {
        locale: 'en-US',
        rate: slow ? 0.78 : 0.95,
        pitch: 1.0,
      });
    } catch (e) {
      console.warn('Playback error', e);
    } finally {
      setIsPlayingCoach(false);
    }
  };

  const stopCoachAudio = () => {
    accentAudioService.stop();
    setIsPlayingCoach(false);
    setActiveWord(null);
  };

  // Submit recording for scoring (called explicitly when learner clicks evaluate)
  const handleSubmitRecording = useCallback(async (isRetryAttempt: boolean) => {
    if (!recorder.audioBlob || !state.content) return;

    stopCoachAudio();

    // Persist a copy of preview url for the scorecard so the learner can listen back
    if (previewUrl) {
      setLastScoredAudioUrl(previewUrl);
    }

    dispatch({ type: 'START_PROCESSING' });

    try {
      const { score, progress, bridgeTrigger } = await scoreSession({
        audioBlob: recorder.audioBlob,
        content: state.content,
        retryAttempted: isRetryAttempt,
        grounding: sessionGrounding,
        clientSessionId: sessionId,
      });

      recorder.clearAudio();

      if (score.composite <= 15 && score.clarity === 0) {
        void csTrack('low_confidence_error', sessionId, { errorSource: 'frontend_guard' });
        dispatch({
          type: 'ERROR',
          message: "We couldn't clearly hear your recording. Please check your microphone and try again.",
        });
        return;
      }

      void csTrack('score_feedback_viewed', sessionId, {
        composite: score.composite,
        clarity: score.clarity,
        pacing: score.pacing,
        rhythm: score.rhythm,
      });

      dispatch({ type: 'SCORE_RECEIVED', score, progress, bridge: bridgeTrigger });
    } catch (err: any) {
      recorder.clearAudio();
      if (err instanceof LowConfidenceError) {
        void csTrack('low_confidence_error', sessionId, { errorSource: 'route_422' });
        dispatch({ type: 'ERROR', message: err.message });
      } else if (err instanceof ScoringUnavailableError) {
        dispatch({ type: 'ERROR', message: `${err.message} Your recording was discarded and no progress or quota was changed.` });
      } else {
        dispatch({ type: 'ERROR', message: err.message || 'Scoring failed. Please try again.' });
      }
    }
  }, [recorder, state.content, sessionId, previewUrl]);

  // Safeguard: Catch async recorder errors after phase transitions
  useEffect(() => {
    if (
      (state.phase === 'recording' || state.phase === 'retry') &&
      ['error', 'device_lost', 'permission_revoked', 'permission_denied', 'offline', 'unsupported'].includes(recorder.state)
    ) {
      dispatch({ type: 'ERROR', message: recorder.errorMessage || 'Recording failed. Please check microphone permissions.' });
    }
  }, [state.phase, recorder.state, recorder.errorMessage]);

  const handleNextPassage = async () => {
    stopCoachAudio();
    recorder.clearAudio();
    dispatch({ type: 'START_PROCESSING' });
    try {
      const content = await generateSession(recentTopics, sessionAttemptLength + 1, sessionGrounding);
      dispatch({ type: 'CONTENT_LOADED', content });
    } catch (err: any) {
      dispatch({ type: 'ERROR', message: err.message || 'Failed to load next passage.' });
    }
  };

  // ── Phase Renders ──────────────────────────────────────────────────────────

  if (state.phase === 'idle') {
    return (
      <div className="flex min-h-[55dvh] w-full items-center justify-center animate-in fade-in duration-500">
        {state.error ? (
          <div className="flex flex-col items-center gap-6 p-8 bg-red-500/10 border border-red-500/20 rounded-2xl max-w-lg text-center">
            <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-300 text-base font-medium">{state.error}</p>
            {state.content ? (
              <button
                id="cs-error-retry"
                onClick={() => dispatch({ type: 'START_READ' })}
                className="px-6 py-3 bg-brand-primary text-brand-dark font-bold rounded-xl hover:brightness-110 transition-all shadow-md"
              >
                Try Again
              </button>
            ) : (
              <button
                onClick={() => onComplete()}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all"
              >
                Back to Dashboard
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin"></div>
            <p className="text-brand-primary font-semibold tracking-wide animate-pulse">Preparing practice content...</p>
          </div>
        )}
      </div>
    );
  }

  if (state.phase === 'vocab_warmup' && state.content) {
    return (
      <VocabWarmup
        vocab={state.content.keyVocab}
        onReady={() => dispatch({ type: 'START_READ' })}
        onWordClick={handleWordClick}
        activeWord={activeWord}
      />
    );
  }

  if ((state.phase === 'guided_read' || state.phase === 'recording') && state.content) {
    return (
      <GuidedReadAndRecordView
        content={state.content}
        recorder={recorder}
        previewUrl={previewUrl}
        activeWord={activeWord}
        isPlayingCoach={isPlayingCoach}
        elapsedSeconds={elapsedSeconds}
        onWordClick={handleWordClick}
        onPlayCoach={(slow) => playCoachAudio(state.content!.passageData.map(t => t.text).join(' '), slow)}
        onStopCoach={stopCoachAudio}
        onStartRecording={async () => {
          stopCoachAudio();
          try {
            await recorder.startRecording();
            dispatch({ type: 'START_RECORDING' });
          } catch (err: any) {
            dispatch({ type: 'ERROR', message: err.message });
          }
        }}
        onPauseRecording={recorder.pauseRecording}
        onResumeRecording={recorder.resumeRecording}
        onStopRecording={() => {
          recorder.stopRecording();
        }}
        onDiscardRecording={() => {
          recorder.abortRecording();
          recorder.clearAudio();
          dispatch({ type: 'START_READ' });
        }}
        onSubmitRecording={() => handleSubmitRecording(false)}
        onSkipPassage={handleNextPassage}
      />
    );
  }

  if (state.phase === 'processing') {
    return (
      <div className="flex min-h-[55dvh] w-full flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
        <div className="w-28 h-28 relative flex items-center justify-center mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-brand-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-brand-primary border-r-brand-primary/60 border-b-transparent border-l-transparent animate-spin"></div>
          <span className="text-3xl">🎙</span>
        </div>
        <p className="text-2xl font-bold text-white mb-2 tracking-tight">Analyzing speech delivery & pacing...</p>
        <span className="text-xs uppercase tracking-widest text-brand-tint">Measuring transcript match, rhythm, and pauses</span>
      </div>
    );
  }

  if (state.phase === 'score_card' && state.score && state.content) {
    const shouldRetry = !sessionGrounding && state.score.composite < 75 && !state.isRetry;
    return (
      <ScoreCard
        score={state.score}
        progress={state.progress}
        recordedAudioUrl={lastScoredAudioUrl}
        onRetry={shouldRetry ? () => {
          void csTrack('retry_used', sessionId, { firstComposite: state.score!.composite });
          setRetryUsed(true);
          dispatch({ type: 'TRIGGER_RETRY' });
        } : undefined}
        onNextPassage={handleNextPassage}
        onContinue={() => {
          if (state.bridgeTrigger?.shouldSurface) {
            void csTrack('bridge_triggered', sessionId, { role: profileRole });
            dispatch({ type: 'TRIGGER_BRIDGE' });
          } else {
            dispatch({ type: 'COMPLETE' });
          }
        }}
      />
    );
  }

  if (state.phase === 'retry' && state.content) {
    return (
      <RetryView
        sentence={state.content.retrySentence}
        recorder={recorder}
        previewUrl={previewUrl}
        activeWord={activeWord}
        isPlayingCoach={isPlayingCoach}
        onWordClick={handleWordClick}
        onPlayCoach={(slow) => playCoachAudio(state.content!.retrySentence, slow)}
        onStopCoach={stopCoachAudio}
        onSubmit={() => handleSubmitRecording(true)}
        onCancel={() => dispatch({ type: 'START_READ' })}
      />
    );
  }

  if (state.phase === 'bridge_prompt' && state.content && state.score) {
    return (
      <BridgePrompt
        question={state.content.interviewBridgeQuestion}
        topicTag={state.content.topicTag}
        onAccept={() => {
          void csTrack('bridge_entered', sessionId, { role: profileRole, topicTag: state.content!.topicTag });
          const payload: ClearSpeakBridgePayload = {
            source: 'clearspeak_bridge',
            bridgeQuestion: state.content!.interviewBridgeQuestion,
            role: profileRole,
            topicTag: state.content!.topicTag,
            practicedWords: state.content!.keyVocab,
            recentScores: {
              clarity:   state.score!.clarity,
              pacing:    state.score!.pacing,
              rhythm:    state.score!.rhythm,
              composite: state.score!.composite,
            },
          };
          onInterviewBridge(payload);
        }}
        onDecline={() => dispatch({ type: 'COMPLETE' })}
      />
    );
  }

  if (state.phase === 'complete') {
    if (!showFeedback) {
      void csTrack('session_completed', sessionId, {
        composite: state.score?.composite,
        clarity: state.score?.clarity,
        pacing: state.score?.pacing,
        rhythm: state.score?.rhythm,
        retryUsed,
      });
    }
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-6 text-center shadow-2xl backdrop-blur-xl animate-in fade-in duration-500 sm:p-10">
        <div className="w-16 h-16 mb-5 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
          <span className="text-3xl">🎉</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Great Delivery Practice!</h2>
        <p className="text-brand-tint mb-8 text-sm sm:text-base leading-relaxed">
          Consistent daily practice builds confident interview presence.
        </p>

        {!showFeedback ? (
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={handleNextPassage}
              className="w-full rounded-xl bg-brand-primary py-3.5 font-bold text-brand-dark hover:brightness-110 shadow-lg shadow-brand-primary/20 transition-all"
            >
              Practice Another Passage ↻
            </button>
            <button
              onClick={() => onComplete(state.content?.topicTag)}
              className="w-full rounded-xl border border-white/20 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              ClearSpeak Home
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              className="text-xs text-brand-tint hover:text-white transition-colors mt-2"
            >
              Give feedback on this session
            </button>
          </div>
        ) : (
          <div className="w-full text-left animate-in slide-in-from-bottom-4 duration-300">
            <BetaFeedback
              sessionId={sessionId}
              retryWasUsed={retryUsed}
              onDone={() => onComplete(state.content?.topicTag)}
            />
          </div>
        )}
      </div>
    );
  }

  return null;
};

// ─── Sub-views ────────────────────────────────────────────────────────────────

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const VocabWarmup: React.FC<{
  vocab: string[];
  onReady: () => void;
  onWordClick: (word: string) => void;
  activeWord: string | null;
}> = ({ vocab, onReady, onWordClick, activeWord }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-6 duration-500 sm:p-8">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">Warmup Drill</span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
          Key Vocabulary
        </h2>
        <p className="text-xs sm:text-sm text-brand-tint mt-1">Tap each word to hear clean pronunciation before reading the passage.</p>
      </div>
      <button
        type="button"
        onClick={onReady}
        className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-brand-tint hover:text-white hover:bg-white/10 transition-colors"
      >
        Skip Warmup →
      </button>
    </header>

    <ul className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {vocab.map(v => {
        const clean = v.toLowerCase().replace(/[^a-z]/g, '');
        const isSpeaking = activeWord === clean;
        return (
          <li
            key={v}
            className={`relative flex items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all ${
              isSpeaking
                ? 'bg-brand-primary/15 border-brand-primary ring-2 ring-brand-primary/40'
                : 'bg-black/30 border-white/10 hover:border-brand-primary/30'
            }`}
          >
            <span className="text-xl font-bold text-white tracking-wide">{v}</span>
            <button
              type="button"
              onClick={() => onWordClick(v)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                isSpeaking
                  ? 'bg-brand-primary text-brand-dark border-brand-primary'
                  : 'bg-white/5 hover:bg-white/15 text-brand-primary border-white/10'
              }`}
              title={`Listen to "${v}"`}
            >
              <span className="text-sm">🔊</span>
            </button>
          </li>
        );
      })}
    </ul>

    <button
      id="cs-warmup-ready"
      onClick={onReady}
      className="w-full rounded-2xl bg-brand-primary py-4 font-bold text-brand-dark shadow-lg shadow-brand-primary/20 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
    >
      <span>I'm Ready — Start Reading</span>
      <span>→</span>
    </button>
  </div>
);

const GuidedReadAndRecordView: React.FC<{
  content: ClearSpeakSessionContent;
  recorder: ReturnType<typeof useAudioRecorder>;
  previewUrl: string;
  activeWord: string | null;
  isPlayingCoach: boolean;
  elapsedSeconds: number;
  onWordClick: (word: string) => void;
  onPlayCoach: (slow: boolean) => void;
  onStopCoach: () => void;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  onDiscardRecording: () => void;
  onSubmitRecording: () => void;
  onSkipPassage: () => void;
}> = ({
  content,
  recorder,
  previewUrl,
  activeWord,
  isPlayingCoach,
  elapsedSeconds,
  onWordClick,
  onPlayCoach,
  onStopCoach,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onDiscardRecording,
  onSubmitRecording,
  onSkipPassage,
}) => {
  const isRecording = recorder.state === 'recording';
  const isPaused = recorder.state === 'paused';
  const hasPreview = Boolean(previewUrl && recorder.audioBlob && recorder.state === 'preview_ready');

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col rounded-3xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl animate-in fade-in duration-500 sm:p-8">
      {/* Header Context */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">
            Spoken Delivery Practice
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-0.5">Read Aloud</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-primary/10 border border-brand-primary/20 px-3 py-1 text-xs font-semibold text-brand-primary">
            Focus: {content.targetSkill}
          </span>
          <button
            type="button"
            onClick={onSkipPassage}
            disabled={isRecording || isPaused}
            className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold text-brand-tint hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            Next Passage ↻
          </button>
        </div>
      </header>

      {/* Coach Hint */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/30 border border-white/5 px-4 py-2.5 text-xs text-brand-tint">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold">💡 Tip:</span>
          <span>Tap any word to hear its pronunciation. Bold words carry natural phrase stress.</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-300">
          <span className="flex items-center gap-1">
            <span className="text-emerald-400 font-bold">Aa</span> Stress
          </span>
          <span className="flex items-center gap-1">
            <span className="text-amber-300">⏸</span> Pause
          </span>
        </div>
      </div>

      {/* Target Passage */}
      <div className="mb-5 min-h-[160px] rounded-2xl border border-white/10 bg-black/40 p-5 shadow-inner">
        <PassageRenderer
          tokens={content.passageData}
          onWordClick={onWordClick}
          activeWord={activeWord}
        />
      </div>

      {/* Coach Reference Voiceover Controls */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-300">Coach Reference Audio</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPlayCoach(false)}
              disabled={isPlayingCoach || isRecording}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
            >
              <span>{isPlayingCoach ? '🔊 Speaking…' : '🔊 Listen Normal'}</span>
            </button>
            <button
              type="button"
              onClick={() => onPlayCoach(true)}
              disabled={isPlayingCoach || isRecording}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
            >
              <span>🐢 Slow Rhythm (0.8x)</span>
            </button>
            {isPlayingCoach && (
              <button
                type="button"
                onClick={onStopCoach}
                className="rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold"
              >
                ⏹ Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recording Workflow Area */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
        {!isRecording && !isPaused && !hasPreview && (
          <div className="flex flex-col items-center justify-center text-center gap-4 py-2">
            <button
              id="cs-start-recording"
              onClick={onStartRecording}
              disabled={recorder.state === 'requesting_permission'}
              className="px-10 py-4 bg-brand-primary hover:brightness-110 text-brand-dark font-extrabold text-base rounded-2xl shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-3 transform hover:scale-102 active:scale-98 cursor-pointer"
            >
              <span className="text-xl">🎤</span>
              <span>{recorder.state === 'requesting_permission' ? 'Requesting microphone…' : 'Start Speaking'}</span>
            </button>
            <p className="text-xs text-brand-tint">
              Read at a calm, natural pace. Pauses are automatically measured for rhythm feedback.
            </p>
          </div>
        )}

        {(isRecording || isPaused) && (
          <div className="flex flex-col items-center gap-5 py-2">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-3.5 w-3.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
              <span className="font-mono text-xl font-bold text-white">
                {formatDuration(elapsedSeconds)} <span className="text-xs text-brand-tint">/ 02:00</span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-tint ml-2">
                {isPaused ? '⏸ Paused' : 'Listening…'}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {isRecording ? (
                <button
                  type="button"
                  onClick={onPauseRecording}
                  className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-3 text-sm font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors flex items-center gap-2"
                >
                  <span>⏸</span>
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onResumeRecording}
                  className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-5 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors flex items-center gap-2"
                >
                  <span>▶</span>
                  <span>Resume</span>
                </button>
              )}

              <button
                id="cs-stop-recording"
                type="button"
                onClick={onStopRecording}
                className="rounded-xl bg-brand-primary px-7 py-3 font-bold text-brand-dark hover:brightness-110 shadow-md shadow-brand-primary/20 transition-all flex items-center gap-2"
              >
                <span>⏹</span>
                <span>Done, Review Recording</span>
              </button>

              <button
                type="button"
                onClick={onDiscardRecording}
                className="rounded-xl border border-white/20 px-4 py-3 text-xs font-semibold text-brand-tint hover:text-white hover:bg-white/10 transition-colors"
              >
                ✕ Discard
              </button>
            </div>
          </div>
        )}

        {hasPreview && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span>✓</span> Recording Captured
              </span>
              <span className="text-xs text-brand-tint">Listen back before submitting</span>
            </div>

            <audio controls src={previewUrl} className="w-full" aria-label="Preview your recording" />

            <div className="flex flex-wrap items-center gap-3 mt-1">
              <button
                type="button"
                onClick={onSubmitRecording}
                className="flex-1 rounded-xl bg-brand-primary py-3.5 px-6 font-bold text-brand-dark hover:brightness-110 shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2"
              >
                <span>Evaluate Delivery & Pacing ✨</span>
              </button>

              <button
                type="button"
                onClick={onDiscardRecording}
                className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                ↺ Record Again
              </button>
            </div>
          </div>
        )}

        {recorder.errorMessage && (
          <p role="alert" className="mt-3 text-xs text-red-300 text-center">
            {recorder.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
};

const ScoreCard: React.FC<{
  score: ClearSpeakSessionScore;
  progress: ClearSpeakProgress | null;
  recordedAudioUrl?: string | null;
  onRetry?: () => void;
  onNextPassage: () => void;
  onContinue: () => void;
}> = ({ score, progress, recordedAudioUrl, onRetry, onNextPassage, onContinue }) => {
  const isHigh = score.composite >= 80;
  const isMedium = score.composite >= 65 && score.composite < 80;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-500">
      {/* Top Banner */}
      <div className="p-6 sm:p-10 flex flex-col items-center text-center border-b border-white/10 relative bg-gradient-to-b from-white/[0.04] to-transparent">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-3 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <span>{isHigh ? '🌟 Outstanding Delivery' : isMedium ? '👍 Solid Delivery' : '🎯 Practice Focus'}</span>
        </span>

        <h2 className="text-lg sm:text-xl font-bold text-white/70 uppercase tracking-widest">
          Speaking Delivery Score
        </h2>

        <div className="text-6xl sm:text-7xl font-black text-brand-primary my-2 drop-shadow-xl">
          {score.composite}<span className="text-2xl text-brand-tint">/100</span>
        </div>

        {progress && (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-black/40 rounded-full border border-white/10 text-xs">
            <span className="text-orange-400">🔥</span>
            <span className="font-semibold text-white/90">{progress.streak}-day streak</span>
          </div>
        )}
      </div>

      <div className="p-6 sm:p-8 flex flex-col gap-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] font-bold text-brand-tint uppercase tracking-wider mb-1">
              Transcript Match
            </span>
            <span className="text-2xl font-bold text-white">{score.clarity}%</span>
            <span className="text-[11px] text-emerald-400 mt-0.5 font-medium">
              {score.clarity >= 90 ? '✓ Crisp enunciation' : score.clarity >= 75 ? 'Good word accuracy' : 'Check tricky words'}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] font-bold text-brand-tint uppercase tracking-wider mb-1">
              Speaking Pace
            </span>
            <span className="text-2xl font-bold text-white">{score.pacing}%</span>
            <span className="text-[11px] text-brand-tint mt-0.5 font-medium">
              {score.measuredWpm ? `${score.measuredWpm} WPM • ${score.pacing >= 85 ? '🎯 Sweet spot' : score.measuredWpm > 140 ? '⚡ Brisk' : '🐢 Measured'}` : 'Optimal tempo'}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] font-bold text-brand-tint uppercase tracking-wider mb-1">
              Pause Adherence
            </span>
            <span className="text-2xl font-bold text-white">{score.rhythm}%</span>
            <span className="text-[11px] text-amber-300 mt-0.5 font-medium">
              {score.rhythm >= 80 ? '✓ Natural phrasing' : score.rhythm >= 60 ? 'Developing cadence' : 'Practice pauses (⏸)'}
            </span>
          </div>
        </div>

        {/* Listen Back Player */}
        {recordedAudioUrl && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <span className="text-xs font-semibold text-brand-tint block mb-2">
              🎧 Listen to your evaluated recording:
            </span>
            <audio controls src={recordedAudioUrl} className="w-full" />
          </div>
        )}

        {/* Coach Advice */}
        <div className="p-5 bg-gradient-to-r from-brand-primary/10 via-brand-primary/5 to-transparent border-l-4 border-brand-primary rounded-2xl border border-white/10 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center gap-2">
              <span className="text-base">🎓</span>
              <span>Executive Speech Coach Insights</span>
            </h3>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
              Personalized Feedback
            </span>
          </div>
          <p className="text-slate-200 text-sm leading-relaxed font-normal">
            {score.feedbackTip}
          </p>
        </div>

        <p className="text-xs text-brand-tint leading-relaxed">
          This scoring measures transcript alignment, speaking pace, and breath pauses. Raw audio stays strictly memory-only.
        </p>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onNextPassage}
            className="flex-1 rounded-xl bg-brand-primary py-3.5 px-5 font-bold text-brand-dark hover:brightness-110 shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2"
          >
            <span>Practice Another Passage ↻</span>
          </button>

          {onRetry && (
            <button
              id="cs-retry"
              type="button"
              onClick={onRetry}
              className="rounded-xl border border-white/20 py-3.5 px-5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Fix Tricky Sentence
            </button>
          )}

          <button
            id="cs-continue"
            type="button"
            onClick={onContinue}
            className="rounded-xl border border-white/20 py-3.5 px-5 text-sm font-semibold text-brand-tint hover:text-white hover:bg-white/10 transition-colors"
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
};

const RetryView: React.FC<{
  sentence: string;
  recorder: ReturnType<typeof useAudioRecorder>;
  previewUrl: string;
  activeWord: string | null;
  isPlayingCoach: boolean;
  onWordClick: (word: string) => void;
  onPlayCoach: (slow: boolean) => void;
  onStopCoach: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({
  sentence,
  recorder,
  previewUrl,
  activeWord,
  isPlayingCoach,
  onWordClick,
  onPlayCoach,
  onStopCoach,
  onSubmit,
  onCancel,
}) => {
  const words = sentence.split(/\s+/).filter(Boolean);
  const isRecording = recorder.state === 'recording';
  const hasPreview = Boolean(previewUrl && recorder.audioBlob && recorder.state === 'preview_ready');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-brand-primary/30 bg-slate-900/90 p-6 text-center shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-6 duration-500 sm:p-10">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Targeted Sentence Fix</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-brand-tint hover:text-white transition-colors"
        >
          ← Back
        </button>
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">Let's refine this sentence</h2>
      <p className="text-xs text-brand-tint mb-6">Tap words to hear pronunciation, listen to the coach, then speak.</p>

      {/* Interactive Sentence Card */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 p-6 flex flex-wrap items-center justify-center gap-1.5 leading-relaxed">
        {words.map((w, idx) => {
          const clean = w.toLowerCase().replace(/[^a-z]/g, '');
          const isSpeaking = activeWord === clean;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onWordClick(w)}
              className={`rounded px-1.5 py-0.5 text-lg font-medium transition-all ${
                isSpeaking
                  ? 'bg-brand-primary text-brand-dark font-bold scale-105 ring-2 ring-brand-primary'
                  : 'text-white hover:bg-white/10 hover:text-brand-primary'
              }`}
            >
              {w}
            </button>
          );
        })}
      </div>

      {/* Audio Reference */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => onPlayCoach(false)}
          disabled={isPlayingCoach || isRecording}
          className="rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold"
        >
          {isPlayingCoach ? '🔊 Playing…' : '🔊 Listen Normal'}
        </button>
        <button
          type="button"
          onClick={() => onPlayCoach(true)}
          disabled={isPlayingCoach || isRecording}
          className="rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold"
        >
          🐢 Slow Rhythm (0.8x)
        </button>
        {isPlayingCoach && (
          <button
            type="button"
            onClick={onStopCoach}
            className="rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-1.5 text-xs font-semibold"
          >
            ⏹ Stop
          </button>
        )}
      </div>

      {/* Recording Area */}
      {!isRecording && !hasPreview && (
        <button
          id="cs-retry-record"
          onClick={async () => {
            onStopCoach();
            try {
              await recorder.startRecording();
            } catch (err: any) {
              alert(err.message);
            }
          }}
          className="w-full sm:w-auto self-center px-10 py-4 bg-brand-primary hover:brightness-110 text-brand-dark font-bold text-base rounded-2xl shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-2"
        >
          <span>🎤</span>
          <span>Start Speaking Again</span>
        </button>
      )}

      {isRecording && (
        <button
          id="cs-retry-stop"
          onClick={() => recorder.stopRecording()}
          className="w-full sm:w-auto self-center px-10 py-4 bg-red-500 hover:bg-red-600 text-white font-bold text-base rounded-2xl shadow-lg transition-all flex items-center gap-2 animate-pulse"
        >
          <span>⏹</span>
          <span>Done Recording</span>
        </button>
      )}

      {hasPreview && (
        <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-2">
            <button
              onClick={onSubmit}
              className="flex-1 rounded-xl bg-brand-primary py-3 font-bold text-brand-dark hover:brightness-110 shadow-md"
            >
              Evaluate Fix ✨
            </button>
            <button
              onClick={() => recorder.clearAudio()}
              className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold hover:bg-white/10"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const BridgePrompt: React.FC<{
  question: string;
  topicTag: string;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ question, topicTag, onAccept, onDecline }) => (
  <div className="relative mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-brand-primary/20 bg-slate-900/90 p-6 shadow-2xl animate-in zoom-in-95 duration-700 sm:p-10">
    <div className="flex flex-col items-center text-center mb-8 z-10">
      <div className="px-3.5 py-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-bold uppercase tracking-wider rounded-full mb-4">
        Ready for live interview test
      </div>
      <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">Test in Mock Interview</h2>
      <p className="text-sm sm:text-base text-brand-tint max-w-lg leading-relaxed">
        Your delivery and pause timing around <strong className="text-white">"{topicTag}"</strong> is consistent. Want to practice an interview question on it?
      </p>
    </div>

    <blockquote className="relative bg-black/40 p-6 sm:p-8 rounded-2xl border border-white/10 mb-8 z-10 text-center">
      <p className="text-lg sm:text-xl text-white/95 font-medium italic relative z-10">
        "{question}"
      </p>
    </blockquote>

    <div className="flex flex-col sm:flex-row gap-3 z-10">
      <button
        id="cs-bridge-decline"
        onClick={onDecline}
        className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all border border-white/10 text-sm"
      >
        Not Now
      </button>
      <button
        id="cs-bridge-accept"
        onClick={onAccept}
        className="flex-[2] py-3.5 bg-brand-primary hover:brightness-110 text-brand-dark font-bold rounded-xl shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 text-sm"
      >
        <span>Practice this question →</span>
      </button>
    </div>
  </div>
);

export default ClearSpeakSession;
