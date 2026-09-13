// Web Audio API Synthesizer for High-End Futuristic Luxury Haptic & Button Sounds
class LuxuryAudioManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastSoundTime: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vintage_luxury_audio_muted');
      this.isMuted = saved === 'true';
      this.attachGlobalListeners();
    }
  }

  private hasUserInteracted: boolean = false;

  private initCtx() {
    if (!this.hasUserInteracted) return;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch (_) {}
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && this.hasUserInteracted) {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vintage_luxury_audio_muted', String(this.isMuted));
    }
    if (!this.isMuted) {
      this.playCoolButtonSound();
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  // ULTRA COOL SOUND ON EVERY BUTTON CLICK
  // Modern, crisp, futuristic-luxury mechanical ceramic snap (Apple / Leica / Porsche haptic tap)
  public playCoolButtonSound(pitch = 1.0) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Layer 1: High crisp ceramic transient snap
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1400 * pitch, now);
      osc1.frequency.exponentialRampToValueAtTime(360 * pitch, now + 0.024);

      gain1.gain.setValueAtTime(0.09, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.025);

      // Layer 2: Warm weighted luxury body thump
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(240 * pitch, now);
      osc2.frequency.exponentialRampToValueAtTime(70 * pitch, now + 0.038);

      gain2.gain.setValueAtTime(0.07, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.04);
    } catch (e) {}
  }

  // Subtle luxury micro-tick on button hover
  public playCoolHoverSound() {
    if (this.isMuted || !this.hasUserInteracted || !this.ctx || this.ctx.state !== 'running') return;
    const nowMs = Date.now();
    // Throttle hover sounds so rapid mouse moves don't stutter
    if (nowMs - this.lastSoundTime < 60) return;
    this.lastSoundTime = nowMs;

    try {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2600, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.012);

      gain.gain.setValueAtTime(0.018, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.012);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.014);
    } catch (e) {}
  }

  // Harmonic luxury gold chime for theme toggle and wax seal
  public playGoldChime() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const freqs = [1046.5, 1318.51, 1567.98]; // C6, E6, G6
      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.035);

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0005, this.ctx.currentTime + idx * 0.035 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.035);
        osc.stop(this.ctx.currentTime + idx * 0.035 + 0.4);
      });
    } catch (e) {}
  }

  // Metallic 24K Gold Coin Toss & Spin Ring
  public playCoinFlipSound() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // High ring bell (coin toss ping)
      const freqs = [1864.66, 2349.32, 2793.83, 3729.31];
      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.015);

        gain.gain.setValueAtTime(0.045 / (idx + 1), now + idx * 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.015 + 0.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.015);
        osc.stop(now + idx * 0.015 + 0.85);
      });
    } catch (e) {}
  }

  // Royal Wax Seal Heavy Gold Stamp Impact Sound
  public playWaxSealSound() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Deep weighted brass seal press thud
      const oscThud = this.ctx.createOscillator();
      const gainThud = this.ctx.createGain();
      oscThud.type = 'sine';
      oscThud.frequency.setValueAtTime(120, now);
      oscThud.frequency.exponentialRampToValueAtTime(32, now + 0.12);

      gainThud.gain.setValueAtTime(0.2, now);
      gainThud.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      oscThud.connect(gainThud);
      gainThud.connect(this.ctx.destination);
      oscThud.start(now);
      oscThud.stop(now + 0.16);

      // Gold resonance harmonic chime
      const oscChime = this.ctx.createOscillator();
      const gainChime = this.ctx.createGain();
      oscChime.type = 'triangle';
      oscChime.frequency.setValueAtTime(880, now + 0.04);
      oscChime.frequency.exponentialRampToValueAtTime(1760, now + 0.28);

      gainChime.gain.setValueAtTime(0.06, now + 0.04);
      gainChime.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      oscChime.connect(gainChime);
      gainChime.connect(this.ctx.destination);
      oscChime.start(now + 0.04);
      oscChime.stop(now + 0.46);
    } catch (e) {}
  }

  public playMechanicalClick(pitch = 1.0) {
    this.playCoolButtonSound(pitch);
  }

  public playCancelBeep() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  public playChime() {
    this.playGoldChime();
  }

  public playCashChime() {
    this.playGoldChime();
  }

  // Automatically attach sound listeners to ALL buttons across the entire app
  private attachGlobalListeners() {
    if (typeof window === 'undefined') return;

    const unlockGesture = () => {
      this.hasUserInteracted = true;
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlockGesture, { once: true, capture: true });
    window.addEventListener('touchstart', unlockGesture, { once: true, capture: true });
    window.addEventListener('keydown', unlockGesture, { once: true, capture: true });

    window.addEventListener(
      'click',
      (e) => {
        this.hasUserInteracted = true;
        const target = (e.target as HTMLElement)?.closest(
          'button, [role="button"], .btn-3d, input[type="button"], input[type="submit"], nav a'
        );
        if (target) {
          this.playCoolButtonSound();
        }
      },
      true
    );

    window.addEventListener(
      'mouseover',
      (e) => {
        const target = (e.target as HTMLElement)?.closest(
          'button, [role="button"], .btn-3d, nav a'
        );
        if (target) {
          this.playCoolHoverSound();
        }
      },
      true
    );
  }
}

export const luxuryAudio = new LuxuryAudioManager();
