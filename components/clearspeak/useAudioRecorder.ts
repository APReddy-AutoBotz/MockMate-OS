/**
 * components/clearspeak/useAudioRecorder.ts
 * Mockmate ClearSpeak — audio recording hook.
 *
 * Captures WebM audio from the browser microphone.
 * Raw audio lives only in memory until scoreSession() consumes it.
 * The blob reference should be cleared after submission.
 *
 * Source of truth: implementation_plan.md §14 — Audio Privacy Policy
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type RecorderState = 'preflight' | 'requesting_permission' | 'recording' | 'preview_ready' | 'scoring_uploading' | 'canceled' | 'permission_denied' | 'permission_revoked' | 'device_lost' | 'offline' | 'unsupported' | 'error' | 'result' | 'idle' | 'stopped';

export interface UseAudioRecorderResult {
  state: RecorderState;
  durationMs: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  abortRecording: () => void;
  audioBlob: Blob | null;
  /** Call after scoreSession() to release the blob from memory */
  clearAudio: () => void;
  errorMessage: string | null;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);

  const releaseRecorder = useCallback(() => {
    generationRef.current += 1;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    releaseRecorder();
    const generation = generationRef.current;
    setErrorMessage(null);
    chunksRef.current = [];

    if (!navigator.onLine) { const message='You are offline. Recording cannot be submitted.'; setState('offline'); setErrorMessage(message); throw new Error(message); }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { const message='Microphone recording is not supported in this browser.'; setState('unsupported'); setErrorMessage(message); throw new Error(message); }
    setState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Microphone request was canceled.');
      }
      streamRef.current = stream;
      stream.getAudioTracks().forEach(track => { track.onended = () => { setState('device_lost'); setErrorMessage('Microphone access was revoked or the device was disconnected.'); }; });

      const mimeType = PREFERRED_MIME_TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setDurationMs(Date.now() - startTimeRef.current);
        setState('preview_ready');

        // Stop microphone tracks to release hardware indicator
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.onerror = () => {
        setState('error');
        setErrorMessage('Recording failed. Please check microphone permissions.');
        streamRef.current?.getTracks().forEach(t => t.stop());
      };

      recorder.start(250); // Collect chunks every 250ms
      startTimeRef.current = Date.now();
      setState('recording');
    } catch (err: any) {
      if (generation !== generationRef.current) throw err;
      setState(err?.name === 'NotAllowedError' ? 'permission_denied' : err?.name === 'NotFoundError' ? 'device_lost' : 'error');
      const msg = err?.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone in your browser settings.'
          : 'Could not access microphone. Please try again.';
      setErrorMessage(msg);
      throw new Error(msg);
    }
  }, [releaseRecorder]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const abortRecording = useCallback(() => {
    releaseRecorder();
    setAudioBlob(null);
    chunksRef.current = [];
    setDurationMs(0);
    setState('canceled');
  }, [releaseRecorder]);

  useEffect(() => () => releaseRecorder(), [releaseRecorder]);

  const clearAudio = useCallback(() => {
    releaseRecorder();
    setAudioBlob(null);
    chunksRef.current = [];
    setDurationMs(0);
    setState('idle');
  }, [releaseRecorder]);

  return {
    state,
    durationMs,
    startRecording,
    stopRecording,
    abortRecording,
    audioBlob,
    clearAudio,
    errorMessage,
  };
}
