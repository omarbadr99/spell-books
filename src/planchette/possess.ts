// How a spirit moves the planchette: curved glides with a tremble, rests on each
// glyph, and the spirit's own tics (see MotionStyle in shared/presence.ts).

import type { MotionStyle } from "../../shared/presence";
import { elementById, type BoardElement, type Point } from "../board/layout";
import type { BoardView } from "../board/render";
import type { Ticker } from "../ticker";
import type { Planchette } from "./planchette";

/** Motion when no spirit is present: the lock answering NO, the board waking. */
export const STILL_AIR: MotionStyle = {
  speed: 900,
  curve: 0.15,
  wobble: 4,
  wobbleHz: 1.2,
  rest: 450,
  wordRest: 500,
  overshoot: 0,
  tic: "precise",
  ticChance: 0,
};

type Ease = (u: number) => number;

const easeInOutCubic: Ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
const easeInOutSine: Ease = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const easeInOutQuad: Ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const easeOutExpo: Ease = (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u));
const easeInOutBack = (s: number): Ease => {
  const c = s * 1.525;
  return (u) =>
    u < 0.5
      ? ((2 * u) ** 2 * ((c + 1) * 2 * u - c)) / 2
      : ((2 * u - 2) ** 2 * ((c + 1) * (2 * u - 2) + c) + 2) / 2;
};

function easeFor(style: MotionStyle): Ease {
  switch (style.tic) {
    case "heavy":
      return easeInOutSine;
    case "jerk":
      return easeOutExpo;
    case "precise":
      return easeInOutQuad;
    default:
      return style.overshoot > 0 ? easeInOutBack(style.overshoot) : easeInOutCubic;
  }
}

const bezier = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

export interface GlideOptions {
  speed?: number;
  curve?: number;
  wobble?: number;
  ease?: Ease;
}

export class Possessor {
  style: MotionStyle = STILL_AIR;
  /** The last glyph the planchette settled on. */
  lastTarget: string | null = null;
  /** Called for each telegraph-style tap. */
  onTap: () => void = () => {};
  private side = 1;

  constructor(
    private readonly planchette: Planchette,
    private readonly view: BoardView,
    private readonly ticker: Ticker,
    /** Tests run the spirits faster than life. */
    private readonly speedFactor = 1,
  ) {}

  /** Runs step(u, seconds) every frame until u reaches 1. */
  private animate(ms: number, step: (u: number, seconds: number) => void): Promise<void> {
    const duration = Math.max(1, ms / this.speedFactor);
    const start = performance.now();
    return new Promise((resolve) => {
      this.ticker.add((now) => {
        const u = Math.min(1, (now - start) / duration);
        step(u, ((now - start) * this.speedFactor) / 1000);
        if (u < 1) return true;
        resolve();
        return false;
      });
    });
  }

  wait(ms: number): Promise<void> {
    return this.animate(ms, () => {});
  }

