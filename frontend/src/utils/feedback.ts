/**
 * Feedback Utilities
 * Provides synthesized audio chimes, countdown beeps via Web Audio API,
 * haptic vibration for target alignment and capture,
 * and optional spoken voice guidance via browser SpeechSynthesis.
 */

class FeedbackManager {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private voiceEnabled: boolean = true;
  private hapticsEnabled: boolean = true;
  private lastSpokenPhrase: string = '';
  private lastSpokenTime: number = 0;

  constructor() {
    // Check saved preferences
    if (typeof localStorage !== 'undefined') {
      const savedSound = localStorage.getItem('laveon_sound_enabled');
      if (savedSound !== null) this.soundEnabled = savedSound === 'true';
      const savedVoice = localStorage.getItem('laveon_voice_enabled');
      if (savedVoice !== null) this.voiceEnabled = savedVoice === 'true';
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('laveon_sound_enabled', String(enabled));
    }
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('laveon_voice_enabled', String(enabled));
    }
    if (!enabled) {
      this.cancelSpeech();
    }
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Spoken voice guidance using browser speech synthesis
   */
  public speak(text: string, force: boolean = false): void {
    if (!this.voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const now = Date.now();
    // Prevent duplicate rapid speech within 1.5 seconds unless forced
    if (!force && this.lastSpokenPhrase === text && now - this.lastSpokenTime < 1500) {
      return;
    }

    this.lastSpokenPhrase = text;
    this.lastSpokenTime = now;

    try {
      window.speechSynthesis.cancel(); // Stop prior utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.85;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferred = voices.find(
          (v) => (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Jenny')) && v.lang.startsWith('en')
        );
        if (preferred) utterance.voice = preferred;
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech errors ignored
    }
  }

  public cancelSpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Plays a subtle countdown beep during 3, 2, 1
   */
  public playCountdownBeep(second: number): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      // Pitch rises as countdown approaches 1: 520Hz -> 650Hz -> 820Hz
      const freq = second === 1 ? 820 : second === 2 ? 650 : 520;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio playback errors ignored
    }
  }

  /**
   * Celebratory chime when photo capture succeeds
   */
  public playCaptureChime(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      // Harmonic sweep 880Hz -> 1760Hz
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio errors ignored
    }
  }

  /**
   * Subtle click when target alignment locks
   */
  public playLockTick(): void {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // Ignored
    }
  }

  /**
   * Device vibration on alignment lock
   */
  public triggerHapticLock(): void {
    if (!this.hapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(35);
    } catch {
      // Ignored
    }
  }

  /**
   * Device vibration on capture (double pulse)
   */
  public triggerHapticCapture(): void {
    if (!this.hapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate([45, 35, 60]);
    } catch {
      // Ignored
    }
  }
}

export const feedback = new FeedbackManager();
