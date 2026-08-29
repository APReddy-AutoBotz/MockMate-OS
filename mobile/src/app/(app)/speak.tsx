import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { z } from 'zod';
import {
  AccentProfileV1Schema,
  AccentScoreV1Schema,
  PracticeModeSchema,
  PracticePromptV1Schema,
  type AccentProfileV1,
  type AccentScoreV1,
  type PracticePromptV1,
} from 'mockmate-shared';
import {
  AccentScoreV2Schema,
  type AccentScoreV2,
} from 'mockmate-shared/accent-evidence';
import { apiClient, ApiError } from '../../services/apiClient';

const AccentScoreSchema = z.union([AccentScoreV1Schema, AccentScoreV2Schema]);
type AccentScore = AccentScoreV1 | AccentScoreV2;

const AccentCatalogSchema = z.object({
  contractVersion: z.literal('accent-profile-catalog.v1'),
  profiles: z.array(AccentProfileV1Schema).min(1),
  practiceModes: z.array(PracticeModeSchema).min(1),
  fixture: z.boolean(),
  retention: z.literal('derived-results-only'),
  realSpeechScoringAvailable: z.boolean(),
}).strict();

const AccentPromptEnvelopeSchema = z.object({
  prompt: PracticePromptV1Schema,
  scoringPolicyVersion: z.string().min(1),
  fixture: z.boolean(),
}).strict();

const AccentAttemptAuthoritySchema = z.object({
  attemptId: z.string().uuid(),
  capability: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().min(1),
}).strict();

const AccentAdapterDescriptorSchema = z.union([
  z.object({
    status: z.literal('unavailable'),
    adapterId: z.literal('scoring-unavailable-v1'),
  }).strict(),
  z.object({
    status: z.literal('authorized'),
    adapterId: z.string().min(1),
    adapterVersion: z.string().min(1),
  }).strict(),
]);

