class AudioService {
    private ctx: AudioContext | null = null;

    private init() {
        if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                this.ctx = new AudioCtx();
            } catch {
                this.ctx = null;
            }
        }
    }

    private playTone(freq: number, type: OscillatorType, duration: number, volume: number) {
        try {
            this.init();
            if (!this.ctx) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch {
            // Ignore audio playback failures in environments without Web Audio support
        }
    }

    playConfirm() {
        this.playTone(880, 'sine', 0.15, 0.05);
        setTimeout(() => this.playTone(1320, 'sine', 0.2, 0.03), 50);
    }

    playNotify() {
        this.playTone(1760, 'sine', 0.3, 0.02);
    }

    playStart() {
        this.playTone(440, 'triangle', 0.1, 0.04);
        setTimeout(() => this.playTone(660, 'triangle', 0.1, 0.04), 80);
        setTimeout(() => this.playTone(880, 'triangle', 0.25, 0.05), 160);
    }

    playEnd() {
        this.playTone(523.25, 'sine', 0.2, 0.04);
        setTimeout(() => this.playTone(392, 'sine', 0.3, 0.03), 100);
    }

    playWarning() {
        this.playTone(330, 'sawtooth', 0.2, 0.04);
    }
}

export const audioService = new AudioService();
