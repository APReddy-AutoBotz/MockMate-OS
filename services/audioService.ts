
class AudioService {
    private ctx: AudioContext | null = null;

    private init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    private playTone(freq: number, type: OscillatorType, duration: number, volume: number) {
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
    }

    playConfirm() {
        // Soft double-tap chime
        this.playTone(880, 'sine', 0.15, 0.05);
        setTimeout(() => this.playTone(1320, 'sine', 0.2, 0.03), 50);
    }

    playNotify() {
        // High, clear single chime
        this.playTone(1760, 'sine', 0.3, 0.02);
    }

    playStart() {
        // Rising warm tone
        this.playTone(440, 'sine', 0.5, 0.05);
        setTimeout(() => this.playTone(660, 'sine', 0.4, 0.03), 100);
    }

    playEnd() {
        // Falling gentle tone
        this.playTone(440, 'sine', 0.4, 0.04);
        setTimeout(() => this.playTone(220, 'sine', 0.6, 0.02), 150);
    }
}

export const audioService = new AudioService();
