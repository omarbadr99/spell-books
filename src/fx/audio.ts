// Every sound is synthesized with Web Audio, so there are no audio files: a drone
// per spirit, the planchette's scrape, chimes on letters, and signature sounds.

import type { Signature, SpiritSound } from "../../shared/presence";

const MUTE_KEY = "spirit-board:muted";
const VOLUME = 0.9;
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const WAVE_LEVEL: Record<SpiritSound["wave"], number> = { sine: 1, triangle: 0.8, sawtooth: 0.3, square: 0.26 };

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export class SoundScape {
  muted = readMuted();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private droneBus!: GainNode;
  private scrapeGain!: GainNode;
  private noise!: AudioBuffer;
  private stopDrone: ((at: number) => void) | null = null;
  private signatureTimer = 0;
  private lastScrape = 0;
  private root = 147;

  /** Browsers only allow sound after a gesture, so call this from one. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(compressor);
    this.droneBus = ctx.createGain();
    this.droneBus.gain.value = 0;
    this.droneBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // The scrape of wood on wood: looping noise, louder the faster the planchette moves.
    const scrape = ctx.createBufferSource();
    scrape.buffer = this.noise;
    scrape.loop = true;
    const band = this.filter("bandpass", 620, 0.8);
    const low = this.filter("lowpass", 1700, 0.7);
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    scrape.connect(band).connect(low).connect(this.scrapeGain).connect(this.master);
    scrape.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // Not remembered across visits; fine.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : VOLUME, this.ctx.currentTime, 0.1);
  }

  /** Called every frame with the planchette's speed in board units per second. */
  scrape(speed: number): void {
    if (!this.ctx) return;
    const level = Math.min(1, speed / 1800) ** 1.3 * 0.22;
    if (Math.abs(level - this.lastScrape) < 0.004) return;
    this.lastScrape = level;
    this.scrapeGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  /** A spirit arrives: its drone swells and its signature sounds. */
  summon(sound: SpiritSound): void {
    if (!this.ctx) return;
    this.release(0.8);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.root = sound.drone;
    this.stopDrone = this.startDrone(sound);
    this.droneBus.gain.cancelScheduledValues(now);
    this.droneBus.gain.setValueAtTime(this.droneBus.gain.value, now);
    this.droneBus.gain.linearRampToValueAtTime(0.55, now + 3.5);
    window.setTimeout(() => this.signature(sound.signature), 1400);
    const again = () => {
      this.signatureTimer = window.setTimeout(() => {
        this.signature(sound.signature);
        again();
      }, 26_000 + Math.random() * 22_000);
    };
    again();
  }

  /** The spirit leaves: the drone fades away. */
  release(fade = 2.5): void {
    clearTimeout(this.signatureTimer);
    if (!this.ctx || !this.stopDrone) return;
    const now = this.ctx.currentTime;
    this.droneBus.gain.cancelScheduledValues(now);
    this.droneBus.gain.setValueAtTime(this.droneBus.gain.value, now);
    this.droneBus.gain.linearRampToValueAtTime(0, now + fade);
    this.stopDrone(now + fade + 0.1);
    this.stopDrone = null;
  }

  /** The planchette settles on a glyph. */
  chime(index: number): void {
    if (!this.ctx) return;
    const f = this.root * 4 * PENTATONIC[index % PENTATONIC.length];
    const t = this.ctx.currentTime;
    this.tone(f, t, 1.1, "sine", 0.07);
    this.tone(f * 3, t, 0.3, "triangle", 0.012);
  }

  /** The sitters pick a letter: a softer knock. */
  knock(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.06, "lowpass", 420, 1, 0.22);
    this.tone(this.root * 2, t, 0.35, "sine", 0.03);
  }

  tap(): void {
    if (this.ctx) this.burst(this.ctx.currentTime, 0.014, "bandpass", 2400, 4, 0.2);
  }

  /** Candles gutter out. */
  gutter(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const low = this.filter("lowpass", 1400, 0.8);
    low.frequency.setValueAtTime(1400, t);
    low.frequency.exponentialRampToValueAtTime(160, t + 0.8);
    const g = this.envelope(t, 0.05, 0.12, 0.9);
    src.connect(low).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1);
  }

  /** The board wakes after the right word. */
  wake(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(65, t, 2.6, "sine", 0.14, 0.5);
    for (const [i, r] of [1, 5 / 4, 3 / 2, 2].entries()) this.tone(392 * r, t + 0.25 + i * 0.12, 1.6, "sine", 0.03);
  }

  signature(signature: Signature): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const r = this.root;
    switch (signature) {
      case "musicbox":
        for (let i = 0; i < 6; i++) {
          const f = r * 4 * PENTATONIC[Math.floor(Math.random() * 5)] * (Math.random() < 0.3 ? 2 : 1);
          this.tone(f, t + i * 0.3, 1.3, "sine", 0.05);
          this.tone(f * 2, t + i * 0.3, 0.5, "triangle", 0.012);
        }
        break;
      case "waves":
        for (const start of [0, 2.6]) this.wash(t + start, 4.2, 900, 0.13);
        this.horn(t + 1.2, 87);
        break;
      case "hum":
        [5 / 4, 3 / 2, 5 / 4, 1, 9 / 8].forEach((k, i) => this.tone(r * 2 * k, t + i * 0.46, 0.5, "sine", 0.04, 0.06, 6));
        break;
      case "telegraph":
        for (const at of [0, 0.12, 0.24, 0.5, 0.62, 0.9, 1.02, 1.14, 1.42]) this.burst(t + at, 0.014, "bandpass", 2400, 4, 0.18);
        break;
      case "bell":
        [[1, 4, 0.08], [2, 3, 0.04], [2.76, 2.4, 0.03], [4.07, 1.6, 0.015], [5.4, 1.2, 0.01]].forEach(([k, d, g]) =>
          this.tone(r * 2 * k, t, d, "sine", g, 0.004),
        );
        break;
      case "whispers":
        for (let i = 0; i < 3; i++) this.whisper(t + i * 0.75, i % 2 ? [2400, 900] : [900, 2400]);
        break;
      case "clock":
        for (let i = 0; i < 6; i++) this.burst(t + i * 0.5, 0.02, "bandpass", i % 2 ? 1300 : 1900, 6, 0.14);
        break;
      case "gramophone":
        for (let i = 0; i < 40; i++) this.burst(t + Math.random() * 2.6, 0.004, "highpass", 3000, 0.7, 0.05);
        [1, 5 / 4, 3 / 2, 4 / 3].forEach((k, i) => this.tone(r * 2 * k, t + 0.3 + i * 0.55, 0.6, "triangle", 0.035, 0.03, 4));
        break;
      case "fire":
        for (let i = 0; i < 30; i++) {
          this.burst(t + Math.random() * 2.6, 0.01 + Math.random() * 0.02, "bandpass", 1500 + Math.random() * 2500, 1.5, 0.05 + Math.random() * 0.07);
        }
        this.wash(t, 2.8, 250, 0.08);
        break;
      case "pages":
        for (const at of [0, 0.7]) this.burst(t + at, 0.35, "bandpass", 3500, 0.8, 0.12);
        break;
      case "creak":
        for (const at of [0, 1.1]) this.creak(t + at);
        break;
      case "chiptune":
        [1, 5 / 4, 3 / 2, 2, 3 / 2, 5 / 4, 1, 2].forEach((k, i) => this.tone(r * 2 * k, t + i * 0.09, 0.08, "square", 0.03, 0.002));
        break;
    }
  }

  private startDrone(sound: SpiritSound): (at: number) => void {
    const ctx = this.ctx!;
    const filter = this.filter("lowpass", 700, 0.7);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth).connect(filter.frequency);
    const level = ctx.createGain();
    level.gain.value = 0.16 * WAVE_LEVEL[sound.wave];
    filter.connect(level).connect(this.droneBus);
    const oscillators = [
      [1, 0.5],
      [1.004, 0.4],
      [1.5, 0.22],
      [0.5, 0.35],
    ].map(([ratio, gain]) => {
      const o = ctx.createOscillator();
      o.type = sound.wave;
      o.frequency.value = sound.drone * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(filter);
      o.start();
      return o;
    });
    lfo.start();
    return (at) => [...oscillators, lfo].forEach((o) => o.stop(at));
  }

  private filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  private envelope(t: number, attack: number, peak: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, peak: number, attack = 0.006, vibrato = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + attack + dur);
    }
    o.connect(this.envelope(t, attack, peak, dur)).connect(this.master);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private burst(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number): void {
    const src = this.noiseSource();
    src.connect(this.filter(type, freq, q)).connect(this.envelope(t, 0.002, peak, dur)).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private wash(t: number, dur: number, cutoff: number, peak: number): void {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(this.filter("lowpass", cutoff, 0.6)).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private horn(t: number, freq: number): void {
    const ctx = this.ctx!;
    const low = this.filter("lowpass", 380, 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
    g.gain.setValueAtTime(0.07, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    low.connect(g).connect(this.master);
    for (const detune of [0, 0.6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq + detune;
      o.connect(low);
      o.start(t);
      o.stop(t + 2.6);
    }
  }

  private whisper(t: number, [from, to]: number[]): void {
    const src = this.noiseSource();
    const band = this.filter("bandpass", from, 9);
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + 1.4);
    src.connect(band).connect(this.envelope(t, 0.3, 0.09, 1.2)).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1.6);
  }

  private creak(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(115, t + 0.9);
    o.connect(this.filter("bandpass", 700, 4)).connect(this.envelope(t, 0.08, 0.06, 0.85)).connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }
}
