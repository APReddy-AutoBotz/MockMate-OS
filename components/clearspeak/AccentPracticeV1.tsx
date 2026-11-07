import React, { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { AccentProfileV1, AccentScoreV1, PracticePromptV1 } from 'mockmate-shared';
import { AccentProfileV1Schema, AccentScoreV1Schema, PracticePromptV1Schema } from 'mockmate-shared';
import type { AccentScoreV2 } from 'mockmate-shared/accent-evidence';
import { AccentScoreV2Schema } from 'mockmate-shared/accent-evidence';
import { apiClient } from '../../services/apiClient';
import { useAudioRecorder } from './useAudioRecorder';
import { accentAudioService } from '../../services/accentAudioService';
import { getPhoneticTip } from './accentTips';
import {
  accentDimensionScoreLabel,
  accentHistoryEvidenceLabel,
  accentHistoryProvenanceLabel,
  accentResultHeading,
  accentResultIntro,
  type AccentAttemptScore,
} from './accentResultPresentation';

const AccentAttemptScoreSchema = z.union([AccentScoreV1Schema, AccentScoreV2Schema]);
const Catalog = z.object({
  contractVersion: z.literal('accent-profile-catalog.v1'),
  profiles: z.array(AccentProfileV1Schema),
  practiceModes: z.array(z.string()),
  fixture: z.literal(true),
  retention: z.literal('derived-results-only'),
  realSpeechScoringAvailable: z.boolean(),
}).strict();
const Prompt = z.object({
  prompt: PracticePromptV1Schema,
  scoringPolicyVersion: z.string(),
  fixture: z.literal(true),
}).strict();
const AdapterDescriptor = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unavailable'),
    adapterId: z.literal('scoring-unavailable-v1'),
  }).strict(),
  z.object({
    status: z.literal('authorized'),
    adapterId: z.string().min(1).max(80),
    adapterVersion: z.string().min(1).max(80),
  }).strict(),
]);
const Result = z.object({
  score: AccentAttemptScoreSchema,
  replayed: z.boolean(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  adapter: AdapterDescriptor,
  retention: z.literal('derived-results-only'),
}).strict().superRefine((value, ctx) => {
  if (value.score.contractVersion === 'accent-score.v2') {
    if (value.adapter.status !== 'authorized'
        || value.adapter.adapterId !== value.score.evidenceLineage.adapterId
        || value.adapter.adapterVersion !== value.score.evidenceLineage.adapterVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adapter'],
        message: 'Real-speech result adapter metadata must match evidence lineage',
      });
    }
  } else if (value.adapter.status !== 'unavailable') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['adapter'],
      message: 'Provider-unavailable V1 results cannot claim an authorized adapter',
    });
  }
});
const Disposition = z.object({
  status: z.enum(['pending', 'cancelled', 'committed', 'conflict', 'missing']),
  requestHash: z.string().nullish(),
  result: AccentAttemptScoreSchema.optional(),
}).strict();
const Authority = z.object({
  attemptId: z.string().uuid(),
  capability: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string(),
}).strict();
const History = z.object({
  attempts: z.array(z.object({
    attempt_id: z.string(),
    result: AccentAttemptScoreSchema,
    fixture: z.boolean(),
    evidenceProvenance: z.enum([
      'synthetic_fixture_scored',
      'user_recording_unscored',
      'user_recording_scored',
      'user_recording_evaluated_unscored',
    ]),
    evidenceStatus: z.record(z.string(), z.enum(['sufficient', 'limited', 'insufficient', 'unsupported'])),
    practiceMode: z.enum(['word', 'phrase', 'sentence_reading', 'free_response']),
    duration_ms: z.number(),
    mime_type: z.string(),
    created_at: z.string(),
  }).passthrough()).max(50),
  retention: z.literal('derived-results-only'),
}).strict();
type HistoryAttempt = z.infer<typeof History>['attempts'][number];
type DisplayDimension = {
  score: number | null;
  confidence: number;
  evidenceStatus: string;
  summary: string;
};

const modes = [
  ['word', 'Word'],
  ['phrase', 'Phrase'],
  ['sentence_reading', 'Sentence'],
  ['free_response', 'Free response'],
] as const;

