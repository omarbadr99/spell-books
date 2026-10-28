// Every sound is synthesized with Web Audio, so there are no audio files: the
// spirit's drone, the candle's crackle, the planchette's scrape, chimes on
// letters, the wind, and the swells as the board forms and breaks up.

import type { SpiritSound } from "../../shared/presence";

const MUTE_KEY = "spirit-board:muted";
const VOLUME = 0.9;
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const WAVE_LEVEL: Record<SpiritSound["wave"], number> = { sine: 1, triangle: 0.8, sawtooth: 0.3 };

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
  private windGain!: GainNode;
  private windBand!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private stopDrone: ((at: number) => void) | null = null;
  private crackleTimer = 0;
  private lastScrape = 0;
  private lastWind = 0;
  private room: GainNode | null = null;
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

    // The wind: noise through a band that rises and narrows into a moan as it blows harder.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    this.windBand = this.filter("bandpass", 260, 0.8);
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    air.connect(this.windBand).connect(this.windGain).connect(this.master);
    air.start(0, 0.7);
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

  /** Called every frame with how hard the wind is blowing, 0..1. */
  wind(level: number): void {
    if (!this.ctx || Math.abs(level - this.lastWind) < 0.01) return;
    this.lastWind = level;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.22 * level * level, t, 0.25);
    this.windBand.frequency.setTargetAtTime(220 + 900 * level, t, 0.3);
    this.windBand.Q.setTargetAtTime(0.8 + 2.6 * level, t, 0.3);
  }

  /** The spirit arrives: its drone swells, and now and then the candle crackles. */
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
    window.setTimeout(() => this.crackle(), 1400);
    const again = () => {
      this.crackleTimer = window.setTimeout(() => {
        this.crackle();
        again();
      }, 26_000 + Math.random() * 22_000);
    };
    again();
  }

  /** The spirit leaves: the drone fades away. */
  release(fade = 2.5): void {
    clearTimeout(this.crackleTimer);
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

  /** A letter rubbed off the paper: two soft strokes of an eraser. */
  rub(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wash(t, 0.12, 2600, 0.05);
    this.wash(t + 0.13, 0.1, 2200, 0.035);
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

  /**
   * START is pressed: a low chord swells and air rushes in as the board flies
   * together out of the dark, a shimmer as it lands, and then the room's quiet
   * tone stays.
   */
  awaken(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, peak] of [
      [55, 0.09],
      [82.5, 0.05],
      [110, 0.035],
      [164.8, 0.018],
    ]) {
      this.tone(f, t, 2.6, "sine", peak, 1.6);
    }
    const air = this.noiseSource();
    const low = this.filter("lowpass", 160, 0.9);
    low.frequency.setValueAtTime(160, t);
    low.frequency.exponentialRampToValueAtTime(2600, t + 3.1);
    air.connect(low).connect(this.envelope(t, 2.3, 0.06, 1.7)).connect(this.master);
    air.start(t, Math.random());
    air.stop(t + 4.3);
    [1, 5 / 4, 3 / 2, 2, 5 / 2].forEach((k, i) => this.tone(392 * k, t + 3.1 + i * 0.08, 1.5, "sine", 0.011));
    this.roomTone();
  }

  /** The room, very quietly: low air, and a hum almost too deep to hear. */
  private roomTone(): void {
    if (this.room) return;
    const ctx = this.ctx!;
    this.room = ctx.createGain();
    this.room.gain.value = 0;
    this.room.gain.setTargetAtTime(1, ctx.currentTime + 2, 3);
    this.room.connect(this.master);
    const air = this.noiseSource();
    const level = ctx.createGain();
    level.gain.value = 0.022;
    air.connect(this.filter("lowpass", 300, 0.7)).connect(level).connect(this.room);
    air.start(0, 1.3);
    const hum = ctx.createOscillator();
    hum.frequency.value = 41;
    const humLevel = ctx.createGain();
    humLevel.gain.value = 0.02;
    hum.connect(humLevel).connect(this.room);
    hum.start();
  }

  /** The board wakes after the right word. */
  wake(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(65, t, 2.6, "sine", 0.14, 0.5);
    for (const [i, r] of [1, 5 / 4, 3 / 2, 2].entries()) this.tone(392 * r, t + 0.25 + i * 0.12, 1.6, "sine", 0.03);
  }

  /** The candle crackles: a scatter of tiny pops over a soft rush. */
  crackle(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    for (let i = 0; i < 30; i++) {
      this.burst(t + Math.random() * 2.6, 0.01 + Math.random() * 0.02, "bandpass", 1500 + Math.random() * 2500, 1.5, 0.05 + Math.random() * 0.07);
    }
    this.wash(t, 2.8, 250, 0.08);
  }

  /** The farewell: wind rises and falls away, and a last soft chord. */
  farewell(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const air = this.noiseSource();
    const band = this.filter("bandpass", 300, 0.9);
    band.frequency.setValueAtTime(300, t);
    band.frequency.exponentialRampToValueAtTime(1100, t + 2.2);
    band.frequency.exponentialRampToValueAtTime(260, t + 5.5);
    air.connect(band).connect(this.envelope(t, 1.8, 0.09, 3.6)).connect(this.master);
    air.start(t, Math.random());
    air.stop(t + 5.6);
    [1, 5 / 4, 3 / 2, 15 / 8].forEach((k, i) => this.tone(220 * k, t + 1.6 + i * 0.22, 2.4, "sine", 0.018, 0.4));
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
}