const AccentAttemptSubmissionResponseSchema = z.object({
  score: AccentScoreSchema,
  replayed: z.boolean(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  adapter: AccentAdapterDescriptorSchema,
  retention: z.literal('derived-results-only'),
}).strict();

const AccentAttemptStatusSchema = z.object({
  status: z.enum(['pending', 'cancelled', 'committed', 'conflict', 'missing', 'limit', 'invalid']),
  requestHash: z.string().nullish(),
  result: AccentScoreSchema.nullish(),
  replayed: z.boolean().nullish(),
  executionLeaseExpiresAt: z.string().nullish(),
}).strict();

const AccentHistoryAttemptSchema = z.object({
  attempt_id: z.string().uuid(),
  result: AccentScoreSchema,
  fixture: z.boolean(),
  evidence_provenance: z.string(),
  duration_ms: z.number().int().nonnegative(),
  mime_type: z.string(),
  created_at: z.string(),
  evidenceProvenance: z.string(),
  evidenceStatus: z.record(z.enum(['sufficient', 'limited', 'insufficient', 'unsupported'])),
}).strict();

const AccentHistorySchema = z.object({
  attempts: z.array(AccentHistoryAttemptSchema),
  retention: z.literal('derived-results-only'),
}).strict();

const EmptyResponseSchema = z.object({}).strict();

type PracticeMode = z.infer<typeof PracticeModeSchema>;
type HistoryAttempt = z.infer<typeof AccentHistoryAttemptSchema>;

type PendingAttempt = {
  attemptId: string;
  capability: string | null;
  capabilityExpiresAt: string | null;
  uri: string;
  metadata: Record<string, unknown>;
};

type RecordingPreview = {
  uri: string;
  durationMs: number;
};

type CancelOutcome = 'none' | 'cancelled' | 'committed' | 'missing' | 'failed';

const RECORDING_UPLOAD = Platform.OS === 'web'
  ? { name: 'recording.webm', type: 'audio/webm' }
  : { name: 'recording.m4a', type: 'audio/mp4' };

const DIMENSIONS = [
  ['intelligibility', 'Intelligibility'],
  ['pronunciation', 'Pronunciation'],
  ['prosody', 'Prosody'],
  ['fluency', 'Fluency'],
  ['targetStyle', 'Selected target style'],
] as const;

function createUuidV4(): string {
  const randomUuid = (globalThis as any)?.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return randomUuid.call((globalThis as any).crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function capabilityNeedsRotation(pending: PendingAttempt): boolean {
  if (!pending.capability || !pending.capabilityExpiresAt) return true;
  const expiry = Date.parse(pending.capabilityExpiresAt);
  return !Number.isFinite(expiry) || expiry <= Date.now();
}

function validateAdapterDescriptor(
  score: AccentScore,
  adapter: z.infer<typeof AccentAdapterDescriptorSchema>,
): void {
  if (score.contractVersion === 'accent-score.v2') {
    if (
      adapter.status !== 'authorized' ||
      adapter.adapterId !== score.evidenceLineage.adapterId ||
      adapter.adapterVersion !== score.evidenceLineage.adapterVersion
    ) {
      throw new Error('Scoring adapter lineage does not match the governed result.');
    }
    return;
  }

  if (adapter.status !== 'unavailable' || adapter.adapterId !== 'scoring-unavailable-v1') {
    throw new Error('Unexpected scoring authority for an unscored V1 result.');
  }
}

function resultLabel(score: AccentScore): string {
  if (score.contractVersion === 'accent-score.v1') {
    if (score.evidenceProvenance === 'synthetic_fixture_scored' || score.fixture) {
      return 'Synthetic fixture — test evidence only';
    }
    return 'No reliable score was created';
  }
  if (score.evidenceProvenance === 'user_recording_scored') return 'Evidence-backed feedback';
  return 'No reliable score was created';
}

export default function SpeakScreen() {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const previewPlayer = useAudioPlayer(null);
  const previewStatus = useAudioPlayerStatus(previewPlayer);
  const [profiles, setProfiles] = useState<AccentProfileV1[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<AccentProfileV1['profileId']>('en-GB-general-v1');
  const [mode, setMode] = useState<PracticeMode>('sentence_reading');
  const [prompt, setPrompt] = useState<PracticePromptV1 | null>(null);
  const [scoringPolicyVersion, setScoringPolicyVersion] = useState('');
  const [realSpeechScoringAvailable, setRealSpeechScoringAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [consented, setConsented] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPreview, setRecordingPreview] = useState<RecordingPreview | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AccentScore | null>(null);
  const [history, setHistory] = useState<HistoryAttempt[]>([]);
  const [errorText, setErrorText] = useState('');
  const [hasPendingAttempt, setHasPendingAttempt] = useState(false);
  const pendingAttemptRef = useRef<PendingAttempt | null>(null);
  const resultRef = useRef<AccentScore | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.profileId === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const setGovernedResult = useCallback((score: AccentScore | null) => {
    resultRef.current = score;
    setResult(score);
  }, []);

  const stopPreviewPlayback = useCallback(async () => {
    previewPlayer.pause();
    await previewPlayer.seekTo(0).catch(() => undefined);
  }, [previewPlayer]);

  const playRecordingPreview = useCallback(async () => {
    if (!recordingPreview) return;
    await stopPreviewPlayback();
    try {
      previewPlayer.play();
    } catch (error: any) {
      setErrorText(error?.message || 'Could not play this recording.');
    }
  }, [previewPlayer, recordingPreview, stopPreviewPlayback]);

  const discardRecordingPreview = useCallback(async () => {
    await stopPreviewPlayback();
    setRecordingPreview(null);
    setSeconds(0);
    setErrorText('');
  }, [stopPreviewPlayback]);

  useEffect(() => {
    previewPlayer.pause();
    previewPlayer.replace(recordingPreview ? { uri: recordingPreview.uri } : null);
  }, [previewPlayer, recordingPreview]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await apiClient.get('/clearspeak/v1/accent/attempts', AccentHistorySchema, {
        params: { limit: '10' },
      });
      setHistory(response.attempts);
    } catch (error) {
      if (__DEV__) console.warn('ClearSpeak Accent history unavailable', error);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      const catalog = await apiClient.get('/clearspeak/v1/accent/catalog', AccentCatalogSchema);
      setProfiles(catalog.profiles);
      setRealSpeechScoringAvailable(catalog.realSpeechScoringAvailable);
      setSelectedProfileId((current) => (
        catalog.profiles.some((profile) => profile.profileId === current)
          ? current
          : catalog.profiles[0].profileId
      ));
      await loadHistory();
    } catch (error: any) {
      setErrorText(error?.message || 'Accent practice is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  const loadPrompt = useCallback(async () => {
    if (!selectedProfile || pendingAttemptRef.current) return;
    setErrorText('');
    setGovernedResult(null);
    try {
      const response = await apiClient.post('/clearspeak/v1/accent/prompts', AccentPromptEnvelopeSchema, {
        profileId: selectedProfile.profileId,
        profileVersion: selectedProfile.profileVersion,
        mode,
      });
      setPrompt(response.prompt);
      setScoringPolicyVersion(response.scoringPolicyVersion);
    } catch (error: any) {
      setPrompt(null);
      setErrorText(error?.message || 'Practice prompt is unavailable.');
    }
  }, [mode, selectedProfile, setGovernedResult]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCatalog();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadCatalog]);

  useEffect(() => {
    if (profiles.length === 0) return undefined;
    const timer = setTimeout(() => {
      void loadPrompt();
    }, 0);
    return () => clearTimeout(timer);
  }, [profiles.length, loadPrompt]);

  const authorizePendingAttempt = useCallback(async (pending: PendingAttempt): Promise<PendingAttempt> => {
    const authority = await apiClient.post(
      '/clearspeak/v1/accent/attempt-authority',
      AccentAttemptAuthoritySchema,
      pending.metadata,
    );
    if (authority.attemptId !== pending.attemptId) {
      throw new Error('Server attempt authority did not match the pending attempt.');
    }
    const authorized: PendingAttempt = {
      ...pending,
      capability: authority.capability,
      capabilityExpiresAt: authority.expiresAt,
    };
    pendingAttemptRef.current = authorized;
    return authorized;
  }, []);

  const recoverCommittedAttempt = useCallback(async (pending: PendingAttempt, silent = false): Promise<boolean> => {
    try {
      const status = await apiClient.get(
        `/clearspeak/v1/accent/attempts/${pending.attemptId}/status`,
        AccentAttemptStatusSchema,
      );
      if (status.status === 'committed') {
        if (!status.result) {
          if (!silent) setErrorText('The server reports this attempt as committed, but its governed result is unavailable. Recovery remains blocked rather than guessing a result.');
          return false;
        }
        pendingAttemptRef.current = null;
        if (!silent) {
          setHasPendingAttempt(false);
          setGovernedResult(status.result);
          setErrorText('');
          await loadHistory();
        }
        return true;
      }
      if (status.status === 'cancelled') {
        pendingAttemptRef.current = null;
        if (!silent) setHasPendingAttempt(false);
      }
    } catch {
      // Preserve the pending attempt. Its exact selector/audio can still recover.
    }
    return false;
  }, [loadHistory, setGovernedResult]);

  const cancelPendingAuthority = useCallback(async (silent = false): Promise<CancelOutcome> => {
    let pending = pendingAttemptRef.current;
    if (!pending) return 'none';
    try {
      if (await recoverCommittedAttempt(pending, silent)) return 'committed';
      pending = pendingAttemptRef.current;
      if (!pending) return 'cancelled';
      if (capabilityNeedsRotation(pending)) pending = await authorizePendingAttempt(pending);
      if (!pending.capability) throw new Error('Submission capability is unavailable.');

      const outcome = await apiClient.post(
        `/clearspeak/v1/accent/attempts/${pending.attemptId}/cancel`,
        AccentAttemptStatusSchema,
        { submissionCapability: pending.capability },
      );

      if (outcome.status === 'committed') {
        const committed = outcome.result ?? null;
        if (!committed) {
          if (!silent) setErrorText('The server reports this attempt as committed, but its governed result is unavailable. Recovery remains blocked.');
          return 'failed';
        }
        pendingAttemptRef.current = null;
        if (!silent) {
          setHasPendingAttempt(false);
          setGovernedResult(committed);
          setErrorText('');
          await loadHistory();
        }
        return 'committed';
      }

      if (outcome.status === 'cancelled') {
        pendingAttemptRef.current = null;
        if (!silent) setHasPendingAttempt(false);
        return 'cancelled';
      }

      if (outcome.status === 'missing') {
        // Do not discard local recovery state. A missing/expired capability can
        // be rotated against the same selector on the next exact retry.
        pendingAttemptRef.current = { ...pending, capability: null, capabilityExpiresAt: null };
        if (!silent) setErrorText('Cancellation authority expired before the server confirmed cancellation. Retry cancel or recover this same attempt.');
        return 'missing';
      }

      if (!silent) setErrorText(`The pending attempt is still authoritative (${outcome.status}). Recover or retry it before changing practice settings.`);
      return 'failed';
    } catch (error: any) {
      const current = pendingAttemptRef.current ?? pending;
      if (current && await recoverCommittedAttempt(current, silent)) return 'committed';
      if (!silent) setErrorText(error?.message || 'The pending attempt could not be cancelled. Recover or retry it instead.');
      return 'failed';
    }
  }, [authorizePendingAttempt, loadHistory, recoverCommittedAttempt, setGovernedResult]);

  useEffect(() => () => {
    if (audioRecorder.isRecording) void audioRecorder.stop().catch(() => undefined);
    previewPlayer.pause();
    if (pendingAttemptRef.current && !resultRef.current) void cancelPendingAuthority(true);
  }, [audioRecorder, cancelPendingAuthority, previewPlayer]);

  const blockSettingChangeIfBusy = (): boolean => {
    if (recording || recordingPreview || isSubmitting) {
      Alert.alert('Recording in progress', 'Finish or discard the current recording before changing the target or practice mode.');
      return true;
    }
    if (pendingAttemptRef.current) {
      Alert.alert('Pending governed attempt', 'Recover, retry, or cancel the pending attempt before changing the target or practice mode.');
      return true;
    }
    return false;
  };

  const chooseProfile = (profileId: AccentProfileV1['profileId']) => {
    if (blockSettingChangeIfBusy()) return;
    setSelectedProfileId(profileId);
  };

  const chooseMode = (nextMode: PracticeMode) => {
    if (blockSettingChangeIfBusy()) return;
    setMode(nextMode);
  };

  const askForConsent = () => {
    Alert.alert(
      'Microphone consent',
      'Your recording stays on this device for listen-back. If reliable scoring is available and you choose Check recording, it is uploaded for that check; MockMate does not persist raw audio.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'I consent', onPress: () => setConsented(true) },
      ],
    );
  };

  const handleStartRecording = async () => {
    if (!prompt) return;
    if (pendingAttemptRef.current) {
      Alert.alert('Pending governed attempt', 'Recover, retry, or cancel the pending attempt before recording again.');
      return;
    }
    if (!consented) {
      askForConsent();
      return;
    }
    try {
      await discardRecordingPreview();
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required', 'Allow microphone access to record this practice attempt.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
      setRecordingStartedAt(Date.now());
      setSeconds(0);
      setErrorText('');
      setGovernedResult(null);
    } catch (error: any) {
      Alert.alert('Recording unavailable', error?.message || 'Could not start microphone recording.');
    }
  };

  const buildSelector = useCallback((attemptId: string, durationMs: number) => {
    if (!prompt) throw new Error('Practice prompt is unavailable.');
    return {
      attemptId,
      durationMs,
      mode: prompt.mode,
      profileId: prompt.profileId,
      profileVersion: prompt.profileVersion,
      promptId: prompt.promptId,
      promptVersion: prompt.promptVersion,
      promptContentHash: prompt.contentHash,
      referenceSetVersion: prompt.referenceSetVersion,
      scoringPolicyVersion,
    };
  }, [prompt, scoringPolicyVersion]);

  const processPendingAttempt = useCallback(async (original: PendingAttempt) => {
    setIsSubmitting(true);
    setErrorText('');
    let pending = original;
    try {
      if (await recoverCommittedAttempt(pending)) return;
      pending = pendingAttemptRef.current ?? pending;
      if (capabilityNeedsRotation(pending)) pending = await authorizePendingAttempt(pending);
      if (!pending.capability) throw new Error('Submission capability is unavailable.');

      const formData = new FormData();
      formData.append('audio', {
        uri: pending.uri,
        name: RECORDING_UPLOAD.name,
        type: RECORDING_UPLOAD.type,
      } as any);
      formData.append('metadata', JSON.stringify({
        ...pending.metadata,
        submissionCapability: pending.capability,
      }));

      const response = await apiClient.post(
        '/clearspeak/v1/accent/attempts',
        AccentAttemptSubmissionResponseSchema,
        formData,
      );
      validateAdapterDescriptor(response.score, response.adapter);
      setGovernedResult(response.score);
      pendingAttemptRef.current = null;
      setHasPendingAttempt(false);
      await loadHistory();
    } catch (error: any) {
      const current = pendingAttemptRef.current ?? pending;
      const recovered = await recoverCommittedAttempt(current);
      if (!recovered) {
        const lostAuthority = !current.capability;
        setErrorText(
          lostAuthority
            ? 'Attempt authority may have been created but its response was not received. Retry this same attempt to recover/rotate authority without creating a duplicate.'
            : error instanceof ApiError && error.status === 503
              ? 'Scoring evidence is temporarily unavailable. You can retry this exact attempt without creating a duplicate.'
              : error?.message || 'The governed accent attempt could not be completed.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [authorizePendingAttempt, loadHistory, recoverCommittedAttempt, setGovernedResult]);

  const issueAuthorityAndSubmit = useCallback(async (uri: string, durationMs: number) => {
    const attemptId = createUuidV4();
    const selector = buildSelector(attemptId, durationMs);
    // Persist local recovery identity before authority issuance. If the authority
    // response is lost, the same attempt/selectors can safely rotate capability.
    const pending: PendingAttempt = {
      attemptId,
      capability: null,
      capabilityExpiresAt: null,
      uri,
      metadata: selector,
    };
    pendingAttemptRef.current = pending;
    setHasPendingAttempt(true);
    await processPendingAttempt(pending);
  }, [buildSelector, processPendingAttempt]);

  const handleStopRecording = useCallback(async () => {
    if (!recording || !prompt) return;
    const startedAt = recordingStartedAt ?? Date.now();
    setRecording(false);
    setRecordingStartedAt(null);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      const durationMs = Math.max(250, Math.min(prompt.maxDurationMs, Date.now() - startedAt));
      if (!uri) throw new Error('Recording file is unavailable.');
      setRecordingPreview({ uri, durationMs });
    } catch (error: any) {
      setErrorText(error?.message || 'Could not finish this recording.');
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
  }, [audioRecorder, prompt, recording, recordingStartedAt]);

  const checkRecordingPreview = useCallback(async () => {
    if (!recordingPreview || !realSpeechScoringAvailable) return;
    const preview = recordingPreview;
    await stopPreviewPlayback();
    setRecordingPreview(null);
    await issueAuthorityAndSubmit(preview.uri, preview.durationMs);
  }, [issueAuthorityAndSubmit, realSpeechScoringAvailable, recordingPreview, stopPreviewPlayback]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(() => {
      setSeconds((current) => {
        const next = current + 1;
        if (prompt && next * 1000 >= prompt.maxDurationMs) void handleStopRecording();
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [handleStopRecording, prompt, recording]);

  const retryPending = async () => {
    const pending = pendingAttemptRef.current;
    if (!pending) return;
    await processPendingAttempt(pending);
  };

  const cancelPendingAttempt = async () => {
    if (!pendingAttemptRef.current) return;
    setIsSubmitting(true);
    const outcome = await cancelPendingAuthority(false);
    setIsSubmitting(false);
    if (outcome === 'cancelled') {
      setErrorText('Pending governed attempt cancelled. You can change the target or record again.');
    } else if (outcome === 'committed') {
      setErrorText('');
    }
  };

  const deleteHistoryAttempt = async (attemptId: string) => {
    try {
      await apiClient.delete(`/clearspeak/v1/accent/attempts/${attemptId}`, EmptyResponseSchema);
      setHistory((items) => items.filter((item) => item.attempt_id !== attemptId));
    } catch (error: any) {
      Alert.alert('Delete unavailable', error?.message || 'Could not delete this derived result.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
        <Text style={styles.muted}>Loading speaking practice…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.title}>ClearSpeak practice</Text>
      <Text style={styles.subtitle}>
        Choose a UK or US reference style, record yourself, and listen back. This is communication practice, not a measure of identity, nationality, or employability.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Target style</Text>
        <View style={styles.rowWrap}>
          {profiles.map((profile) => (
            <TouchableOpacity
              key={profile.profileId}
              style={[styles.choice, selectedProfileId === profile.profileId && styles.choiceActive]}
              onPress={() => chooseProfile(profile.profileId)}
              disabled={Boolean(recording) || Boolean(recordingPreview) || isSubmitting || hasPendingAttempt}
            >
              <Text style={selectedProfileId === profile.profileId ? styles.choiceTextActive : styles.choiceText}>
                {profile.displayName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.sectionLabel}>Practice mode</Text>
        <View style={styles.rowWrap}>
          {(['word', 'phrase', 'sentence_reading', 'free_response'] as PracticeMode[]).map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.choice, mode === item && styles.choiceActive]}
              onPress={() => chooseMode(item)}
              disabled={Boolean(recording) || Boolean(recordingPreview) || isSubmitting || hasPendingAttempt}
            >
              <Text style={mode === item ? styles.choiceTextActive : styles.choiceText}>
                {item.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {prompt && (
        <View style={styles.promptCard}>
          <Text style={styles.promptMeta}>{selectedProfile?.displayName} · {prompt.mode.replace(/_/g, ' ')}</Text>
          <Text style={styles.promptText}>{prompt.displayText}</Text>
          <Text style={styles.muted}>Reference set: {prompt.referenceSetVersion}</Text>
        </View>
      )}

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>{realSpeechScoringAvailable ? 'Speech feedback available' : 'Record and listen back'}</Text>
        <Text style={styles.muted}>
          {realSpeechScoringAvailable
            ? 'Check a recording when you want feedback. Only dimensions supported by reliable evidence receive scores.'
            : 'Automatic scoring is unavailable right now. Your recording stays on this device for listen-back and MockMate will not invent a score.'}
        </Text>
      </View>

      {!consented && (
        <TouchableOpacity style={styles.secondaryButton} onPress={askForConsent}>
          <Text style={styles.secondaryButtonText}>Review microphone consent</Text>
        </TouchableOpacity>
      )}

      {recording ? (
        <View style={styles.centerBlock}>
          <Text style={styles.timer}>{seconds}s</Text>
          <TouchableOpacity style={styles.stopButton} onPress={() => void handleStopRecording()}>
            <Text style={styles.stopButtonText}>Stop recording</Text>
          </TouchableOpacity>
        </View>
      ) : recordingPreview ? (
        <View style={styles.previewCard}>
          <Text style={styles.resultTitle}>Listen to your recording</Text>
          <Text style={styles.muted}>
            Notice one thing that felt clear and one thing you want to try again.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => void (previewStatus.playing ? stopPreviewPlayback() : playRecordingPreview())}
          >
            <Text style={styles.secondaryButtonText}>{previewStatus.playing ? 'Stop playback' : 'Play recording'}</Text>
          </TouchableOpacity>
          {realSpeechScoringAvailable && (
            <TouchableOpacity style={styles.primaryButton} onPress={() => void checkRecordingPreview()}>
              <Text style={styles.primaryButtonText}>Check recording</Text>
            </TouchableOpacity>
          )}
          {!realSpeechScoringAvailable && (
            <Text style={styles.localOnlyText}>No upload is needed for listen-back practice.</Text>
          )}
          <TouchableOpacity style={styles.cancelButton} onPress={() => void discardRecordingPreview()}>
            <Text style={styles.cancelButtonText}>Discard and try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.primaryButton, (!prompt || isSubmitting || hasPendingAttempt) && styles.disabled]}
          disabled={!prompt || isSubmitting || hasPendingAttempt}
          onPress={() => void handleStartRecording()}
        >
          <Text style={styles.primaryButtonText}>Start recording</Text>
        </TouchableOpacity>
      )}

      {isSubmitting && (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color="#d4af37" />
          <Text style={styles.muted}>Checking your recording…</Text>
        </View>
      )}

      {errorText ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorText}</Text>
          {hasPendingAttempt && !isSubmitting && (
            <>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => void retryPending()}>
                <Text style={styles.secondaryButtonText}>Recover / retry same attempt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => void cancelPendingAttempt()}>
                <Text style={styles.cancelButtonText}>Cancel pending attempt</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      {result && (
        <View style={styles.card}>
          <Text style={styles.resultTitle}>{resultLabel(result)}</Text>
          {DIMENSIONS.map(([key, label]) => {
            const dimension = result.dimensions[key];
            return (
              <View key={key} style={styles.dimensionCard}>
                <View style={styles.dimensionHeader}>
                  <Text style={styles.dimensionTitle}>{label}</Text>
                  <Text style={styles.dimensionScore}>{dimension.score === null ? 'No score' : `${dimension.score}%`}</Text>
                </View>
                <Text style={styles.muted}>
                  {dimension.evidenceStatus} evidence · {Math.round(dimension.confidence * 100)}% confidence
                </Text>
                <Text style={styles.dimensionSummary}>{dimension.summary}</Text>
              </View>
            );
          })}
          {result.coaching.length > 0 && (
            <View style={styles.coachingBlock}>
              <Text style={styles.sectionLabel}>Next actions</Text>
              {result.coaching.map((item) => (
                <Text key={`${item.rank}-${item.dimension}`} style={styles.coachingText}>
                  {item.rank}. {item.action}
                </Text>
              ))}
            </View>
          )}
          <Text style={styles.disclaimer}>{result.disclaimer}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadPrompt()}>
            <Text style={styles.secondaryButtonText}>New practice prompt</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.resultTitle}>Recent feedback checks</Text>
        {history.length === 0 ? (
          <Text style={styles.muted}>No checked recordings saved yet.</Text>
        ) : history.map((item) => (
          <View key={item.attempt_id} style={styles.historyItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTitle}>{resultLabel(item.result)}</Text>
              <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <TouchableOpacity onPress={() => void deleteHistoryAttempt(item.attempt_id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1329' },
  scrollContainer: { padding: 20, paddingBottom: 48 },
  centerContainer: { flex: 1, backgroundColor: '#0b1329', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  title: { color: '#ffffff', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  card: { backgroundColor: '#1a233d', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  promptCard: { backgroundColor: '#111c36', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)' },
  previewCard: { backgroundColor: '#111c36', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)' },
  noticeCard: { backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)' },
  noticeTitle: { color: '#ffffff', fontWeight: '700', marginBottom: 6 },
  sectionLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  choice: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#0b1329', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  choiceActive: { borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.10)' },
  choiceText: { color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' },
  choiceTextActive: { color: '#d4af37', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  promptMeta: { color: '#d4af37', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10 },
  promptText: { color: '#ffffff', fontSize: 20, lineHeight: 30, fontWeight: '700', marginBottom: 12 },
  muted: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  primaryButton: { backgroundColor: '#d4af37', borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  primaryButtonText: { color: '#0b1329', fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginBottom: 14 },
  secondaryButtonText: { color: '#d4af37', fontSize: 13, fontWeight: '700' },
  localOnlyText: { color: '#94a3b8', fontSize: 12, lineHeight: 18, marginBottom: 14, textAlign: 'center' },
  cancelButton: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.45)', paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  cancelButtonText: { color: '#f87171', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  centerBlock: { alignItems: 'center', gap: 12, paddingVertical: 18 },
  timer: { color: '#ffffff', fontSize: 36, fontWeight: '800' },
  stopButton: { backgroundColor: 'rgba(239,68,68,0.14)', borderWidth: 1, borderColor: '#ef4444', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12 },
  stopButtonText: { color: '#ef4444', fontWeight: '800' },
  errorCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' },
  errorText: { color: '#fecaca', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  resultTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', marginBottom: 14 },
  dimensionCard: { paddingVertical: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  dimensionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  dimensionTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', flex: 1 },
  dimensionScore: { color: '#d4af37', fontSize: 14, fontWeight: '800' },
  dimensionSummary: { color: '#cbd5e1', fontSize: 13, lineHeight: 19, marginTop: 7 },
  coachingBlock: { marginTop: 16 },
  coachingText: { color: '#e2e8f0', fontSize: 13, lineHeight: 20, marginBottom: 7 },
  disclaimer: { color: '#64748b', fontSize: 11, lineHeight: 17, marginVertical: 14 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  historyTitle: { color: '#e2e8f0', fontSize: 13, fontWeight: '700', marginBottom: 3 },
  deleteText: { color: '#f87171', fontSize: 12, fontWeight: '700' },
});
