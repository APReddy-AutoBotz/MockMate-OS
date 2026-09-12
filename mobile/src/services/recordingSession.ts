export type RecordingPhase = 'idle' | 'preparing' | 'recording' | 'stopping';

export type RecordingPreview = { uri: string; durationMs: number };

type Recorder = {
  prepareToRecordAsync(): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  getStatus(): { durationMillis: number };
  uri: string | null;
};

type RecordingSessionOptions = {
  recorder: Recorder;
  requestPermission(): Promise<{ granted: boolean }>;
  setRecordingMode(enabled: boolean): Promise<void>;
  onPhaseChange(phase: RecordingPhase): void;
  onPreview(preview: RecordingPreview): void;
  onError(message: string): void;
};

// Owns asynchronous operations, while expo-audio owns the native object's lifetime.
// In particular, dispose must never read a recorder that its hook has released.
export function createRecordingSession(options: RecordingSessionOptions) {
  let phase: RecordingPhase = 'idle';
  let active = true;
  let disposed = false;
  let generation = 0;
  let lifetime = 0;
  let maxDurationMs = 0;

  const updatePhase = (next: RecordingPhase) => {
    phase = next;
    if (!disposed) options.onPhaseChange(next);
  };
  const resetMode = () => options.setRecordingMode(false).catch(() => undefined);
  const durationMs = () => {
    if (disposed || phase !== 'recording') return 0;
    return Math.max(0, options.recorder.getStatus().durationMillis);
  };

  const start = async (maximumMs: number) => {
    if (disposed || !active || phase !== 'idle') return;
    const operation = ++generation;
    const owner = lifetime;
    maxDurationMs = maximumMs;
    updatePhase('preparing');
    let prepared = false;
    let started = false;
    const ownsRecorder = () => !disposed && lifetime === owner;
    const canContinue = () => ownsRecorder() && active && generation === operation;
    try {
      const permission = await options.requestPermission();
      if (!canContinue()) return;
      if (!permission.granted) throw new Error('Allow microphone access in your device settings to record this practice attempt.');
      await options.setRecordingMode(true);
      if (!canContinue()) return;
      await options.recorder.prepareToRecordAsync();
      prepared = true;
      if (!canContinue()) return;
      options.recorder.record();
      started = true;
      updatePhase('recording');
    } catch (error) {
      if (canContinue()) options.onError(error instanceof Error ? error.message : 'Could not start microphone recording.');
    } finally {
      if (!started) {
        // A blurred screen remains mounted; release a prepared microphone there.
        // On unmount the expo-audio hook releases it, so do not touch it again.
        if (prepared && ownsRecorder()) await options.recorder.stop().catch(() => undefined);
        if (disposed || lifetime === owner) await resetMode();
        if (ownsRecorder()) updatePhase('idle');
      }
    }
  };

  const stop = async () => {
    if (disposed || phase !== 'recording') return;
    const owner = lifetime;
    let recordedMs = 0;
    updatePhase('stopping');
    try {
      // iOS resets its duration after stop; read the actual captured duration first.
      recordedMs = options.recorder.getStatus().durationMillis;
      await options.recorder.stop();
      if (disposed || lifetime !== owner) return;
      const uri = options.recorder.uri;
      if (!uri) throw new Error('Recording file is unavailable.');
      options.onPreview({ uri, durationMs: Math.max(250, Math.min(maxDurationMs, recordedMs)) });
    } catch (error) {
      if (!disposed && lifetime === owner) options.onError(error instanceof Error ? error.message : 'Could not finish this recording.');
    } finally {
      if (disposed || lifetime === owner) await resetMode();
      if (!disposed && lifetime === owner) updatePhase('idle');
    }
  };

  return {
    start,
    stop,
    durationMs,
    attach() {
      if (!disposed) return;
      disposed = false;
      active = true;
      updatePhase('idle');
    },
    resume() { if (!disposed) active = true; },
    suspend() {
      active = false;
      ++generation;
      return stop();
    },
    dispose() {
      disposed = true;
      active = false;
      ++generation;
      ++lifetime;
      void resetMode();
    },
  };
}

export async function appendRecordingAudio(formData: FormData, uri: string, isWeb: boolean): Promise<void> {
  if (isWeb) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read this recording for upload.');
    const audio = await response.blob();
    const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    formData.append('audio', audio, `recording.${extension}`);
  } else {
    formData.append('audio', { uri, name: 'recording.m4a', type: 'audio/mp4' } as unknown as Blob);
  }
}
