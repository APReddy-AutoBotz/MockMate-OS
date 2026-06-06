/**
 * components/clearspeak/BetaFeedback.tsx
 * Mockmate ClearSpeak — lightweight beta feedback widget.
 *
 * Shown after session_completed. Three yes/no questions only.
 * Feedback is sent fire-and-forget to /api/clearspeak/beta/feedback.
 * Not shown if user already submitted feedback for this session.
 *
 * Deferred (non-beta): richer open text, rating scale, sentiment tagging.
 */

import React, { useState } from 'react';
import { submitBetaFeedback } from '../../services/clearSpeakService';

interface FeedbackAnswers {
  scoreFair: boolean | null;
  feedbackHelpful: boolean | null;
  confidentAfterRetry: boolean | null;
}

interface BetaFeedbackProps {
  sessionId: string;
  /** Whether a retry was used in this session (controls third question visibility) */
  retryWasUsed: boolean;
  onDone: () => void;
}

const INITIAL: FeedbackAnswers = {
  scoreFair: null,
  feedbackHelpful: null,
  confidentAfterRetry: null,
};

const BetaFeedback: React.FC<BetaFeedbackProps> = ({ sessionId, retryWasUsed, onDone }) => {
  const [answers, setAnswers] = useState<FeedbackAnswers>(INITIAL);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof FeedbackAnswers, value: boolean) =>
    setAnswers(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    // Submit fire-and-forget — don't block user on network failure
    void submitBetaFeedback({
      sessionId,
      scoreFair: answers.scoreFair,
      feedbackHelpful: answers.feedbackHelpful,
      confidentAfterRetry: retryWasUsed ? answers.confidentAfterRetry : null,
    }).catch(() => {/* silently drop */});

    setSubmitted(true);
    setTimeout(onDone, 1200);
  };

  if (submitted) {
    return (
      <div id="cs-beta-feedback-thanks" className="p-8 text-center bg-brand-primary/10 border border-brand-primary/20 rounded-2xl animate-in zoom-in-95 duration-300">
        <p className="text-lg font-bold text-brand-primary flex items-center justify-center gap-2">
          <span>🙏</span> Thank you — your feedback helps us improve.
        </p>
      </div>
    );
  }

  return (
    <div id="cs-beta-feedback" className="mt-6 p-6 sm:p-8 bg-brand-dark/70 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl flex flex-col gap-2">
      <div className="text-xs font-bold text-brand-primary uppercase tracking-widest opacity-80 mb-4 flex items-center gap-2">
        <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></div>
        Beta Feedback · 3 quick questions
      </div>

      {/* Q1 */}
      <FeedbackQuestion
        id="cs-fb-score-fair"
        label="Was this score fair?"
        value={answers.scoreFair}
        onChange={v => set('scoreFair', v)}
      />

      {/* Q2 */}
      <FeedbackQuestion
        id="cs-fb-feedback-helpful"
        label="Was the feedback helpful?"
        value={answers.feedbackHelpful}
        onChange={v => set('feedbackHelpful', v)}
      />

      {/* Q3 — only shown when retry was used */}
      {retryWasUsed && (
        <FeedbackQuestion
          id="cs-fb-confident-retry"
          label="Did you feel more confident after retry?"
          value={answers.confidentAfterRetry}
          onChange={v => set('confidentAfterRetry', v)}
        />
      )}

      <div className="flex items-center gap-4 mt-6 pt-6 border-t border-white/5">
        <button
          id="cs-beta-feedback-submit"
          onClick={handleSubmit}
          disabled={answers.scoreFair === null || answers.feedbackHelpful === null}
          className="flex-[3] py-3 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale"
        >
          Send Feedback
        </button>
        <button
          id="cs-beta-feedback-skip"
          onClick={onDone}
          className="flex-1 py-3 bg-transparent hover:bg-white/5 text-white/50 hover:text-white/80 font-bold rounded-xl transition-all text-sm"
        >
          Skip
        </button>
      </div>
    </div>
  );
};

// ─── Inner: Yes/No question ───────────────────────────────────────────────────

const FeedbackQuestion: React.FC<{
  id: string;
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}> = ({ id, label, value, onChange }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-black/20 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
    <span className="text-sm font-medium text-white/90">{label}</span>
    <div className="flex gap-2">
      <button
        id={`${id}-yes`}
        onClick={() => onChange(true)}
        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${value === true ? 'bg-brand-primary text-brand-dark shadow-[0_0_15px_rgba(255,188,3,0.25)]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
      >
        Yes
      </button>
      <button
        id={`${id}-no`}
        onClick={() => onChange(false)}
        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${value === false ? 'bg-red-500/80 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
      >
        No
      </button>
    </div>
  </div>
);

export default BetaFeedback;
