
import React, { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './icons/MicrophoneIcon';
import * as mockGeminiService from '../services/mockGeminiService';
import { motion, AnimatePresence } from 'framer-motion';

interface PushToTalkInputProps {
    onTranscriptSubmit: (transcript: string) => void;
    disabled?: boolean;
}

type Status = 'idle' | 'recording' | 'transcribing' | 'reviewing' | 'error';

const MAX_RECORDING_SECONDS = 180;

const PushToTalkInput: React.FC<PushToTalkInputProps> = ({ onTranscriptSubmit, disabled }) => {
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const startInProgress = useRef<boolean>(false);
    const statusRef = useRef<Status>('idle');
    const discardRecordingRef = useRef<boolean>(false);

    const setLiveStatus = (nextStatus: Status) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
    };

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        if (status !== 'recording') return;

        const startedAt = Date.now();
        setElapsedSeconds(0);
        const intervalId = window.setInterval(() => {
            const nextElapsed = Math.floor((Date.now() - startedAt) / 1000);
            setElapsedSeconds(nextElapsed);
            if (nextElapsed >= MAX_RECORDING_SECONDS) {
                stopRecording();
            }
        }, 500);

        return () => window.clearInterval(intervalId);
    }, [status]);

    const stopStreamTracks = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    };

    const resetToIdleAfterError = () => {
        window.setTimeout(() => {
            if (statusRef.current === 'error') {
                setLiveStatus('idle');
            }
        }, 2500);
    };

    const stopActiveRecorder = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
            stopStreamTracks();
            return;
        }

        if (recorder.state === 'recording' || recorder.state === 'paused') {
            recorder.stop();
            return;
        }

        stopStreamTracks();
    };

    const processTranscription = async (blob: Blob) => {
        if (!blob.size) {
            setError("We could not hear an answer.");
            setLiveStatus('error');
            resetToIdleAfterError();
            return;
        }

        setLiveStatus('transcribing');
        try {
            const res = await (mockGeminiService as any).transcribeAudio(blob);
            const status = typeof res === 'object' && res ? res.status : (res ? 'transcribed' : 'unavailable');
            const text = typeof res === 'object' && res ? res.transcript : res;

            if (status === 'transcribed' && text && text.trim()) {
                onTranscriptSubmit(text.trim());
                setLiveStatus('idle');
                setElapsedSeconds(0);
            } else {
                setError("Transcription unavailable. Retry recording or type your answer.");
                setLiveStatus('error');
                resetToIdleAfterError();
            }
        } catch (e) {
            setError("Transcription unavailable. Retry recording or type your answer.");
            setLiveStatus('error');
            resetToIdleAfterError();
        }
    };

    const startRecording = async () => {
        if (disabled || (statusRef.current !== 'idle' && statusRef.current !== 'error')) return;
        if (startInProgress.current) return;

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setError("Microphone recording is not available in this browser.");
            setLiveStatus('error');
            resetToIdleAfterError();
            return;
        }

        startInProgress.current = true;
        discardRecordingRef.current = false;
        setError(null);
        setElapsedSeconds(0);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 48000
                }
            });
            streamRef.current = stream;

            const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
            const mimeType = preferredMimeTypes.find(type => MediaRecorder.isTypeSupported(type));

            const mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
                mediaRecorderRef.current = null;
                stopStreamTracks();
                if (discardRecordingRef.current) {
                    audioChunksRef.current = [];
                    discardRecordingRef.current = false;
                    setElapsedSeconds(0);
                    setLiveStatus('idle');
                    return;
                }
                processTranscription(blob);
            };
            mediaRecorder.onerror = () => {
                mediaRecorderRef.current = null;
                stopStreamTracks();
                setError("We could not keep the microphone open. Please try again.");
                setLiveStatus('error');
                resetToIdleAfterError();
            };

            mediaRecorder.start();
            setLiveStatus('recording');
        } catch (err) {
            stopStreamTracks();
            setError("Allow microphone access and try again.");
            setLiveStatus('error');
            resetToIdleAfterError();
        } finally {
            startInProgress.current = false;
        }
    };

    useEffect(() => {
        return () => {
            discardRecordingRef.current = true;
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
            } else {
                stopStreamTracks();
            }
        };
    }, []);

    const stopRecording = () => {
        stopActiveRecorder();
    };

    const cancelRecording = () => {
        discardRecordingRef.current = true;
        stopRecording();
    };

    const toggleRecording = () => {
        if (disabled || statusRef.current === 'transcribing') return;
        if (statusRef.current === 'recording') {
            stopRecording();
            return;
        }
        startRecording();
    };

    const formatElapsed = (seconds: number) => {
        const minutes = Math.floor(seconds / 60).toString();
        const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${remainingSeconds}`;
    };

    return (
        <div className="flex flex-col items-center gap-7 w-full">
            <div className="relative group">
                <AnimatePresence>
                    {status === 'recording' && (
                        <>
                            <motion.div
                                initial={{ scale: 1, opacity: 0.4 }}
                                animate={{ scale: 2.5, opacity: 0 }}
                                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                                className="absolute inset-0 rounded-full bg-brand-primary/20"
                            />
                            <motion.div
                                initial={{ scale: 1, opacity: 0.6 }}
                                animate={{ scale: 1.8, opacity: 0 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut", delay: 0.4 }}
                                className="absolute inset-0 rounded-full bg-brand-primary/10"
                            />
                        </>
                    )}
                </AnimatePresence>

                <button
                    type="button"
                    aria-label={status === 'recording' ? 'Finish answer' : 'Start answer'}
                    aria-pressed={status === 'recording'}
                    onClick={toggleRecording}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ touchAction: 'none' }}
                    disabled={disabled || status === 'transcribing'}
                    className={`
                        relative w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all duration-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-4 focus-visible:ring-offset-brand-dark
                        ${status === 'recording' ? 'bg-brand-primary shadow-[0_0_80px_rgba(255,188,3,0.4)] scale-110' :
                            status === 'transcribing' ? 'bg-white/[0.05] border border-white/10' :
                                'bg-white/[0.02] border border-white/10 hover:border-brand-primary/40 hover:bg-brand-primary/5 hover:scale-105 active:scale-95'}
                        disabled:opacity-50 text-white z-10 backdrop-blur-3xl
                    `}
                >
                    {status === 'transcribing' ? (
                        <div className="animate-spin h-10 w-10 border-[3px] border-brand-primary border-t-transparent rounded-full" />
                    ) : status === 'recording' ? (
                        <div className="w-9 h-9 md:w-10 md:h-10 bg-brand-dark rounded-lg shadow-[0_0_25px_rgba(0,26,45,0.35)]" />
                    ) : (
                        <MicrophoneIcon className="w-12 h-12 md:w-14 md:h-14 transition-all duration-500 text-brand-primary opacity-80" />
                    )}
                </button>
            </div>

            <div className="text-center min-h-[4.5rem] flex flex-col items-center gap-3">
                <p className={`text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] transition-all duration-500 ${status === 'recording' ? 'text-brand-primary' : 'text-brand-tint'}`}>
                    {status === 'idle' && "Start answer"}
                    {status === 'recording' && "Listening... tap when done"}
                    {status === 'transcribing' && "Preparing your answer"}
                    {status === 'error' && (error || "Please try again")}
                </p>
                {status === 'recording' && (
                    <div className="flex items-center gap-4">
                        <span className="tabular-nums text-sm font-semibold text-white">{formatElapsed(elapsedSeconds)}</span>
                        <button
                            type="button"
                            onClick={cancelRecording}
                            className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark rounded-md px-2 py-1"
                        >
                            Start over
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PushToTalkInput;
