// How a spirit moves the planchette: the way fingers move wood. A pause before
// the wood gives, a smooth glide that bows a little, a slide past the glyph and
// a pull back, and a faint unsteadiness that never quite stops. Each spirit's
// pace and habits come from its MotionStyle (shared/presence.ts).

import type { MotionStyle } from "../../shared/presence";
import { elementById, type Point } from "../board/layout";
import type { BoardView } from "../board/render";
import type { Ticker } from "../ticker";
import type { Planchette } from "./planchette";

/** Motion when no spirit is present: the lock answering NO, the board waking. */
export const STILL_AIR: MotionStyle = {
  speed: 800,
  curve: 0.1,
  tremor: 1.5,
  rest: 450,
  wordRest: 500,
  overshoot: 4,
  hesitation: 120,
};

/** How a hand moves from rest to rest: no jolt as it sets off or as it stops. */
const minimumJerk = (u: number) => u * u * u * (10 + u * (6 * u - 15));
const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;

const bezier = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

/** The slow wander of fingers resting on wood: smooth, never repeating, centred on 0. */
function unsteadiness(t: number): Point {
  return {
    x: 0.5 * Math.sin(t * 4.1 + 1.3) + 0.3 * Math.sin(t * 9.7 + 0.4) + 0.2 * Math.sin(t * 17.3 + 2.2),
    y: 0.5 * Math.sin(t * 3.7 + 0.2) + 0.3 * Math.sin(t * 8.9 + 2.9) + 0.2 * Math.sin(t * 15.1 + 1.1),
  };
}

export interface GlideOptions {
  speed?: number;
  curve?: number;
  overshoot?: number;
  hesitation?: number;
}

export class Possessor {
  style: MotionStyle = STILL_AIR;
  /** The last glyph the planchette settled on. */
  lastTarget: string | null = null;
  /** Where the spirit means the glass to be, before the fingers' unsteadiness. */
  private aim: Point = { x: 0, y: 0 };
  /** Where the planchette was last put, to notice when the sitters have moved it since. */
  private shown: Point = { x: NaN, y: NaN };
  /** 0 at rest, 1 in full motion: moving fingers shake more. */
  private stir = 0;
  /** Spirit time in seconds, which drives the unsteadiness. */
  private clock = 0;
  private lastFrame = 0;

  constructor(
    private readonly planchette: Planchette,
    private readonly view: BoardView,
    private readonly ticker: Ticker,
    /** Tests run the spirits faster than life. */
    private readonly speedFactor = 1,
  ) {}

  /** Runs step(u, seconds) every frame until u reaches 1, moving the planchette as it goes. */
  private animate(ms: number, step: (u: number, seconds: number) => void): Promise<void> {
    const duration = Math.max(1, ms / this.speedFactor);
    const start = performance.now();
    return new Promise((resolve) => {
      this.ticker.add((now) => {
        const u = Math.min(1, (now - start) / duration);
        step(u, ((now - start) * this.speedFactor) / 1000);
        this.show(now);
        if (u < 1) return true;
        resolve();
        return false;
      });
    });
  }

  /** Puts the planchette where the spirit aims, give or take the fingers' unsteadiness. */
  private show(now: number): void {
    this.clock += Math.min(0.1, Math.max(0, now - this.lastFrame) / 1000) * this.speedFactor;
    this.lastFrame = now;
    const wander = this.wander();
    this.planchette.drive({ x: this.aim.x + wander.x, y: this.aim.y + wander.y });
    this.planchette.tilt = 2.2 * unsteadiness(this.clock * 0.3 + 7).y;
    this.shown = { ...this.planchette.pos };
  }

  private wander(): Point {
    const n = unsteadiness(this.clock);
    const k = this.style.tremor * (0.35 + 0.65 * this.stir);
    return { x: n.x * k, y: n.y * k };
  }

  /** Picks up from wherever the planchette is now, e.g. after the sitters moved it. */
  private sync(): void {
    const p = this.planchette.pos;
    if (Math.hypot(p.x - this.shown.x, p.y - this.shown.y) > 0.5 || Number.isNaN(this.shown.x)) {
      const wander = this.wander();
      this.aim = { x: p.x - wander.x, y: p.y - wander.y };
      this.lastFrame = performance.now();
    }
  }

  /** Waits in step with the spirits, without touching the planchette. */
  wait(ms: number): Promise<void> {
    const end = performance.now() + ms / this.speedFactor;
    return new Promise((resolve) => {
      this.ticker.add((now) => {
        if (now < end) return true;
        resolve();
        return false;
      });
    });
  }

  async glide(to: Point, options: GlideOptions = {}): Promise<void> {
    this.sync();
    const from = { ...this.aim };
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < 1) return;
    const ux = (to.x - from.x) / d;
    const uy = (to.y - from.y) / d;
    const speed = options.speed ?? this.style.speed;
    const curve = options.curve ?? this.style.curve;
    const hesitation = options.hesitation ?? this.style.hesitation;

    // The moment before the wood gives: the fingers press and it creeps a hair.
    if (hesitation > 0) {
      const creep = Math.min(3, d * 0.02);
      await this.animate(hesitation * (0.15 + 0.85 * Math.random() ** 2), (u) => {
        const k = creep * easeInOutSine(u);
        this.aim = { x: from.x + ux * k, y: from.y + uy * k };
        this.stir = 0.25 * Math.sin(Math.PI * u);
      });
    }

