// The candle's light and the breeze that comes with a presence. Everything in the
// scene that the candle touches reads its brightness, color and position from here.

import { Color, Vector3 } from "three";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class CandleLight {
  /** 0 when out, 1 when burning; eases between the two. */
  level = 0;
  /** Brightness this frame, flicker and all. */
  power = 0;
  /** How hard the presence's breeze blows, 0..1. */
  breeze = 0;
  /** How far the flame leans away from the breeze. */
  lean = 0;
  /** Where the flame is, in world space. */
  readonly position = new Vector3();
  readonly color = new Color("#ef8e34");
  private target = 0;
  private clock = 0;
  /** Until when the wick is still catching, sputtering as it does. */
  private catching = 0;

  set(lit: boolean): void {
    if (lit && this.target === 0) this.catching = this.clock + 1.1;
    this.target = lit ? 1 : 0;
  }

  get lit(): boolean {
    return this.target === 1;
  }

  setColor(hex: string): void {
    this.color.set(hex);
  }

  update(dt: number): void {
    this.clock += dt;
    const t = this.clock;
    // It catches over a second or so, and goes out at once.
    const tau = this.target > this.level ? 0.5 : 0.14;
    this.level += (this.target - this.level) * (1 - Math.exp(-dt / tau));
    // The breeze rises slowly once someone is here, and dies down after.
    this.breeze = Math.min(1, Math.max(0, this.breeze + (this.target ? dt / 3.4 : -dt / 2.2)));

    // Flicker: a quick tremble, a slow breath, and now and then a gutter.
    let f = 1 + 0.07 * Math.sin(t * 13.1) + 0.05 * Math.sin(t * 23.7 + 1.3) + 0.04 * Math.sin(t * 5.3 + 0.4);
    const slow = 0.5 + 0.25 * Math.sin(t * 0.71) + 0.25 * Math.sin(t * 1.37 + 2);
    f -= 0.22 * smoothstep(0.78, 0.97, slow);
    if (t < this.catching) f *= 0.5 + 0.5 * Math.abs(Math.sin(t * 29));
    this.power = this.level * f;
    this.lean = this.breeze * (0.35 + 0.25 * Math.sin(t * 0.9)) + 0.06 * Math.sin(t * 3.1);
  }

  /** How strongly the light falls on a point, as the shaders reckon it. */
  at(p: Vector3, range: number): number {
    return this.power / (1 + p.distanceToSquared(this.position) / (range * range));
  }
}
