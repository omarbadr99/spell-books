// The air in the room. Still until a spirit comes; then a breeze that wanders
// a little in direction and strength, gusts that roll across the board from the
// candle's side, and eddies the air carries along with it (curl noise, so the
// air swirls but never piles up or empties out). One model moves everything the
// wind touches: the dust and the smoke, the flame, and the letters, which read
// the same gusts from shader uniforms.

import { fbm1, noise1, noise3, type Noise3 } from "./noise";

/** A full breeze, in board units a second. Gusts are measured in breezes. */
export const BREEZE = 70;
/** How many gusts can blow at once; the shaders have a slot for each. */
export const MAX_GUSTS = 4;
/** The air never quite stops. */
const STILL = 5;
/** The breeze comes from the left, rising a little. */
const HEADING = 0.1;

export interface Gust {
  /** Where its middle is along the wind and across it, in board units. */
  s: number;
  l: number;
  /** Half its length along the wind and half its width across it. */
  along: number;
  across: number;
  /** How hard it blows at its middle, in breezes. */
  amp: number;
  /** How fast it travels downwind. */
  speed: number;
  age: number;
  life: number;
}

/** The wind at a point: its velocity, and how hard the gusts are blowing there. */
export interface Air {
  x: number;
  y: number;
  gust: number;
}

const ease = (value: number, target: number, dt: number, rise: number, fall: number) =>
  value + (target - value) * (1 - Math.exp(-dt / (target > value ? rise : fall)));

export class Wind {
  /** 0 in still air, 1 with a spirit present; eases between. */
  presence = 0;
  /** 0, or up to 1 while the spirit speaks. */
  stir = 0;
  /** The mean wind's direction, a unit vector in world space. */
  dirX = 1;
  dirY = 0;
  /** The mean wind's speed, in board units a second. */
  speed = STILL;
  /** How far the air has carried its eddies, so they drift downwind. */
  driftX = 0;
  driftY = 0;
  time = 0;
  readonly gusts: Gust[] = [];
  private presenceTarget = 0;
  private stirTarget = 0;
  /** The region gusts cross, in world space. */
  private box = { x0: 0, y0: -1100, x1: 1600, y1: 0 };
  private readonly n: Noise3 = { value: 0, dx: 0, dy: 0 };

  constructor(private readonly random: () => number = Math.random) {}

  /** The region the gusts cross, in world space (y up). */
  setBounds(x0: number, y0: number, x1: number, y1: number): void {
    this.box = { x0, y0, x1, y1 };
  }

  /** A spirit arrives with a gust and a breeze that stays, or leaves and the air falls still. */
  setPresence(on: boolean): void {
    if (on && !this.presenceTarget) this.spawn(1.1);
    this.presenceTarget = on ? 1 : 0;
  }

  /** While the spirit speaks the wind gets up: a gust at once, then more and stronger ones. */
  setStir(on: boolean): void {
    if (on && !this.stirTarget) this.spawn(1.6);
    this.stirTarget = on ? 1 : 0;
  }

  /** A strong gust that reaches (x, y) almost at once and then rolls on across the board. */
  blast(x: number, y: number, amp = 3.2): void {
    const along = 240;
    const speed = Math.max(this.speed * 1.5, 360);
    this.add({
      s: x * this.dirX + y * this.dirY - along * 0.9,
      l: -x * this.dirY + y * this.dirX,
      along,
      across: 950,
      amp,
      speed,
      age: 0.35,
      life: this.crossing(along, speed, x * this.dirX + y * this.dirY - along),
    });
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.presence = ease(this.presence, this.presenceTarget, dt, 1.6, 2.6);
    this.stir = ease(this.stir, this.stirTarget, dt, 0.35, 1.5);

    // The breeze wanders in direction and breathes in strength.
    const heading = HEADING + 0.3 * fbm1(t * 0.045 + 3.1) + 0.12 * this.stir * noise1(t * 0.5 + 9);
    this.dirX = Math.cos(heading);
    this.dirY = Math.sin(heading);
    const breath = 1 + 0.3 * fbm1(t * 0.12 + 7.7);
    this.speed = (STILL + BREEZE * (0.7 * this.presence + 0.9 * this.stir)) * breath;
    this.driftX += this.dirX * this.speed * dt;
    this.driftY += this.dirY * this.speed * dt;

    // Gusts come at random: now and then with a presence, often while it speaks.
    const rate = 0.16 * this.presence + 1.1 * this.stir;
    if (this.random() < rate * dt) this.spawn(0.5 + 0.6 * this.presence + 0.9 * this.stir);

    for (let i = this.gusts.length - 1; i >= 0; i--) {
      const gust = this.gusts[i];
      gust.age += dt;
      gust.s += gust.speed * dt;
      if (gust.age >= gust.life) this.gusts.splice(i, 1);
    }
  }

