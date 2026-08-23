import React, { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { AccentProfileV1, AccentScoreV1, PracticePromptV1 } from 'mockmate-shared';
import { AccentProfileV1Schema, AccentScoreV1Schema, PracticePromptV1Schema } from 'mockmate-shared';
import type { AccentScoreV2 } from 'mockmate-shared/accent-evidence';
import { AccentScoreV2Schema } from 'mockmate-shared/accent-evidence';
import { apiClient } from '../../services/apiClient';
import { useAudioRecorder } from './useAudioRecorder';
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
  const [history, setHistory] = useState<HistoryAttempt[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const historyGeneration = useRef(0);

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
    apiClient.post('clearspeak/v1/accent/prompts', Prompt, { profileId, profileVersion: 1, mode }, { signal: controller.signal })
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
  }, [profileId, mode, promptRefresh]);

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
    setProfileId(nextProfileId);
    setMode(nextMode);
  };

  const beginRecording = async () => {
    if (!prompt || !await settleCurrentAttempt()) return;
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
    setProfileId(item.result.profileId);
    setMode(item.practiceMode);
    setPromptRefresh(value => value + 1);
    setConfirmDeleteId(null);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  return (
    <section className="mx-auto w-full max-w-3xl overflow-x-hidden p-4 text-white sm:p-8" aria-live="polite">
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
          <h2 className="font-semibold">3. Read or respond</h2>
          <p className="my-5 text-xl">{prompt.displayText}</p>
          <p className="text-xs text-brand-tint">{prompt.referenceLabel}</p>
          <p className="mt-2 text-xs">Recording stops automatically after {Math.ceil(prompt.maxDurationMs / 1000)} seconds.</p>
          {['idle', 'canceled', 'result', 'permission_denied', 'permission_revoked', 'device_lost', 'offline', 'unsupported', 'error'].includes(recorder.state) && (
            <button
              onClick={() => {
                void beginRecording();
              }}
              disabled={transitioning}
              className="mt-4 rounded-xl bg-brand-primary px-5 py-3 font-bold focus:ring-2"
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
                  className="rounded-xl bg-brand-primary px-5 py-3 font-bold disabled:opacity-60"
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
                aria-label="Delete this accent practice attempt"
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
