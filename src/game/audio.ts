export type SfxName =
  | 'swing'
  | 'oink'
  | 'hit'
  | 'bighit'
  | 'hurt'
  | 'roll'
  | 'jump'
  | 'truffle'
  | 'buy'
  | 'deny'
  | 'bell'
  | 'slam'
  | 'roar'
  | 'throw'
  | 'stun'
  | 'squeal'
  | 'chomp'
  | 'zap'
  | 'thunder'
  | 'pop'
  | 'splash'
  | 'clang'
  | 'shield'
  | 'shatter'
  | 'hiss'
  | 'sizzle'
  | 'hogdie'
  | 'win'
  | 'lose';

/** Tiny WebAudio synth so the game has sound without shipping any audio files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.45;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  dispose() {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf || this.muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  play(name: SfxName) {
    switch (name) {
      case 'swing':
        this.noise(0.12, 0.25, 1800, 'bandpass');
        break;
      case 'oink':
        this.tone(330, 190, 0.11, 'sawtooth', 0.22);
        this.tone(300, 170, 0.13, 'sawtooth', 0.2, 0.1);
        break;
      case 'hit':
        this.noise(0.1, 0.5, 900);
        this.tone(170, 70, 0.12, 'square', 0.25);
        break;
      case 'bighit':
        this.noise(0.22, 0.7, 700);
        this.tone(140, 40, 0.28, 'square', 0.35);
        this.tone(520, 260, 0.1, 'triangle', 0.2);
        break;
      case 'hurt':
        this.tone(520, 180, 0.22, 'sawtooth', 0.28);
        this.noise(0.12, 0.3, 1200);
        break;
      case 'roll':
        this.noise(0.22, 0.22, 2600, 'highpass');
        break;
      case 'jump':
        this.tone(260, 480, 0.12, 'triangle', 0.18);
        break;
      case 'truffle':
        this.tone(880, 1320, 0.08, 'sine', 0.22);
        this.tone(1320, 1760, 0.1, 'sine', 0.18, 0.06);
        break;
      case 'buy':
        this.tone(523, 523, 0.09, 'triangle', 0.25);
        this.tone(659, 659, 0.09, 'triangle', 0.25, 0.08);
        this.tone(784, 784, 0.09, 'triangle', 0.25, 0.16);
        this.tone(1046, 1046, 0.2, 'triangle', 0.25, 0.24);
        break;
      case 'deny':
        this.tone(160, 110, 0.16, 'square', 0.18);
        break;
      case 'bell':
        this.tone(660, 650, 1.3, 'sine', 0.35);
        this.tone(1325, 1310, 0.9, 'sine', 0.18);
        this.tone(1990, 1970, 0.5, 'sine', 0.1);
        this.tone(660, 650, 1.1, 'sine', 0.3, 0.42);
        this.tone(1325, 1310, 0.7, 'sine', 0.14, 0.42);
        break;
      case 'slam':
        this.noise(0.5, 0.9, 260);
        this.tone(90, 28, 0.5, 'sine', 0.6);
        break;
      case 'roar':
        this.tone(110, 62, 0.6, 'sawtooth', 0.3);
        this.tone(116, 58, 0.6, 'square', 0.14);
        break;
      case 'throw':
        this.noise(0.2, 0.3, 3200, 'bandpass');
        this.tone(900, 400, 0.15, 'triangle', 0.08);
        break;
      case 'stun':
        this.tone(900, 700, 0.1, 'triangle', 0.2);
        this.tone(700, 500, 0.1, 'triangle', 0.2, 0.1);
        this.tone(500, 300, 0.16, 'triangle', 0.2, 0.2);
        break;
      case 'squeal':
        this.tone(700, 2100, 0.2, 'sawtooth', 0.22);
        this.tone(2100, 900, 0.35, 'sawtooth', 0.2, 0.18);
        this.noise(0.4, 0.2, 3000, 'highpass');
        break;
      case 'chomp':
        this.noise(0.07, 0.3, 500);
        this.tone(150, 90, 0.08, 'square', 0.14);
        break;
      case 'zap':
        this.tone(1800, 200, 0.18, 'sawtooth', 0.18);
        this.noise(0.18, 0.25, 4000, 'highpass');
        break;
      case 'thunder':
        this.noise(0.16, 0.55, 4800, 'highpass');
        this.tone(2400, 180, 0.22, 'sawtooth', 0.24);
        this.tone(1400, 320, 0.18, 'square', 0.14, 0.04);
        this.noise(0.55, 0.65, 280, 'lowpass', 0.03);
        this.tone(105, 34, 0.48, 'sine', 0.45, 0.03);
        break;
      case 'pop':
        this.tone(420, 120, 0.12, 'square', 0.2);
        this.noise(0.1, 0.3, 1500);
        break;
      case 'splash':
        this.noise(0.26, 0.42, 1400, 'bandpass');
        this.tone(320, 740, 0.11, 'sine', 0.2);
        this.tone(520, 980, 0.09, 'sine', 0.15, 0.07);
        break;
      case 'clang':
        this.tone(1500, 950, 0.1, 'square', 0.16);
        this.tone(2300, 1800, 0.22, 'triangle', 0.14);
        this.noise(0.07, 0.28, 5200, 'highpass');
        break;
      case 'shield':
        this.tone(220, 660, 0.5, 'sawtooth', 0.14);
        this.tone(330, 990, 0.6, 'sine', 0.2, 0.08);
        this.tone(660, 1320, 0.5, 'sine', 0.12, 0.2);
        break;
      case 'shatter':
        this.noise(0.34, 0.5, 4200, 'highpass');
        this.tone(1700, 900, 0.14, 'triangle', 0.2);
        this.tone(1200, 500, 0.2, 'triangle', 0.18, 0.07);
        break;
      case 'hiss':
        this.noise(0.45, 0.26, 3600, 'highpass');
        this.tone(1100, 2200, 0.42, 'sine', 0.18);
        break;
      case 'sizzle':
        this.noise(0.28, 0.28, 2800, 'bandpass');
        this.tone(420, 220, 0.12, 'sine', 0.12);
        break;
      case 'hogdie':
        this.tone(640, 260, 0.24, 'sawtooth', 0.24);
        this.tone(440, 155, 0.36, 'triangle', 0.22, 0.14);
        this.noise(0.14, 0.22, 900);
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.28, 'triangle', 0.28, i * 0.13));
        break;
      case 'lose':
        [392, 349, 311, 233].forEach((f, i) => this.tone(f, f * 0.98, 0.34, 'sawtooth', 0.2, i * 0.2));
        break;
    }
  }
}
