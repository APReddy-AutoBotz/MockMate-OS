// @ts-nocheck
/**
 * components/clearspeak/ClearSpeakSession.tsx
 * Mockmate ClearSpeak — main session orchestrator.
 *
 * Implements the screen-by-screen UX flow from implementation_plan.md §12:
 *   idle → vocab_warmup → guided_read → recording → processing
 *       → score_card → [retry?] → [bridge_prompt?] → complete
 *
 * One job per phase. No conversational AI. No avatar. No grammar module.
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  ClearSpeakPhase,
  ClearSpeakSessionContent,
  ClearSpeakSessionScore,
  ClearSpeakProgress,
  BridgeTriggerState,
  ClearSpeakBridgePayload,
} from './types';
import { generateSession, scoreSession, LowConfidenceError } from '../../services/clearSpeakService';
import { csTrack, newSessionId } from '../../services/csAnalytics';
import { useAudioRecorder } from './useAudioRecorder';
import PassageRenderer from './PassageRenderer';
import BetaFeedback from './BetaFeedback';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClearSpeakSessionProps {
  /**
   * Called when bridge trigger fires — navigates to Mockmate Interview.
   * Carries the full structured bridge payload (contract: ClearSpeakBridgePayload).
   */
  onInterviewBridge: (payload: ClearSpeakBridgePayload) => void;
  /** Called when session fully completes */
  onComplete: (topicTag?: string) => void;
  /** Recent topic tags to enforce content freshness */
  recentTopics?: string[];
  /** Number of sessions attempted in the current UI session to toggle hybrid generation */
  sessionAttemptLength?: number;
  /**
   * The user's ClearSpeak role — passed from dashboard profile state.
   * Used to populate the bridge payload role field correctly.
   */
  profileRole: import('./types').ClearSpeakRole;
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
  onComplete,
  recentTopics = [],
  sessionAttemptLength = 0,
  profileRole,
}) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const recorder = useAudioRecorder();

  // Per-session analytics ID — generated once on mount, not persisted
  const sessionId = useRef(newSessionId()).current;
  // Track whether retry was used in this session (for feedback widget Q3)
  const [retryUsed, setRetryUsed] = useState(false);
  // Track whether feedback widget is showing
  const [showFeedback, setShowFeedback] = useState(false);

  // ── Load content on mount ──
  useEffect(() => {
    (async () => {
      try {
        const content = await generateSession(recentTopics, sessionAttemptLength);
        dispatch({ type: 'CONTENT_LOADED', content });
        // ANALYTICS: session_started — fires after content is available
        void csTrack('session_started', sessionId, {
          topicTag: content.topicTag,
          difficultyLevel: content.difficultyLevel,
          // isFallback is not detectable client-side; backend logs it separately
        });
      } catch (err: any) {
        dispatch({ type: 'ERROR', message: err.message || 'Failed to load practice content.' });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit recording for scoring ──
  const handleSubmitRecording = useCallback(async (isRetryAttempt: boolean) => {
    if (!recorder.audioBlob || !state.content) return;

    dispatch({ type: 'START_PROCESSING' });

    try {
      const { score, progress, bridgeTrigger } = await scoreSession({
        audioBlob: recorder.audioBlob,
        content: state.content,
        retryAttempted: isRetryAttempt,
      });

      // Clear blob from memory — privacy policy
      recorder.clearAudio();

      // Low-confidence guard: if the composite is extremely low (≤ 15),
      // the transcription likely failed (empty audio, mic error, background noise).
      if (score.composite <= 15 && score.clarity === 0) {
        // ANALYTICS: low_confidence_error (frontend guard)
        void csTrack('low_confidence_error', sessionId, { errorSource: 'frontend_guard' });
        dispatch({
          type: 'ERROR',
          message: "We couldn't clearly hear your recording. Please check your microphone and try again.",
        });
        return;
      }

      // ANALYTICS: score_feedback_viewed — fires when score card is about to render
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
        // ANALYTICS: low_confidence_error (route 422)
        void csTrack('low_confidence_error', sessionId, { errorSource: 'route_422' });
        dispatch({ type: 'ERROR', message: err.message });
      } else {
        dispatch({ type: 'ERROR', message: err.message || 'Scoring failed. Please try again.' });
      }
    }
  }, [recorder, state.content, sessionId]);

  // ── Safeguard: Catch async recorder errors after phase transitions ──
  useEffect(() => {
    if ((state.phase === 'recording' || state.phase === 'retry') && recorder.state === 'error') {
      dispatch({ type: 'ERROR', message: recorder.errorMessage || 'Recording failed. Please check microphone permissions.' });
    }
  }, [state.phase, recorder.state, recorder.errorMessage]);

  // Handle successful recording completion safely
  useEffect(() => {
    if (state.phase === 'recording' && recorder.state === 'stopped' && recorder.audioBlob) {
      handleSubmitRecording(false);
    } else if (state.phase === 'retry' && recorder.state === 'stopped' && recorder.audioBlob) {
      handleSubmitRecording(true);
    }
  }, [state.phase, recorder.state, recorder.audioBlob, handleSubmitRecording]);

  // ── Phase Renders ──────────────────────────────────────────────────────────

  if (state.phase === 'idle') {
    return (
      <div className="flex min-h-[55dvh] w-full items-center justify-center animate-in fade-in duration-500">
        {state.error ? (
          <div className="flex flex-col items-center gap-6 p-8 bg-red-500/10 border border-red-500/20 rounded-2xl max-w-lg text-center">
            <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-red-400 text-lg font-medium">{state.error}</p>
            {state.content && (
              <button
                id="cs-error-retry"
                onClick={() => dispatch({ type: 'START_READ' })}
                className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold rounded-xl transition-colors"
              >
                Try Again
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
      />
    );
  }

    if (state.phase === 'guided_read' && state.content) {
      return (
        <GuidedRead
          content={state.content}
          onStartRecording={async () => {
            try {
              await recorder.startRecording();
              dispatch({ type: 'START_RECORDING' });
            } catch (err: any) {
              dispatch({ type: 'ERROR', message: err.message });
            }
          }}
        />
      );
    }

  if (state.phase === 'recording' && state.content) {
    return (
      <RecordingView
        content={state.content}
        recorderState={recorder.state}
        onStop={() => {
          recorder.stopRecording();
        }}
      />
    );
  }

  if (state.phase === 'processing') {
    return (
      <div className="flex min-h-[55dvh] w-full flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
        <div className="w-32 h-32 relative flex items-center justify-center mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-brand-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-brand-primary border-r-brand-primary/60 border-b-transparent border-l-transparent animate-spin"></div>
          <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
        </div>
        <p className="text-xl font-bold text-white mb-2">Checking your speaking...</p>
        <span className="text-sm uppercase tracking-widest text-brand-primary/70">Clear is better than fast</span>
      </div>
    );
  }

  if (state.phase === 'score_card' && state.score && state.content) {
    const shouldRetry = state.score.composite < 70 && !state.isRetry;
    return (
      <ScoreCard
        score={state.score}
        progress={state.progress}
        onRetry={shouldRetry ? () => {
          // ANALYTICS: retry_used
          void csTrack('retry_used', sessionId, { firstComposite: state.score!.composite });
          setRetryUsed(true);
          dispatch({ type: 'TRIGGER_RETRY' });
        } : undefined}
        onContinue={() => {
          if (state.bridgeTrigger?.shouldSurface) {
            // ANALYTICS: bridge_triggered
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
        onSubmit={() => handleSubmitRecording(true)}
      />
    );
  }

  if (state.phase === 'bridge_prompt' && state.content && state.score) {
    return (
      <BridgePrompt
        question={state.content.interviewBridgeQuestion}
        topicTag={state.content.topicTag}
        onAccept={() => {
          // ANALYTICS: bridge_entered
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
    // ANALYTICS: session_completed — fires once, on first render of complete phase
    // Using showFeedback state change as the trigger guard
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
      <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-[22px] border border-white/10 bg-brand-dark/85 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in duration-500 sm:rounded-[2rem] sm:p-12">
        <div className="w-20 h-20 mb-6 bg-brand-primary/10 rounded-full flex items-center justify-center">
          <span className="text-4xl">🎉</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">Great session!</h2>
        <p className="text-white/70 mb-10 text-lg">Keep the streak going.</p>
        
        {!showFeedback ? (
          <button 
            onClick={() => setShowFeedback(true)}
            className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10 w-full"
          >
            Back to Home
          </button>
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

// ─── Sub-views (styled) ────────────────────────────────────────────────────────

const playAudio = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.85; // Slower for clarity
    window.speechSynthesis.speak(utterance);
  }
};

const VocabWarmup: React.FC<{ vocab: string[]; onReady: () => void }> = ({ vocab, onReady }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col rounded-[22px] border border-white/10 bg-brand-dark/85 p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in slide-in-from-bottom-8 duration-500 sm:rounded-[2rem] sm:p-10">
    <header className="mb-6 text-center sm:mb-8">
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
        Warm Up — Key Words
      </h2>
      <p className="text-white/60">Listen and repeat each word before we begin.</p>
    </header>
    
    <ul className="mb-8 grid grid-cols-1 gap-3 sm:mb-10 sm:grid-cols-2 sm:gap-4">
      {vocab.map(v => (
        <li key={v} className="relative flex flex-col items-center justify-center p-6 bg-black/40 rounded-xl border border-white/5 group hover:border-brand-primary/30 transition-all">
          <span className="text-2xl font-bold text-white/90 group-hover:text-white transition-colors">{v}</span>
          <button
            onClick={() => playAudio(v)}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/5 hover:bg-brand-primary/15 text-brand-primary shadow-lg transition-colors cursor-pointer"
            title="Listen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6 10h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 001.707-.707V8a1 1 0 00-1.707-.707L9.293 3.879A1 1 0 008.586 3.5H6a2 2 0 00-2 2v13a2 2 0 002 2z" /></svg>
          </button>
        </li>
      ))}
    </ul>
    
    <button 
      id="cs-warmup-ready" 
      onClick={onReady}
      className="w-full rounded-xl bg-brand-primary py-4 font-bold text-brand-dark shadow-[0_0_20px_rgba(255,188,3,0.22)] transition-all hover:bg-brand-primary/90"
    >
      I'm Ready — Start Reading
    </button>
  </div>
);

const GuidedRead: React.FC<{
  content: ClearSpeakSessionContent;
  onStartRecording: () => void;
}> = ({ content, onStartRecording }) => (
  <div className="mx-auto flex w-full max-w-4xl flex-col rounded-[22px] border border-white/10 bg-brand-dark/85 p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in duration-500 sm:rounded-[2rem] sm:p-8 md:p-12">
    <header className="mb-6 flex flex-col items-start justify-between gap-4 border-b border-white/10 pb-5 sm:mb-8 sm:flex-row sm:items-center sm:pb-6">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Read Aloud</h2>
      <div className="px-4 py-2 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
        <span className="text-brand-primary text-xs font-bold uppercase tracking-widest">Practicing: {content.targetSkill}</span>
      </div>
    </header>
    
    <div className="mb-4 min-h-[150px] rounded-xl border border-white/5 bg-black/30 p-4 shadow-inner sm:p-8">
      <PassageRenderer tokens={content.passageData} />
    </div>
    
    <div className="mb-8 flex flex-col items-center justify-between gap-4 px-0 sm:mb-10 sm:flex-row sm:px-4">
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wider text-white/50 sm:gap-4">
        <span className="flex items-center gap-1"><span className="text-brand-primary font-bold text-base">Aa</span> Stress</span>
        <span className="flex items-center gap-1"><span className="text-white/70 font-bold text-base">/</span> Pause</span>
        <span className="flex items-center gap-1"><span className="text-white/70 font-bold text-base">//</span> Breathe</span>
      </div>
      
      <button
        onClick={() => playAudio(content.passageData.map(t => t.text).join(' '))}
        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-full border border-white/10 transition-all flex items-center gap-2 cursor-pointer"
      >
        <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6 10h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 001.707-.707V8a1 1 0 00-1.707-.707L9.293 3.879A1 1 0 008.586 3.5H6a2 2 0 00-2 2v13a2 2 0 002 2z" /></svg>
        Hear First
      </button>
    </div>
    
    <button  
      id="cs-start-recording" 
      onClick={onStartRecording}
      className="w-full sm:w-auto self-center px-12 py-5 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-extrabold text-lg rounded-full shadow-[0_0_30px_rgba(255,188,3,0.22)] transition-all flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95"
    >
      <div className="w-4 h-4 bg-brand-dark rounded-full"></div>
      Start speaking
    </button>
  </div>
);

const RecordingView: React.FC<{
  content: ClearSpeakSessionContent;
  recorderState: string;
  onStop: () => void;
}> = ({ content, recorderState, onStop }) => (
  <div className="mx-auto flex w-full max-w-4xl flex-col rounded-[22px] border border-brand-primary/20 bg-brand-dark/85 p-5 shadow-[0_0_50px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in fade-in duration-300 sm:rounded-[2rem] sm:p-8 md:p-12">
    <header className="mb-6 flex flex-col items-start justify-between gap-3 border-b border-white/10 pb-5 sm:mb-8 sm:flex-row sm:items-center sm:pb-6">
      <div className="flex items-center gap-3">
        {recorderState === 'recording' ? (
          <>
            <div className="w-4 h-4 bg-brand-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(255,188,3,0.75)]"></div>
            <span className="text-brand-primary font-bold tracking-widest uppercase">Listening...</span>
          </>
        ) : (
          <span className="text-white/50 font-bold tracking-widest uppercase">Preparing...</span>
        )}
      </div>
      <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] animate-pulse">
        There is no timer. Take your time.
      </div>
    </header>
    
    <div className="mb-8 min-h-[150px] rounded-xl border border-white/5 bg-black/30 p-4 shadow-inner sm:mb-10 sm:p-8">
      <PassageRenderer tokens={content.passageData} />
    </div>
    
    <div className="flex items-center justify-center relative">
      {/* Audio waves visualizer fake effect */}
      <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-20 pointer-events-none">
        {[1,2,3,4,5,6,7,8,9,10].map(i => (
          <div key={i} className="w-1 bg-brand-primary rounded-full animate-pulse" style={{ height: `${Math.max(10, Math.random() * 40)}px`, animationDelay: `${i * 0.1}s` }}></div>
        ))}
      </div>
      
      <button 
        id="cs-stop-recording" 
        onClick={onStop} 
        disabled={recorderState !== 'recording'}
        className="relative z-10 w-full sm:w-auto self-center px-12 py-5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-lg rounded-full transition-all flex items-center justify-center gap-3 backdrop-blur-md"
      >
        <div className="w-4 h-4 bg-white rounded-sm"></div>
        Done, show my score
      </button>
    </div>
  </div>
);

const ScoreCard: React.FC<{
  score: ClearSpeakSessionScore;
  progress: ClearSpeakProgress | null;
  onRetry?: () => void;
  onContinue: () => void;
}> = ({ score, progress, onRetry, onContinue }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-white/10 bg-brand-dark/90 shadow-[0_0_50px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in zoom-in-95 duration-500 sm:rounded-[2rem]">
    <div className="p-8 sm:p-12 flex flex-col items-center text-center border-b border-white/5 relative">
      
      <h2 className="text-xl sm:text-2xl font-bold text-white/70 mb-4 z-10 uppercase tracking-widest">Speaking score</h2>
      <div className="text-7xl sm:text-8xl font-black text-white bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 mb-6 z-10 drop-shadow-2xl">
        {score.composite}
      </div>
      {progress && (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/40 rounded-full border border-white/10 z-10">
          <span className="text-orange-500">🔥</span>
          <span className="text-sm font-bold text-white/90">{progress.streak}-day habit</span>
        </div>
      )}
    </div>

    <div className="p-8 sm:p-10 flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          {l: 'Clarity', v: score.clarity}, 
          {l: 'Calmness', v: score.pacing}, 
          {l: 'Flow', v: score.rhythm}
        ].map(p => (
          <div key={p.l} className="flex flex-col items-center p-4 bg-white/5 rounded-xl border border-white/5 group hover:border-brand-primary/20 transition-all">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 text-center leading-tight h-6 flex items-center">{p.l}</span>
            <span className={`text-2xl sm:text-3xl font-bold ${p.v >= 80 ? 'text-brand-primary' : 'text-amber-400'}`}>{p.v}</span>
          </div>
        ))}
      </div>
      
      {score.hardWordBonus > 0 && (
        <div className="w-full p-4 bg-brand-primary/10 border border-brand-primary/20 rounded-xl flex items-center justify-center gap-3 text-brand-primary font-bold text-sm">
          <span>✨</span> +{score.hardWordBonus} Confidence Bonus!
        </div>
      )}

      <div className="p-6 bg-white/5 border-l-4 border-brand-primary rounded-r-xl">
        <h3 className="text-[10px] font-bold text-brand-primary uppercase tracking-widest mb-2">Coach's advice</h3>
        <p className="text-white/80 leading-relaxed italic">"{score.feedbackTip}"</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-4">
        {onRetry && (
          <button 
            id="cs-retry" 
            onClick={onRetry}
            className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10"
          >
            Fix That Sentence
          </button>
        )}
        <button 
          id="cs-continue" 
          onClick={onContinue}
          className="flex-1 py-4 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold rounded-xl shadow-[0_0_20px_rgba(255,188,3,0.22)] transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
);

const RetryView: React.FC<{
  sentence: string;
  recorder: ReturnType<typeof useAudioRecorder>;
  onSubmit: () => void;
}> = ({ sentence, recorder, onSubmit }) => (
  <div className="mx-auto flex w-full max-w-3xl flex-col rounded-[22px] border border-brand-primary/20 bg-brand-dark/85 p-5 text-center shadow-[0_0_40px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in slide-in-from-bottom-8 duration-500 sm:rounded-[2rem] sm:p-10">
    <div className="w-16 h-16 bg-brand-primary/10 border border-brand-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
      <svg className="w-8 h-8 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
    </div>
    
    <h2 className="text-2xl font-extrabold text-white mb-6">Let's fix this one</h2>
    
    <div className="mb-8 rounded-xl border border-white/5 bg-black/40 p-5 sm:mb-10 sm:p-8">
      <p className="text-2xl text-white/90 leading-relaxed font-medium">"{sentence}"</p>
    </div>
    
    {recorder.state === 'idle' && (
      <button 
        id="cs-retry-record" 
        onClick={async () => {
          try {
            await recorder.startRecording();
          } catch (err: any) {
            alert(err.message);
          }
        }}
        className="w-full sm:w-auto self-center px-12 py-5 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-extrabold text-lg rounded-full shadow-[0_0_30px_rgba(255,188,3,0.22)] transition-all flex items-center gap-3 transform hover:scale-105 active:scale-95"
      >
        <div className="w-4 h-4 bg-brand-dark rounded-full"></div>
        Start speaking again
      </button>
    )}
    
    {recorder.state === 'recording' && (
      <button 
        id="cs-retry-stop" 
        onClick={() => recorder.stopRecording()}
        className="w-full sm:w-auto self-center px-12 py-5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-lg rounded-full transition-all flex items-center gap-3 backdrop-blur-md"
      >
        <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
        Done, send
      </button>
    )}
  </div>
);

const BridgePrompt: React.FC<{
  question: string;
  topicTag: string;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ question, topicTag, onAccept, onDecline }) => (
  <div className="relative mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-brand-primary/20 bg-brand-dark/90 p-6 shadow-[0_0_60px_rgba(0,0,0,0.45)] animate-in zoom-in-95 duration-700 sm:rounded-[2rem] sm:p-12">
    {/* Decorative background element */}
    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
      <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    </div>

    <div className="flex flex-col items-center text-center mb-10 z-10">
      <div className="px-4 py-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-bold uppercase tracking-widest rounded-full mb-6">
        Ready for interview practice
      </div>
      <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">You're Ready to Test This</h2>
      <p className="text-lg text-white/70 max-w-lg">
        You've been speaking clearly with high pacing marks around <strong className="text-white">"{topicTag}"</strong>. Want to answer a live interview question about it?
      </p>
    </div>
    
    <blockquote className="relative bg-black/40 p-8 sm:p-10 rounded-2xl border border-white/10 mb-10 z-10 text-center">
      <span className="absolute top-4 left-6 text-6xl text-white/10 font-serif leading-none">"</span>
      <p className="text-xl sm:text-2xl text-white/90 font-medium italic relative z-10">
        {question}
      </p>
      <span className="absolute bottom-[-1rem] right-6 text-6xl text-white/10 font-serif leading-none">"</span>
    </blockquote>
    
    <div className="flex flex-col sm:flex-row gap-4 z-10">
      <button 
        id="cs-bridge-decline" 
        onClick={onDecline}
        className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10"
      >
        Not Now
      </button>
      <button 
        id="cs-bridge-accept" 
        onClick={onAccept}
      className="flex-[2] py-4 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold rounded-xl shadow-[0_0_25px_rgba(255,188,3,0.22)] transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        Practice this question
      </button>
    </div>
  </div>
);

export default ClearSpeakSession;
