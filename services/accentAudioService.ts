/**
 * services/accentAudioService.ts
 * Browser-native reference voice generator ($0 cost).
 * Provides high-fidelity British (en-GB) and American (en-US) pronunciation
 * models with normal (1.0x) and slow instructional (0.8x) playback speeds.
 */

export interface AccentVoiceOptions {
  locale: 'en-GB' | 'en-US';
  rate?: number; // 0.8 to 1.0
  pitch?: number;
}

class AccentAudioService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
    }
  }

  private initVoices() {
    if (!this.synth) return;
    const load = () => {
      this.voices = this.synth!.getVoices();
      if (this.voices.length > 0) {
        this.voicesLoaded = true;
      }
    };

    load();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = load;
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.synth);
  }

  /**
   * Find the most natural/authoritative voice matching the requested locale.
   */
  private selectVoice(locale: 'en-GB' | 'en-US'): SpeechSynthesisVoice | null {
    if (!this.voices.length && this.synth) {
      this.voices = this.synth.getVoices();
    }

    const normalizedLocale = locale.toLowerCase();

    // Priority 1: Natural / Online neural voices
    const naturalVoice = this.voices.find(v => 
      v.lang.toLowerCase().replace('_', '-').startsWith(normalizedLocale) &&
      (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Neural'))
    );
    if (naturalVoice) return naturalVoice;

    // Priority 2: Any voice matching the specific dialect prefix
    const dialectVoice = this.voices.find(v => 
      v.lang.toLowerCase().replace('_', '-').startsWith(normalizedLocale)
    );
    if (dialectVoice) return dialectVoice;

    // Priority 3: Fallback to any English voice
    return this.voices.find(v => v.lang.toLowerCase().startsWith('en')) || null;
  }

  /**
   * Speak the target sentence or word with exact accent configuration.
   */
  public speak(text: string, options: AccentVoiceOptions): Promise<void> {
    if (!this.synth) {
      return Promise.reject(new Error('Speech synthesis is not supported on this browser.'));
    }

    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.synth!.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.locale;
      utterance.rate = options.rate ?? 0.9;
      utterance.pitch = options.pitch ?? 1.0;

      const voice = this.selectVoice(options.locale);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        if (e.error === 'canceled') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${e.error}`));
        }
      };

      this.synth!.speak(utterance);
    });
  }

  /**
   * Speak a single word with crisp isolated articulation ($0 cost).
   */
  public async speakWord(word: string, locale: 'en-GB' | 'en-US'): Promise<void> {
    const clean = word.replace(/[^a-zA-Z'-]/g, '').trim();
    if (!clean) return;
    return this.speak(clean, { locale, rate: 0.85, pitch: 1.0 });
  }

  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

export const accentAudioService = new AccentAudioService();
