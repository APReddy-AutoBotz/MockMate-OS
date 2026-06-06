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

import { useState, useRef, useCallback } from 'react';

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error';

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

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

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
        setState('stopped');

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
      setState('error');
      const msg = err?.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone in your browser settings.'
          : 'Could not access microphone. Please try again.';
      setErrorMessage(msg);
      throw new Error(msg);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const abortRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setAudioBlob(null);
    chunksRef.current = [];
    setDurationMs(0);
    setState('idle');
  }, []);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    chunksRef.current = [];
    setDurationMs(0);
    setState('idle');
  }, []);

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