  /** How strong a gust is now, as it builds and fades. */
  strength(gust: Gust): number {
    return gust.amp * Math.min(1, gust.age / 0.5) * Math.min(1, (gust.life - gust.age) / 0.8);
  }

  /** The wind's velocity at a point (world space), and how hard it is gusting there. Writes into `out`. */
  at(x: number, y: number, out: Air): Air {
    const s = x * this.dirX + y * this.dirY;
    const l = -x * this.dirY + y * this.dirX;
    let gust = 0;
    for (const g of this.gusts) {
      const ds = (s - g.s) / g.along;
      const dl = (l - g.l) / g.across;
      gust += this.strength(g) * Math.exp(-ds * ds - dl * dl);
    }
    const along = this.speed + BREEZE * gust;

    // Eddies: the curl of a drifting stream function, two sizes of swirl, livelier in a gust.
    const swirl = 4 + 0.5 * along;
    const n = this.n;
    noise3((x - this.driftX) * 0.004, (y - this.driftY) * 0.004, this.time * 0.13, n);
    let ex = n.dy;
    let ey = -n.dx;
    noise3((x - this.driftX) * 0.011 + 31.7, (y - this.driftY) * 0.011, this.time * 0.31, n);
    ex += 0.45 * n.dy;
    ey -= 0.45 * n.dx;

    out.x = this.dirX * along + swirl * ex;
    out.y = this.dirY * along + swirl * ey;
    out.gust = gust;
    return out;
  }

  /** Writes the gusts the shaders read: (along, across, half length, half width) and (strength, speed). */
  pack(shape: Float32Array, force: Float32Array): void {
    shape.fill(0);
    force.fill(0);
    this.gusts.slice(0, MAX_GUSTS).forEach((g, i) => {
      shape.set([g.s, g.l, g.along, g.across], i * 4);
      force.set([this.strength(g), g.speed], i * 4);
    });
    // Unused slots stay harmless: no strength, and a size that can't divide by zero.
    for (let i = this.gusts.length; i < MAX_GUSTS; i++) shape.set([0, 0, 1, 1], i * 4);
  }

  /** A gust that starts upwind of the board and crosses it. */
  private spawn(amp: number): void {
    const { box } = this;
    const corners = [
      [box.x0, box.y0],
      [box.x1, box.y0],
      [box.x0, box.y1],
      [box.x1, box.y1],
    ];
    const along = corners.map(([x, y]) => x * this.dirX + y * this.dirY);
    const across = corners.map(([x, y]) => -x * this.dirY + y * this.dirX);
    const half = 130 + 210 * this.random();
    const speed = this.speed * (1.1 + 0.4 * this.random()) + 25;
    const from = Math.min(...along) - half * 1.6;
    const lo = Math.min(...across);
    const hi = Math.max(...across);
    this.add({
      s: from,
      l: lo + (hi - lo) * this.random(),
      along: half,
      across: 280 + 520 * this.random(),
      amp,
      speed,
      age: 0,
      life: this.crossing(half, speed, from),
    });
  }

  /** Seconds for a gust starting at `from` to pass the far side of the board. */
  private crossing(half: number, speed: number, from: number): number {
    const { box } = this;
    const far = Math.max(...[box.x0, box.x1].flatMap((x) => [box.y0, box.y1].map((y) => x * this.dirX + y * this.dirY)));
    return (far + half * 2 - from) / speed;
  }

  private add(gust: Gust): void {
    if (this.gusts.length >= MAX_GUSTS) this.gusts.shift();
    this.gusts.push(gust);
  }
}