    // A glide that bows to one side and runs a little past the glyph.
    const start = { ...this.aim };
    const bend = d * curve * (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
    const control = { x: (start.x + to.x) / 2 - uy * bend, y: (start.y + to.y) / 2 + ux * bend };
    const tx = to.x - control.x;
    const ty = to.y - control.y;
    const tl = Math.hypot(tx, ty) || 1;
    const past = Math.min(options.overshoot ?? this.style.overshoot, d * 0.12) * (0.5 + Math.random() * 0.5);
    const end = { x: to.x + (tx / tl) * past, y: to.y + (ty / tl) * past };
    await this.animate(180 + (1000 * Math.sqrt(400 * d)) / speed, (u) => {
      this.aim = bezier(start, control, end, minimumJerk(u));
      this.stir = Math.sin(Math.PI * u);
    });

    // The fingers pull it back onto the glyph.
    if (past > 0.5) {
      await this.animate(140 + past * 10, (u) => {
        const k = easeInOutSine(u);
        this.aim = { x: end.x + (to.x - end.x) * k, y: end.y + (to.y - end.y) * k };
        this.stir = 0.3 * Math.sin(Math.PI * u);
      });
    }
    this.aim = { ...to };
    this.stir = 0;
  }

  /** Glides to a glyph in the spirit's own manner, calls arrive, and rests there. */
  async visit(id: string, arrive: (id: string) => void): Promise<void> {
    const el = elementById(this.view.layout, id);
    if (!el) return;
    if (id === this.lastTarget) {
      // A double letter: slide off the glyph and come back, as a real planchette must.
      const { rest } = this.view.layout;
      const away = Math.hypot(rest.x - el.x, rest.y - el.y) || 1;
      const reach = Math.min(90, away);
      await this.glide(
        { x: el.x + ((rest.x - el.x) / away) * reach, y: el.y + ((rest.y - el.y) / away) * reach },
        { overshoot: 0, hesitation: 0 },
      );
    }
    // The glass seldom stops dead centre on a glyph.
    await this.glide({
      x: el.x + (Math.random() * 2 - 1) * el.rx * 0.18,
      y: el.y + (Math.random() * 2 - 1) * el.ry * 0.18,
    });
    this.lastTarget = id;
    arrive(id);
    await this.linger(this.style.rest);
  }

  /** A sharp move straight to a glyph, used when the board itself refuses. */
  async lunge(id: string, arrive: (id: string) => void): Promise<void> {
    const el = elementById(this.view.layout, id);
    if (!el) return;
    await this.glide({ x: el.x, y: el.y }, { speed: 2200, curve: 0.03, overshoot: 14, hesitation: 0 });
    this.lastTarget = id;
    arrive(id);
    await this.linger(250);
  }

  /** Drifts a little toward the middle between words. */
  async wordBreak(): Promise<void> {
    this.sync();
    const p = this.aim;
    const r = this.view.layout.rest;
    await this.glide(
      { x: p.x + (r.x - p.x) * 0.22, y: p.y + (r.y - p.y) * 0.22 },
      { speed: this.style.speed * 0.6, overshoot: 0, hesitation: 0 },
    );
    await this.linger(this.style.wordRest);
  }

  home(): Promise<void> {
    return this.glide(this.view.layout.rest, { speed: this.style.speed * 0.6, overshoot: 0 });
  }

  /** Circles slowly around the middle of the board until the returned stop() is called. */
  circle(): () => Promise<void> {
    let stopped = false;
    const done = (async () => {
      const { rest, width, height } = this.view.layout;
      await this.glide(rest, { speed: Math.max(500, this.style.speed * 0.7), overshoot: 0, hesitation: 0 });
      if (stopped) return;
      const a = width * 0.055;
      const b = height * 0.045;
      const start = performance.now();
      let last = start;
      let angle = 0;
      await new Promise<void>((resolve) => {
        this.ticker.add((now) => {
          if (stopped) {
            resolve();
            return false;
          }
          const t = ((now - start) * this.speedFactor) / 1000;
          const dt = (Math.min(100, now - last) * this.speedFactor) / 1000;
          last = now;
          // Spirals out into the circling, and the circles breathe a little.
          const ramp = easeInOutSine(Math.min(1, t / 1.6));
          angle += dt * ((2 * Math.PI) / 3.4) * ramp;
          const r = ramp * (0.85 + 0.15 * Math.sin(t * 0.8));
          this.aim = { x: rest.x + a * r * Math.sin(angle), y: rest.y - b * r * Math.cos(angle) };
          this.stir = 0.6 * ramp;
          this.show(now);
          return true;
        });
      });
      this.stir = 0;
    })();
    return () => {
      stopped = true;
      return done;
    };
  }

  /** The planchette stirs as a spirit takes hold of it: a small slide one way, then back. */
  async jolt(): Promise<void> {
    this.sync();
    const c = { ...this.aim };
    const a = Math.random() * Math.PI * 2;
    const nudge = (k: number) => ({ x: c.x + Math.cos(a) * k, y: c.y + Math.sin(a) * k });
    const quick = { speed: 420, curve: 0, overshoot: 0, hesitation: 0 };
    await this.glide(nudge(18), quick);
    await this.glide(nudge(-7), quick);
    await this.glide(c, quick);
  }

  /** An uneasy back and forth, when a spirit falls silent. */
  async tremble(): Promise<void> {
    this.sync();
    const c = { ...this.aim };
    const a = Math.random() * Math.PI;
    await this.animate(1100, (u, t) => {
      const k = 7 * Math.sin(t * 11) * Math.sin(Math.PI * u);
      this.aim = { x: c.x + Math.cos(a) * k, y: c.y + Math.sin(a) * k };
      this.stir = 0.5;
    });
    this.aim = c;
    this.stir = 0;
  }

  /** Rests on the spot, fingers still faintly unsteady. */
  private linger(ms: number): Promise<void> {
    return this.animate(ms, () => {
      this.stir = 0;
    });
  }
}
