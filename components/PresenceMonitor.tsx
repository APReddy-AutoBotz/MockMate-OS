
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface PresenceMonitorProps {
    historyCount?: number;
    isCompact?: boolean;
}

const PresenceMonitor: React.FC<PresenceMonitorProps> = ({ historyCount = 0, isCompact = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isMicActive, setIsMicActive] = useState(false);

    // Dynamic metrics that shift slightly as the session progresses
    const confidenceVal = Math.min(98, 85 + (historyCount * 2));
    const paceVal = 130 + Math.floor(Math.random() * 20);

    const metrics = [
        { label: 'Pace', value: paceVal.toString(), unit: 'WPM', color: 'text-brand-primary' },
        { label: 'Fillers', value: historyCount > 3 ? '1' : '0', unit: 'CT', color: 'text-alert-coral' },
        { label: 'Confidence', value: confidenceVal.toString(), unit: '%', color: 'text-brand-primary' },
    ];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let audioContext: AudioContext | null = null;
        let analyser: AnalyserNode | null = null;
        let dataArray: Uint8Array<ArrayBuffer> | null = null;

        const setupAudio = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 256;
                const bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
                setIsMicActive(true);
            } catch (e) {
                setIsMicActive(false);
            }
        };

        setupAudio();

        let phase = 0;
        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.strokeStyle = isMicActive ? '#FFBC03' : 'rgba(168, 197, 218, 0.35)';
            ctx.lineWidth = 1.5;

            if (analyser && dataArray) {
                analyser.getByteFrequencyData(dataArray);
                const width = canvas.width;
                const height = canvas.height;
                const sliceWidth = width / dataArray.length;
                let x = 0;

                for (let i = 0; i < dataArray.length; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = (v * height) / 2;

                    if (i === 0) ctx.moveTo(x, height / 2);
                    else ctx.lineTo(x, height / 2 + (i % 2 === 0 ? y / 4 : -y / 4));

                    x += sliceWidth;
                }
            } else {
                for (let x = 0; x < canvas.width; x++) {
                    const y = Math.sin(x * 0.05 + phase) * 8 + canvas.height / 2;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                phase += 0.05;
            }

            ctx.stroke();
            animationId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationId);
            if (audioContext) audioContext.close();
        };
    }, [isMicActive]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`group relative flex items-center justify-center bg-white/[0.03] backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl pointer-events-auto transition-all duration-300 ${isCompact ? 'gap-6 px-6 py-2' : 'gap-10 px-8 py-3.5'
                }`}
        >
            <div className={`flex items-center gap-4 pr-10 border-r border-white/10 ${isCompact ? 'pr-6' : 'pr-10'}`}>
                <canvas
                    ref={canvasRef}
                    width={isCompact ? 60 : 100}
                    height={isCompact ? 16 : 24}
                    className="opacity-70 group-hover:opacity-100 transition-opacity"
                />
                <span className={`font-black uppercase tracking-[0.12em] ${isMicActive ? 'text-brand-primary' : 'text-brand-tint'} ${isCompact ? 'text-[7px]' : 'text-[9px]'}`}>
                    {isMicActive ? (isCompact ? 'Active' : 'Signal Active') : (isCompact ? 'IDLE' : 'Idle')}
                </span>
            </div>

            <div className={`flex ${isCompact ? 'gap-8' : 'gap-12'}`}>
                {metrics.map((m) => (
                    <div key={m.label} className={`flex flex-col items-center md:items-start ${isCompact ? 'min-w-[40px]' : 'min-w-[60px]'}`}>
                        <span className={`font-black text-brand-tint uppercase tracking-[0.12em] mb-1 ${isCompact ? 'text-[7px]' : 'text-[9px]'}`}>{m.label}</span>
                        <div className="flex items-baseline gap-1.5">
                            <span className={`font-mono font-black ${m.color} ${isCompact ? 'text-xs' : 'text-sm'}`}>{m.value}</span>
                            <span className={`font-mono font-bold text-brand-tint/80 uppercase ${isCompact ? 'text-[7px]' : 'text-[9px]'}`}>{m.unit}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-brand-dark border border-white/10 rounded-full opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-50 shadow-2xl scale-95 group-hover:scale-100">
                <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.12em]">
                    Speaking signals: <span className="text-white">Based on {historyCount} responses</span>
                </p>
            </div>
        </motion.div>
    );
};

export default PresenceMonitor;