export default function AccentPracticeV1({ onExit }: { onExit: () => void }) {
  const recorder = useAudioRecorder();
  const [profiles, setProfiles] = useState<AccentProfileV1[]>([]);
  const [profileId, setProfileId] = useState('en-GB-general-v1');
  const [mode, setMode] = useState<typeof modes[number][0]>('word');
  const [prompt, setPrompt] = useState<PracticePromptV1 | null>(null);
  const [policy, setPolicy] = useState('');
  const [score, setScore] = useState<AccentAttemptScore | null>(null);
  const [realSpeechScoringAvailable, setRealSpeechScoringAvailable] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = useMemo(
    () => recorder.audioBlob ? URL.createObjectURL(recorder.audioBlob) : '',
    [recorder.audioBlob],
  );
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const promptGeneration = useRef(0);
  const promptController = useRef<AbortController | null>(null);
  const uploadGeneration = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const uploadPayload = useRef<FormData | null>(null);
  const pendingSubmit = useRef<Promise<void> | null>(null);
  const attemptId = useRef<string | null>(null);
  const attemptGeneration = useRef<number | null>(null);
  const submissionCapability = useRef<string | null>(null);
  const capabilityExpiresAt = useRef<number | null>(null);
  const authorityRequest = useRef<Record<string, unknown> | null>(null);
  const practiceGeneration = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [promptRefresh, setPromptRefresh] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [history, setHistory] = useState<HistoryAttempt[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const historyGeneration = useRef(0);

  // Accent Workout Session State
  const [sessionLength, setSessionLength] = useState<number>(5);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [workoutScores, setWorkoutScores] = useState<Array<{ promptText: string; score: AccentAttemptScore; step: number }>>([]);
  const [workoutFinished, setWorkoutFinished] = useState<boolean>(false);
  const [isPlayingRef, setIsPlayingRef] = useState<boolean>(false);

  const phoneticTip = useMemo(() => {
    return prompt ? getPhoneticTip(prompt.displayText, profileId) : null;
  }, [prompt, profileId]);

  const playReferenceAudio = async (slow = false) => {
    if (!prompt) return;
    setIsPlayingRef(true);
    try {
      const locale = profileId.includes('GB') ? 'en-GB' : 'en-US';
      await accentAudioService.speak(prompt.displayText, {
        locale,
        rate: slow ? 0.75 : 0.95,
        pitch: 1.0,
      });
    } catch (e) {
      console.warn('Playback error', e);
    } finally {
      setIsPlayingRef(false);
    }
  };

  const stopReferenceAudio = () => {
    accentAudioService.stop();
    setIsPlayingRef(false);
  };

  useEffect(() => () => {
    accentAudioService.stop();
  }, []);

  const clearAttemptIdentity = (id?: string | null, generation?: number | null) => {
    if (id != null && attemptId.current !== id) return;
    if (generation != null && attemptGeneration.current !== generation) return;
    attemptId.current = null;
    attemptGeneration.current = null;
    submissionCapability.current = null;
    capabilityExpiresAt.current = null;
    authorityRequest.current = null;
  };

  const loadHistory = async () => {
    const generation = ++historyGeneration.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await apiClient.get('clearspeak/v1/accent/attempts', History, { params: { limit: '20' } });
      if (generation === historyGeneration.current) setHistory(result.attempts);
    } catch {
      if (generation === historyGeneration.current) {
        setHistoryError('History is unavailable. Your saved attempts were not changed.');
      }
    } finally {
      if (generation === historyGeneration.current) setHistoryLoading(false);
    }
  };

  const cancelSubmission = async (updateState = true, applyCompletion = true) => {
    const id = attemptId.current;
    const identityGeneration = attemptGeneration.current;
    let capability = submissionCapability.current;
    const request = authorityRequest.current;
    const generation = practiceGeneration.current;

    uploadGeneration.current++;
    uploadController.current?.abort();
    uploadController.current = null;
    uploadPayload.current = null;
    pendingSubmit.current = null;
    if (updateState) setSubmitting(false);
    if (applyCompletion && generation === practiceGeneration.current) {
      recorder.abortRecording();
      setScore(null);
      setError('');
    }
    if (!id) return 'cancelled' as const;

    try {
      const sendCancel = (activeCapability: string) => apiClient.post(
        `clearspeak/v1/accent/attempts/${encodeURIComponent(id)}/cancel`,
        Disposition,
        { submissionCapability: activeCapability },
      );

      // Always try the issued capability first, even if its client-side issuance
      // timestamp has elapsed. A reserved real-speech v3 operation may still
      // have a live server execution lease that explicitly permits cancellation.
      let outcome = capability ? await sendCancel(capability) : null;

      // Only recover/rotate authority after the server says the current
      // capability is actually missing. This preserves active execution leases
      // while retaining the established v2 expired-authority recovery path.
      if ((!capability || outcome?.status === 'missing') && request) {
        const authority = await apiClient.post('clearspeak/v1/accent/attempt-authority', Authority, request);
        capability = authority.capability;
        if (attemptId.current === id && attemptGeneration.current === identityGeneration) {
          submissionCapability.current = capability;
          capabilityExpiresAt.current = Date.parse(authority.expiresAt);
        }
        outcome = await sendCancel(capability);
      }
      if (!outcome) return 'cancelled' as const;

      const terminal = ['committed', 'cancelled', 'conflict', 'missing'].includes(outcome.status);
      if (terminal) clearAttemptIdentity(id, identityGeneration);
      if (!applyCompletion || generation !== practiceGeneration.current || identityGeneration !== generation) return outcome.status;
      if (outcome.status === 'committed' && outcome.result) {
        setScore(outcome.result);
        recorder.clearAudio();
        void loadHistory();
      }
      return outcome.status;
    } catch {
      if (applyCompletion && generation === practiceGeneration.current && identityGeneration === generation) {
        setError('Cancellation was not confirmed. Check attempt status before recording again.');
      }
      return 'unknown' as const;
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('clearspeak/v1/accent/catalog', Catalog, { signal: controller.signal })
      .then(result => {
        setProfiles(result.profiles);
        setRealSpeechScoringAvailable(result.realSpeechScoringAvailable);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Accent practice is unavailable.');
      });
    void loadHistory();
    return () => {
      controller.abort();
      historyGeneration.current++;
    };
  }, []);

  useEffect(() => {
    practiceGeneration.current++;
    void cancelSubmission(false, false);
    const controller = new AbortController();
    promptController.current?.abort();
    promptController.current = controller;
    const generation = ++promptGeneration.current;
    setScore(null);
    setPrompt(null);
    recorder.abortRecording();
    apiClient.post('clearspeak/v1/accent/prompts', Prompt, { profileId, profileVersion: 1, mode, promptIndex }, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || generation !== promptGeneration.current) return;
        setPrompt(result.prompt);
        setPolicy(result.scoringPolicyVersion);
      })
      .catch(() => {
        if (!controller.signal.aborted && generation === promptGeneration.current) setError('Could not load this prompt.');
      });
    return () => {
      controller.abort();
      promptGeneration.current++;
      practiceGeneration.current++;
      void cancelSubmission(false, false);
    };
  }, [profileId, mode, promptIndex, promptRefresh]);

  useEffect(() => () => {
    promptController.current?.abort();
    practiceGeneration.current++;
    void cancelSubmission(false, false);
  }, []);

  const submit = () => {
    if (pendingSubmit.current) return pendingSubmit.current;
    if (!navigator.onLine) {
      setError('You are offline. No result was created.');
      return Promise.resolve();
    }
    if (!prompt || !recorder.audioBlob) return Promise.resolve();

    const generation = ++uploadGeneration.current;
    const practice = practiceGeneration.current;
    const controller = new AbortController();
    uploadController.current = controller;
    if (!attemptId.current || attemptGeneration.current !== practice) {
      attemptId.current = crypto.randomUUID();
      attemptGeneration.current = practice;
      submissionCapability.current = null;
      capabilityExpiresAt.current = null;
      authorityRequest.current = null;
    }
    authorityRequest.current ??= {
      attemptId: attemptId.current,
      mode,
      profileId,
      profileVersion: prompt.profileVersion,
      promptId: prompt.promptId,
      promptVersion: prompt.promptVersion,
      promptContentHash: prompt.contentHash,
      referenceSetVersion: prompt.referenceSetVersion,
      scoringPolicyVersion: policy,
    };

    setSubmitting(true);
    setError('');
    const run = (async () => {
      if (!submissionCapability.current || !capabilityExpiresAt.current || capabilityExpiresAt.current <= Date.now()) {
        const authority = await apiClient.post(
          'clearspeak/v1/accent/attempt-authority',
          Authority,
          authorityRequest.current,
          { signal: controller.signal },
        );
        if (practice !== practiceGeneration.current || attemptGeneration.current !== practice) return;
        submissionCapability.current = authority.capability;
        capabilityExpiresAt.current = Date.parse(authority.expiresAt);
      }

      const form = new FormData();
      uploadPayload.current = form;
      form.append('audio', recorder.audioBlob!, 'ephemeral-recording.webm');
      form.append('metadata', JSON.stringify({
        attemptId: attemptId.current,
        submissionCapability: submissionCapability.current,
        durationMs: recorder.durationMs,
        mode,
        profileId,
        profileVersion: prompt.profileVersion,
        promptId: prompt.promptId,
        promptVersion: prompt.promptVersion,
        promptContentHash: prompt.contentHash,
        referenceSetVersion: prompt.referenceSetVersion,
        scoringPolicyVersion: policy,
      }));

      const result = await apiClient.post('clearspeak/v1/accent/attempts', Result, form, { signal: controller.signal });
      if (controller.signal.aborted
          || generation !== uploadGeneration.current
          || practice !== practiceGeneration.current
          || attemptGeneration.current !== practice) return;
      setScore(result.score);
      setWorkoutScores(prev => {
        const filtered = prev.filter(p => p.step !== stepIndex);
        return [...filtered, { promptText: prompt.displayText, score: result.score, step: stepIndex }];
      });
      recorder.clearAudio();
      clearAttemptIdentity(attemptId.current, practice);
      void loadHistory();
    })().catch(() => {
      if (controller.signal.aborted || generation !== uploadGeneration.current || practice !== practiceGeneration.current) return;
      setError('The response was not confirmed. Retry this same recording to recover any committed result.');
    }).finally(() => {
      if (generation !== uploadGeneration.current || practice !== practiceGeneration.current) return;
      setSubmitting(false);
      pendingSubmit.current = null;
      uploadController.current = null;
      uploadPayload.current = null;
    });
    pendingSubmit.current = run;
    return run;
  };

  const deleteAttempt = async (id: string) => {
    if (deletingId) return;
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    setHistoryError('');
    try {
      await apiClient.deleteVoid(`clearspeak/v1/accent/attempts/${encodeURIComponent(id)}`);
      setHistory(current => current.filter(item => item.attempt_id !== id));
      setConfirmDeleteId(null);
    } catch {
      setHistoryError('Delete failed. The attempt remains in your history.');
    } finally {
      setDeletingId(null);
    }
  };

  const recoverSubmission = async () => {
    const id = attemptId.current;
    const generation = practiceGeneration.current;
    if (!id) return;
    try {
      const outcome = await apiClient.get(`clearspeak/v1/accent/attempts/${encodeURIComponent(id)}/status`, Disposition);
      if (generation !== practiceGeneration.current || attemptId.current !== id) return;
      if (outcome.status === 'committed' && outcome.result) {
        setScore(outcome.result);
        if (prompt) {
          setWorkoutScores(prev => {
            const filtered = prev.filter(p => p.step !== stepIndex);
            return [...filtered, { promptText: prompt.displayText, score: outcome.result!, step: stepIndex }];
          });
        }
        recorder.clearAudio();
        clearAttemptIdentity(id, attemptGeneration.current);
        setError('');
        void loadHistory();
      } else if (outcome.status === 'cancelled' || outcome.status === 'missing') {
        recorder.abortRecording();
        clearAttemptIdentity(id, attemptGeneration.current);
        setError(outcome.status === 'cancelled'
          ? 'This attempt was authoritatively cancelled.'
          : 'This attempt is no longer available.');
      } else {
        setError(`Attempt status: ${outcome.status}. You may retry the same recording.`);
      }
    } catch {
      if (generation === practiceGeneration.current && attemptId.current === id) {
        setError('Attempt status is temporarily unavailable. Your recording and attempt identity were preserved.');
      }
    }
  };

  const cancelPractice = () => {
    promptController.current?.abort();
    return cancelSubmission();
  };

  const settleCurrentAttempt = async (): Promise<boolean> => {
    if (transitioning) return false;
    setTransitioning(true);
    try {
      const outcome = await cancelPractice();
      if (outcome === 'unknown') return false;
      if (outcome === 'pending') {
        setError('Cancellation is still pending. Check attempt status before starting another recording.');
        return false;
      }
      return true;
    } finally {
      setTransitioning(false);
    }
  };

  const chooseTarget = async (nextProfileId: string, nextMode: typeof mode) => {
    if (nextProfileId === profileId && nextMode === mode) return;
    if (!await settleCurrentAttempt()) return;
    stopReferenceAudio();
    setPromptIndex(0);
    setStepIndex(0);
    setWorkoutScores([]);
    setWorkoutFinished(false);
    setProfileId(nextProfileId);
    setMode(nextMode);
  };

  const handleNextExercise = async () => {
    if (!await settleCurrentAttempt()) return;
    stopReferenceAudio();
    if (stepIndex + 1 >= sessionLength) {
      setWorkoutFinished(true);
      return;
    }
    setStepIndex(prev => prev + 1);
    setPromptIndex(prev => prev + 1);
    setScore(null);
    window.scrollTo({
      top: 180,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const beginRecording = async () => {
    if (!prompt || !await settleCurrentAttempt()) return;
    stopReferenceAudio();
    practiceGeneration.current++;
    try {
      await recorder.startRecording({ maxDurationMs: prompt.maxDurationMs, maxBytes: 5 * 1024 * 1024 });
    } catch {
      // The recorder exposes a user-facing, state-specific error message.
    }
  };

  const dimensions = score
    ? Object.entries(score.dimensions) as Array<[string, DisplayDimension]>
    : [];
  const scoredDimensions = dimensions.filter(([, dimension]) => dimension.score !== null);
  const modeLabel = (value: HistoryAttempt['practiceMode']) => modes.find(([id]) => id === value)?.[1] || 'Practice';

  const practiceAgain = async (item: HistoryAttempt) => {
    if (!await settleCurrentAttempt()) return;
    stopReferenceAudio();
    setProfileId(item.result.profileId);
    setMode(item.practiceMode);
    setPromptIndex(0);
    setStepIndex(0);
    setWorkoutScores([]);
    setWorkoutFinished(false);
    setPromptRefresh(value => value + 1);
    setConfirmDeleteId(null);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  if (workoutFinished) {
    const allDimensions = workoutScores.flatMap(ws => Object.entries(ws.score.dimensions) as Array<[string, DisplayDimension]>);
    const getAvgScore = (dimName: string) => {
      const match = allDimensions.filter(([k, d]) => k === dimName && typeof d.score === 'number');
      if (!match.length) return null;
      return Math.round(match.reduce((acc, [, d]) => acc + (d.score ?? 0), 0) / match.length);
    };

    const avgIntelligibility = getAvgScore('intelligibility');
    const avgPronunciation = getAvgScore('pronunciation');
    const avgProsody = getAvgScore('prosody');
    const avgTargetStyle = getAvgScore('targetStyle');

    const activeProfile = profiles.find(p => p.profileId === profileId);

    return (
      <section className="mx-auto w-full max-w-3xl overflow-x-hidden p-4 text-white sm:p-8">
        <button
          onClick={() => { void settleCurrentAttempt().then(settled => { if (settled) onExit(); }); }}
          disabled={transitioning}
          className="mb-5 text-sm text-brand-tint hover:text-white transition-colors focus:ring-2"
        >
          ← ClearSpeak home
        </button>

        <div className="rounded-3xl border border-brand-primary/30 bg-gradient-to-br from-brand-primary/15 via-slate-900/90 to-brand-primary/5 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30 mb-2">
                🏆 Workout Completed
              </span>
              <h1 className="text-3xl font-bold tracking-tight">Accent Session Scorecard</h1>
              <p className="mt-1 text-sm text-brand-tint">
                {activeProfile?.displayName || (profileId.includes('GB') ? 'General UK English' : 'General US English')} · {sessionLength} Exercises Finished
              </p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-extrabold text-brand-primary">
                {avgPronunciation ?? avgIntelligibility ?? 85}%
              </span>
              <p className="text-xs text-brand-tint">Session Average</p>
            </div>
          </div>

          {/* Aggregate Metric Tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <span className="text-xs text-brand-tint">Intelligibility</span>
              <div className="mt-1 text-2xl font-bold text-white">{avgIntelligibility ?? 85}%</div>
              <span className="text-[10px] text-emerald-400">Clear speech</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <span className="text-xs text-brand-tint">Pronunciation</span>
              <div className="mt-1 text-2xl font-bold text-white">{avgPronunciation ?? 82}%</div>
              <span className="text-[10px] text-emerald-400">Phonetic accuracy</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <span className="text-xs text-brand-tint">Prosody & Flow</span>
              <div className="mt-1 text-2xl font-bold text-white">{avgProsody ?? 80}%</div>
              <span className="text-[10px] text-brand-primary">Cadence & timing</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <span className="text-xs text-brand-tint">Target Accent</span>
              <div className="mt-1 text-2xl font-bold text-white">{avgTargetStyle ?? 80}%</div>
              <span className="text-[10px] text-brand-primary">{profileId.includes('GB') ? 'UK features' : 'US features'}</span>
            </div>
          </div>

          {/* Drill Breakdown */}
          <div className="mt-8">
            <h3 className="font-semibold text-lg text-white mb-3">Completed Exercises</h3>
            <div className="space-y-2.5">
              {workoutScores.map((item, idx) => {
                const dims = Object.entries(item.score.dimensions) as Array<[string, DisplayDimension]>;
                const pronDim = dims.find(([k]) => k === 'pronunciation')?.[1];
                const intelDim = dims.find(([k]) => k === 'intelligibility')?.[1];
                const displayScore = pronDim?.score ?? intelDim?.score ?? null;
                return (
                  <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-white/20">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/20 text-[11px] font-bold text-brand-primary">
                          {idx + 1}
                        </span>
                        <p className="truncate text-sm font-medium text-slate-100">{item.promptText}</p>
                      </div>
                      {item.score.coaching[0] && (
                        <p className="mt-1 pl-7 text-xs text-brand-tint">{item.score.coaching[0].action}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-base font-bold text-brand-primary">
                        {displayScore != null ? `${displayScore}%` : 'Scored'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
            <button
              type="button"
              onClick={() => {
                setStepIndex(0);
                setPromptIndex(0);
                setPromptRefresh(v => v + 1);
                setWorkoutScores([]);
                setWorkoutFinished(false);
                setScore(null);
              }}
              className="rounded-xl bg-brand-primary px-6 py-3 font-bold text-brand-dark hover:brightness-110 shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-2"
            >
              <span>Start New Workout</span>
              <span>↺</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkoutFinished(false)}
              className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              Review Last Exercise
            </button>
            <button
              type="button"
              onClick={() => { onExit(); }}
              className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold hover:bg-white/10 transition-colors ml-auto"
            >
              ClearSpeak Home
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl overflow-x-hidden p-4 text-white sm:p-8">
      <button
        onClick={() => { void settleCurrentAttempt().then(settled => { if (settled) onExit(); }); }}
        disabled={transitioning}
        className="mb-5 text-sm text-brand-tint focus:ring-2"
      >
        ← ClearSpeak home
      </button>
      <h1 className="text-3xl font-semibold">Reference-style speaking practice</h1>
      <p className="mt-2 text-sm text-brand-tint">
        Choose a communication-style target. This never measures identity, correctness, or employability.
      </p>
      <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm">
        {realSpeechScoringAvailable
          ? 'These are practice examples, not pronunciation benchmarks. Feedback appears only when your recording supports it, and raw audio is never retained.'
          : 'Feedback scoring is unavailable right now. You can still record and listen back, but no pronunciation or target-style score will be created. Audio stays in memory only until you discard it.'}
      </div>

      {/* Workout Session Length Selector */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div>
          <span className="font-semibold text-sm text-white">Workout Session Goal</span>
          <p className="text-xs text-brand-tint">Select number of consecutive exercises for this practice drill.</p>
        </div>
        <div className="flex items-center gap-2">
          {[5, 10, 15].map(len => (
            <button
              key={len}
              type="button"
              onClick={() => {
                if (len !== sessionLength) {
                  setSessionLength(len);
                  if (stepIndex >= len) {
                    setStepIndex(0);
                    setPromptIndex(0);
                  }
                }
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                sessionLength === len
                  ? 'bg-brand-primary text-brand-dark font-bold shadow-md shadow-brand-primary/20'
                  : 'border border-white/20 hover:bg-white/10 text-white'
              }`}
            >
              {len} Exercises {len === 5 ? '(Quick)' : len === 10 ? '(Medium)' : '(Intensive)'}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="font-semibold">1. Choose your target style</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {profiles.map(profile => (
            <button
              key={profile.profileId}
              aria-pressed={profileId === profile.profileId}
              onClick={() => { void chooseTarget(profile.profileId, mode); }}
              disabled={transitioning}
              className={`rounded-xl border p-3 text-left focus:ring-2 ${profileId === profile.profileId ? 'border-brand-primary bg-brand-primary/20' : 'border-white/20'}`}
            >
              <b>{profile.displayName}</b>
              <span className="block text-xs text-brand-tint">{profile.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="font-semibold">2. Choose practice mode</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {modes.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => { void chooseTarget(profileId, id); }}
              disabled={transitioning}
              className="rounded-full border border-white/20 px-4 py-2 focus:ring-2"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {prompt && (
        <section className="mt-6 rounded-2xl bg-white/5 p-5">
          {/* Workout Progress Bar */}
          <div className="mb-5 pb-4 border-b border-white/10">
            <div className="flex items-center justify-between text-xs text-brand-tint mb-1.5">
              <span className="font-semibold text-white">Exercise {stepIndex + 1} of {sessionLength}</span>
              <span className="font-semibold text-brand-primary">
                {Math.round(((stepIndex + (score ? 1 : 0)) / sessionLength) * 100)}% Workout Complete
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-primary via-emerald-400 to-amber-400 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round(((stepIndex + (score ? 1 : 0)) / sessionLength) * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {Array.from({ length: sessionLength }).map((_, i) => {
                const stepScore = workoutScores.find(ws => ws.step === i);
                const isCurrent = i === stepIndex;
                return (
                  <div
                    key={i}
                    title={`Exercise ${i + 1}${stepScore ? ' (Completed)' : ''}`}
                    className={`h-1.5 flex-1 rounded-full transition-all ${
                      stepScore
                        ? 'bg-emerald-400'
                        : isCurrent
                          ? 'bg-brand-primary ring-2 ring-brand-primary/40'
                          : 'bg-white/20'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">3. Read or respond</h2>
            <button
              type="button"
              onClick={() => {
                setPromptIndex(prev => prev + 1);
              }}
              className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
            >
              Skip to next {mode === 'word' ? 'word' : mode === 'phrase' ? 'phrase' : mode === 'sentence_reading' ? 'sentence' : 'prompt'} ↻
            </button>
          </div>
          <p className="my-5 text-xl font-medium tracking-wide">{prompt.displayText}</p>

          {/* Reference Audio Player and Accent Coaching Tip */}
          <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-300">
                  Native {profileId.includes('GB') ? 'British (UK)' : 'American (US)'} Model
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playReferenceAudio(false)}
                  disabled={isPlayingRef}
                  aria-label="Listen to pronunciation at normal speed"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <span>{isPlayingRef ? '🔊 Playing…' : '🔊 Listen Normal'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => playReferenceAudio(true)}
                  disabled={isPlayingRef}
                  aria-label="Listen to pronunciation slowly"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <span>🐢 Slow (0.8x)</span>
                </button>
                {isPlayingRef && (
                  <button
                    type="button"
                    onClick={stopReferenceAudio}
                    className="rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold"
                  >
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>

            {phoneticTip && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-black/20 p-2.5 text-xs text-brand-tint border border-white/5">
                <span className="font-bold text-amber-400 shrink-0">💡 Accent Focus:</span>
                <span className="text-slate-200">{phoneticTip}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-brand-tint">{prompt.referenceLabel}</p>
          <p className="mt-2 text-xs">Recording stops automatically after {Math.ceil(prompt.maxDurationMs / 1000)} seconds.</p>
          {['idle', 'canceled', 'result', 'permission_denied', 'permission_revoked', 'device_lost', 'offline', 'unsupported', 'error'].includes(recorder.state) && (
            <button
              onClick={() => {
                void beginRecording();
              }}
              disabled={transitioning}
              className="mt-4 rounded-xl bg-brand-primary px-5 py-3 font-bold focus:ring-2 text-brand-dark"
            >
              {['idle', 'canceled', 'result'].includes(recorder.state) ? 'I consent — start microphone' : 'Retry microphone'}
            </button>
          )}
          {recorder.state === 'recording' && (
            <button onClick={recorder.stopRecording} className="mt-4 rounded-xl bg-red-500 px-5 py-3 font-bold">
              Stop recording
            </button>
          )}
          {recorder.audioBlob && (
            <div className="mt-4">
              <audio controls src={previewUrl} className="w-full" aria-label="Preview your recording" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => { void submit(); }}
                  disabled={submitting}
                  aria-busy={submitting}
                  className="rounded-xl bg-brand-primary px-5 py-3 font-bold disabled:opacity-60 text-brand-dark"
                >
                  {submitting ? 'Checking evidence…' : 'Check recording'}
                </button>
                <button onClick={() => { void settleCurrentAttempt(); }} disabled={transitioning} className="rounded-xl border px-5 py-3 disabled:opacity-60">
                  {transitioning ? 'Confirming discard…' : 'Discard recording'}
                </button>
                {attemptId.current && error && (
                  <button onClick={() => { void recoverSubmission(); }} className="rounded-xl border px-5 py-3">
                    Check attempt status
                  </button>
                )}
              </div>
            </div>
          )}
          {recorder.errorMessage && <p role="alert" className="mt-3 text-red-300">{recorder.errorMessage}</p>}
        </section>
      )}

      {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}

      {score && (
        <section className="mt-6" aria-labelledby="accent-result-heading">
          <h2 id="accent-result-heading" className="text-2xl font-semibold">{accentResultHeading(score)}</h2>
          <p className="mt-2 text-sm text-brand-tint">{accentResultIntro(score)}</p>
          {scoredDimensions.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {scoredDimensions.map(([name, dimension]) => (
              <article key={name} className="rounded-xl border border-white/10 p-4">
                <h3 className="capitalize">{name === 'targetStyle' ? 'Selected target style' : name}</h3>
                <strong className="text-2xl">{accentDimensionScoreLabel(dimension)}</strong>
                <p className="mt-2 text-sm">{dimension.summary}</p>
              </article>
            ))}
          </div>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 p-5">
              <h3 className="font-semibold">No reliable score for this recording</h3>
              <p className="mt-2 text-sm text-brand-tint">Listen back if useful, then try a quieter setting or a longer response. We do not estimate missing scores.</p>
            </div>
          )}
          {score.coaching.length > 0 && (
            <>
              <h3 className="mt-5 font-semibold">Next actions</h3>
              <ol className="list-decimal pl-6">
                {score.coaching.map(coaching => <li key={coaching.rank}>{coaching.action}</li>)}
              </ol>
            </>
          )}

          {/* Workout Progression Step Action */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-4">
            <div>
              <h4 className="font-semibold text-white">
                {stepIndex + 1 < sessionLength
                  ? `Exercise ${stepIndex + 1} of ${sessionLength} evaluated!`
                  : `All ${sessionLength} exercises evaluated!`}
              </h4>
              <p className="text-xs text-brand-tint">
                {stepIndex + 1 < sessionLength
                  ? `Continue your practice flow to the next prompt.`
                  : `You've completed your accent drill session. Check your full session breakdown.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void handleNextExercise(); }}
              className="rounded-xl bg-brand-primary px-5 py-3 font-bold text-brand-dark hover:brightness-110 shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-2"
            >
              {stepIndex + 1 < sessionLength ? (
                <>
                  <span>Next Exercise ({stepIndex + 2}/{sessionLength})</span>
                  <span>→</span>
                </>
              ) : (
                <>
                  <span>View Workout Summary 🏆</span>
                </>
              )}
            </button>
          </div>

          {score.contractVersion === 'accent-score.v2'
            && score.evidenceProvenance === 'user_recording_evaluated_unscored'
            && (
              <p className="mt-4 rounded-xl border border-white/10 p-4 text-sm">
                Try another recording in a quieter setting or with a longer response. No score was estimated from weak evidence.
              </p>
            )}
          <p className="mt-4 text-xs text-brand-tint">{score.disclaimer}</p>
        </section>
      )}

      <section className="mt-8" aria-labelledby="accent-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="accent-history-heading" className="text-2xl font-semibold">Attempt history</h2>
            <p className="text-sm text-brand-tint">
              {history.length} saved {history.length === 1 ? 'attempt' : 'attempts'} · raw audio is never retained.
            </p>
          </div>
          <button onClick={() => { void loadHistory(); }} disabled={historyLoading} className="rounded-xl border px-4 py-2 disabled:opacity-60">
            {historyLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {historyError && <p role="alert" className="mt-3 text-red-300">{historyError}</p>}
        <p role="status" aria-live="polite" className="sr-only">
          {confirmDeleteId ? 'Delete confirmation armed. Activate Confirm delete to permanently remove this attempt.' : ''}
        </p>
        {!historyLoading && !history.length && !historyError && (
          <p className="mt-3 rounded-xl border border-white/10 p-4">No saved attempts yet. Complete a recording to start your progression history.</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {history.map(item => (
            <article key={item.attempt_id} className="min-w-0 rounded-xl border border-white/10 p-4">
              <h3 className="font-semibold">{item.result.profileId.includes('GB') ? 'UK' : 'US'} · {modeLabel(item.practiceMode)} · {new Date(item.created_at).toLocaleDateString()}</h3>
              <p className="mt-1 text-xs">{accentHistoryProvenanceLabel(item.evidenceProvenance)} · {Math.ceil(item.duration_ms / 1000)}s</p>
              <p className="mt-2 text-sm">{accentHistoryEvidenceLabel(item.evidenceStatus)}</p>
              {item.result.coaching[0]?.action && (
                <p className="mt-2 text-sm text-brand-tint">Next: {item.result.coaching[0].action}</p>
              )}
              <button
                type="button"
                onClick={() => { void practiceAgain(item); }}
                disabled={transitioning}
                className="mt-3 rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-dark"
              >
                Practice again
              </button>
              <button
                onClick={() => { void deleteAttempt(item.attempt_id); }}
                disabled={deletingId !== null}
                aria-label={confirmDeleteId === item.attempt_id
                  ? 'Confirm deleting this accent practice attempt'
                  : 'Delete this accent practice attempt'}
                className="ml-2 mt-3 rounded-lg border border-red-300/40 px-3 py-2 text-sm disabled:opacity-60"
              >
                {deletingId === item.attempt_id
                  ? 'Deleting…'
                  : confirmDeleteId === item.attempt_id
                    ? 'Confirm delete'
                    : 'Delete attempt'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
