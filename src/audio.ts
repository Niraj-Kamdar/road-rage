// Procedural Web Audio API Sound Engine for ARGON: ROAD RASH 3D
// Synthesizes engine roar, gear shifts, melee impacts, tire screech, police siren, synth bassline, race countdown, and UI audio

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted: boolean = false;
  private started: boolean = false;
  private beatTimer: number = 0;
  private beatIndex: number = 0;

  public init(): void {
    if (this.started) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Continuous motorcycle engine oscillators
      this.engineOsc = this.ctx.createOscillator();
      this.engineSubOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;

      this.engineOsc.type = 'sawtooth';
      this.engineSubOsc.type = 'triangle';
      this.engineOsc.frequency.value = 55;
      this.engineSubOsc.frequency.value = 27.5;
      this.engineGain.gain.value = 0.0;

      this.engineOsc.connect(filter);
      this.engineSubOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc.start();
      this.engineSubOsc.start();
      this.started = true;
    } catch {
      // Web Audio blocked or unavailable
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.06, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateEngine(
    speedMph: number,
    maxSpeedMph: number,
    nitroActive: boolean,
    dt: number,
    isOffRoad: boolean = false
  ): void {
    if (!this.ctx || !this.engineOsc || !this.engineSubOsc || !this.engineGain || this.muted)
      return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const ratio = Math.min(1.2, Math.max(0, speedMph / maxSpeedMph));
    // Simulate 5-speed gearbox RPM sawtooth curve
    const gearProgress = (ratio * 5) % 1;
    let baseFreq = 48 + ratio * 95 + gearProgress * 38 + (nitroActive ? 35 : 0);

    // Off-road rough sputter: modulate frequency with gritty terrain flutter
    if (isOffRoad && speedMph > 5) {
      const flutter = Math.sin(performance.now() * 0.05) * 12 + (Math.random() - 0.5) * 10;
      baseFreq = Math.max(35, baseFreq * 0.82 + flutter);
    }

    this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.03);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.03);
    const targetGain = isOffRoad
      ? 0.075 + ratio * 0.035
      : 0.055 + ratio * 0.045;
    this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.04);

    // Subtle driving bassline pulse while racing
    if (speedMph > 15) {
      this.beatTimer += dt;
      const stepDuration = nitroActive ? 0.14 : 0.18;
      if (this.beatTimer >= stepDuration) {
        this.beatTimer = 0;
        this.playBassStep(this.beatIndex++);
      }
    }
  }

  public stopEngine(): void {
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.08);
    }
  }

  /**
   * Plays arcade starting grid countdown tones for READY, STEADY, and GO!
   */
  public playCountdownBeep(stage: 'ready' | 'steady' | 'go'): void {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const now = this.ctx.currentTime;

      if (stage === 'ready' || stage === 'steady') {
        const freq = stage === 'ready' ? 440 : 554.37; // A4 -> C#5
        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        sub.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        sub.frequency.setValueAtTime(freq * 0.5, now);

        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        osc.connect(gain);
        sub.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        sub.start(now);
        osc.stop(now + 0.34);
        sub.stop(now + 0.34);
      } else {
        // 'go' — high-energy triad burst + throttle roar
        const freqs = [880, 1108.73, 1318.51];
        for (const f of freqs) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now);
          osc.frequency.exponentialRampToValueAtTime(f * 1.03, now + 0.45);

          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.55);
        }
        this.playEngineRev();
      }
    } catch {
      // Audio context not ready
    }
  }

  private playBassStep(step: number): void {
    if (!this.ctx || this.muted) return;
    const notes = [55, 55, 65.41, 55, 73.42, 65.41, 55, 49];
    const freq = notes[step % notes.length];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.028, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playSwing(): void {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, this.ctx.currentTime + 0.14);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.16);
  }

  public playHit(heavy: boolean = false): void {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = heavy ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(heavy ? 160 : 120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, this.ctx.currentTime + 0.22);

    gain.gain.setValueAtTime(heavy ? 0.24 : 0.16, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.24);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  public playCrash(): void {
    if (!this.ctx || this.muted) return;
    const bufferSize = this.ctx.sampleRate * 0.45;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.44);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  public playPickup(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(780, now + 0.07);
    osc.frequency.setValueAtTime(1040, now + 0.14);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /**
   * Synthesizes a turbocharger spool + afterburner whoosh when Nitro Overdrive triggers
   */
  public playNitroBurst(isPlayer: boolean = true): void {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      sub.type = 'triangle';
      const startFreq = isPlayer ? 180 : 140;
      const peakFreq = isPlayer ? 680 : 420;
      const dur = isPlayer ? 0.55 : 0.35;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(peakFreq, now + dur * 0.65);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 1.4, now + dur);

      sub.frequency.setValueAtTime(startFreq * 0.5, now);
      sub.frequency.exponentialRampToValueAtTime(peakFreq * 0.5, now + dur * 0.7);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1600, now + dur * 0.6);
      filter.Q.value = 1.8;

      const vol = isPlayer ? 0.18 : 0.075;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      sub.start(now);
      osc.stop(now + dur + 0.02);
      sub.stop(now + dur + 0.02);
    } catch {
      // Audio context not ready
    }
  }

  public playSirenBlip(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.linearRampToValueAtTime(920, now + 0.18);
    osc.frequency.linearRampToValueAtTime(640, now + 0.35);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.37);
  }

  public playUiHover(): void {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 0.035);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch {
      // Audio context not ready
    }
  }

  public playUiSelect(): void {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // Audio context not ready
    }
  }

  public playEngineRev(): void {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.55);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, now);
      filter.frequency.linearRampToValueAtTime(1100, now + 0.22);
      filter.frequency.linearRampToValueAtTime(420, now + 0.55);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.62);
    } catch {
      // Audio context not ready
    }
  }
}