  async glide(to: Point, options: GlideOptions = {}): Promise<void> {
    const from = { ...this.planchette.pos };
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < 2) {
      this.planchette.drive(to);
      return;
    }
    const speed = options.speed ?? this.style.speed;
    const curve = options.curve ?? this.style.curve;
    const wobble = options.wobble ?? this.style.wobble;
    const ease = options.ease ?? easeFor(this.style);
    const nx = -(to.y - from.y) / d;
    const ny = (to.x - from.x) / d;
    this.side = this.style.tic === "sway" ? -this.side : Math.random() < 0.5 ? -1 : 1;
    const bend = d * curve * this.side * (0.55 + Math.random() * 0.45);
    const control = { x: (from.x + to.x) / 2 + nx * bend, y: (from.y + to.y) / 2 + ny * bend };
    const phase = Math.random() * Math.PI * 2;
    await this.animate(150 + (d / speed) * 1000, (u, t) => {
      const p = bezier(from, control, to, ease(u));
      const w = wobble * Math.sin(2 * Math.PI * this.style.wobbleHz * t + phase) * Math.sin(Math.PI * u);
      this.planchette.drive({ x: p.x + nx * w, y: p.y + ny * w });
    });
    this.planchette.drive(to);
  }

  /** Glides to a glyph in the spirit's own manner, calls arrive, and rests there. */
  async visit(id: string, arrive: (id: string) => void): Promise<void> {
    const el = elementById(this.view.layout, id);
    if (!el) return;
    const jitter = this.style.tic === "precise" ? 0 : 0.16;
    const to = {
      x: el.x + (Math.random() * 2 - 1) * el.rx * jitter,
      y: el.y + (Math.random() * 2 - 1) * el.ry * jitter,
    };
    const tic = Math.random() < this.style.ticChance ? this.style.tic : null;

    if (id === this.lastTarget) {
      // A double letter: swing off the glyph and come back, as a real planchette must.
      const { rest } = this.view.layout;
      const away = Math.hypot(rest.x - el.x, rest.y - el.y) || 1;
      const reach = Math.min(90, away);
      await this.glide({ x: el.x + ((rest.x - el.x) / away) * reach, y: el.y + ((rest.y - el.y) / away) * reach });
    }

    if (tic === "glitch") {
      this.view.setFlicker(true);
      await this.wait(150);
      this.planchette.drive(to);
      await this.wait(130);
      this.view.setFlicker(false);
    } else {
      if (tic === "feint") await this.feint(el);
      if (tic === "listen" || tic === "hesitate") {
        const from = this.planchette.pos;
        const k = tic === "listen" ? 0.5 : 0.82;
        await this.glide({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
        await (tic === "listen" ? this.sway(750) : this.wait(320));
      }
      if (tic === "spiral") await this.spiralInto(to);
      else await this.glide(to);
      if (tic === "jerk") await this.shake(6, 150);
    }

    this.lastTarget = id;
    arrive(id);
    if (tic === "tap") await this.tap();
    await this.linger(this.style.rest);
  }

  /** A sharp, fast move straight to a glyph, used when the board itself refuses. */
  async lunge(id: string, arrive: (id: string) => void): Promise<void> {
    const el = elementById(this.view.layout, id);
    if (!el) return;
    await this.glide({ x: el.x, y: el.y }, { speed: 2600, curve: 0.04, wobble: 0, ease: easeOutExpo });
    this.lastTarget = id;
    arrive(id);
    await this.shake(9, 240);
  }

  /** Drifts a little toward the middle between words. */
  async wordBreak(): Promise<void> {
    const p = this.planchette.pos;
    const r = this.view.layout.rest;
    await this.glide({ x: p.x + (r.x - p.x) * 0.22, y: p.y + (r.y - p.y) * 0.22 }, { speed: this.style.speed * 0.6 });
    await this.linger(this.style.wordRest);
  }

  home(): Promise<void> {
    return this.glide(this.view.layout.rest, { speed: this.style.speed * 0.55 });
  }

  /** Circles the middle of the board until the returned stop() is called. */
  circle(): () => Promise<void> {
    let stopped = false;
    const done = (async () => {
      const { rest, width, height } = this.view.layout;
      await this.glide(rest, { speed: Math.max(500, this.style.speed * 0.7) });
      if (stopped) return;
      const a = width * 0.075;
      const b = height * 0.05;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        this.ticker.add((now) => {
          if (stopped) {
            resolve();
            return false;
          }
          const t = ((now - start) * this.speedFactor) / 1000;
          const w = ((2 * Math.PI) / 2.6) * (1 + Math.min(t, 8) * 0.05);
          this.planchette.drive({ x: rest.x + a * Math.sin(w * t), y: rest.y + b * Math.sin(2 * w * t) });
          return true;
        });
      });
    })();
    return () => {
      stopped = true;
      return done;
    };
  }

  /** The planchette shudders as a spirit takes hold of it. */
  jolt(): Promise<void> {
    return this.shake(16, 420);
  }

  /** A long uneasy tremble, when a spirit falls silent. */
  tremble(): Promise<void> {
    return this.shake(5, 1000);
  }

  shake(amplitude: number, ms: number): Promise<void> {
    const c = { ...this.planchette.pos };
    return this.animate(ms, (u) => {
      const k = amplitude * (1 - u);
      this.planchette.drive({ x: c.x + (Math.random() * 2 - 1) * k, y: c.y + (Math.random() * 2 - 1) * k });
    }).then(() => this.planchette.drive(c));
  }

  private async feint(target: BoardElement): Promise<void> {
    const decoys = this.view.layout.elements.filter(
      (e) => e.kind === target.kind && e.id !== target.id && Math.hypot(e.x - target.x, e.y - target.y) < 320,
    );
    const decoy = decoys[Math.floor(Math.random() * decoys.length)];
    if (!decoy) return;
    await this.glide({ x: decoy.x, y: decoy.y }, { speed: this.style.speed * 1.25 });
    await this.shake(5, 140);
  }

  private async spiralInto(to: Point): Promise<void> {
    const from = this.planchette.pos;
    const angle = Math.atan2(from.y - to.y, from.x - to.x);
    const radius = 80;
    await this.glide({ x: to.x + Math.cos(angle) * radius, y: to.y + Math.sin(angle) * radius });
    await this.animate(850, (u) => {
      const a = angle + u * Math.PI * 2;
      const r = radius * (1 - easeInOutSine(u));
      this.planchette.drive({ x: to.x + Math.cos(a) * r, y: to.y + Math.sin(a) * r });
    });
  }

  private sway(ms: number): Promise<void> {
    const c = { ...this.planchette.pos };
    return this.animate(ms, (u, t) => this.planchette.drive({ x: c.x + Math.sin(t * 7) * 8 * Math.sin(Math.PI * u), y: c.y }));
  }

  private async tap(): Promise<void> {
    const c = { ...this.planchette.pos };
    for (let i = 0; i < 3; i++) {
      this.onTap();
      await this.animate(90, (u) => this.planchette.drive({ x: c.x, y: c.y + Math.sin(Math.PI * u) * 9 }));
    }
  }

  private linger(ms: number): Promise<void> {
    const c = { ...this.planchette.pos };
    const phase = Math.random() * 6;
    return this.animate(ms, (_u, t) =>
      this.planchette.drive({ x: c.x + Math.sin(t * 2.1 + phase) * 2.5, y: c.y + Math.cos(t * 1.7 + phase) * 2.5 }),
    );
  }
}
