/**
 * Web Audio API Sound Effects Synthesizer for Vintage Vibe ERP
 *
 * Synthesizes pure harmonic audio waveforms directly in the browser:
 * 1. playCashChime(): Crisp, luxury dual-tone gold chime on sale claim.
 * 2. playAuctionGavel(): Resonant wooden gavel strike on lot closed / auto-released.
 * 3. playTimerTick(): Subtle high-frequency tick for final countdown seconds.
 * 4. playBreakEvenFanfare(): Ascending celebratory chord when bale cost is fully recovered.
 *
 * Fully zero-dependency, works offline, respects user mute settings.
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    try {
      const saved = localStorage.getItem('vv_sound_effects_enabled');
      if (saved !== null) {
        this.soundEnabled = saved === 'true';
      }
    } catch (_) {}
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public toggleSound(): boolean {
    this.soundEnabled = !this.soundEnabled;
    try {
      localStorage.setItem('vv_sound_effects_enabled', String(this.soundEnabled));
    } catch (_) {}
    if (this.soundEnabled) {
      this.playCashChime();
    }
    return this.soundEnabled;
  }

  private getContext(): AudioContext | null {
    if (!this.soundEnabled) return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch (e) {
      return null;
    }
  }

  /**
   * Luxury Golden Bell Chime (Ding! 🪙)
   * Plays a pristine 784 Hz + 1175 Hz harmonic chime with exponential decay
   */
  public playCashChime() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Harmonic 1 (Pure Sine, G5 ~ 784 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(784, now);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.2);

      // Harmonic 2 (Triangle chime shimmer, D6 ~ 1175 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1175, now + 0.06);
      gain2.gain.setValueAtTime(0.32, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 1.4);
    } catch (_) {}
  }

  /**
   * Wooden Auction Gavel Strike
   * Plays a low-frequency percussive impact
   */
  public playAuctionGavel() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.22);

      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (_) {}
  }

  /**
   * Subtle Countdown Tick
   */
  public playTimerTick() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (_) {}
  }

  /**
   * Bale Break-Even Horizon Fanfare
   * Ascending 4-note harmonic triad (C5 - E5 - G5 - C6)
   */
  public playBreakEvenFanfare() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const start = ctx.currentTime + i * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.7);
      });
    } catch (_) {}
  }
}

export const soundEffects = new SoundEffectsEngine();
export default soundEffects;
