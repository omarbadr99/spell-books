// The candle's light. Everything in the scene that the candle touches reads its
// brightness, color and position from here. The flame flickers by itself, leans
// and gutters in the wind, and flares up while a spirit speaks.

import { Color, Vector3 } from "three";
import { fbm1 } from "./noise";
import type { Air } from "./wind";

/** White-hot: what the candle's color burns toward as it flares. */
const HOT = new Color("#fff4e0");
/** How stiffly the flame springs back upright, and how quickly its sway dies away. */
const SPRING = 160;
const DAMPING = 9;

export class CandleLight {
  /** 0 when out, 1 when burning; eases between the two. */
  level = 0;
  /** Brightness this frame, flicker, flare and all. */
  power = 0;
  /** 0, or up to 1 while a spirit speaks. */
  flare = 0;
  /** How far the flame leans: 1 is a long way over, with the wind. */
  lean = 0;
  /** How hard the wind is tugging at the flame, 0 in still air. */
  flutter = 0;
  /** Where the flame stands, in world space. */
  readonly base = new Vector3();
  /** Where its light comes from this frame: the flame's heart, wherever the wind has pushed it. */
  readonly position = new Vector3();
  /** The candle's color. */
  readonly color = new Color("#ef8e34");
  /** The light's color this frame, hotter as it flares. */
  readonly glow = new Color("#ef8e34");
  /** How tall the flame is, in board units. */
  height = 60;
  private target = 0;
  private flareTarget = 0;
  private clock = 0;
  private leanSpeed = 0;
  /** Until when the wick is still catching, sputtering as it does. */
  private catching = 0;
  /** A gutter in progress: how deep, and when it began. */
  private dip = 0;
  private dipAt = -10;

  constructor(private readonly random: () => number = Math.random) {}

  set(lit: boolean): void {
    if (lit && this.target === 0) this.catching = this.clock + 1.1;
    this.target = lit ? 1 : 0;
  }

  get lit(): boolean {
    return this.target === 1;
  }

  /** The flame swells and burns brighter while a spirit speaks. */
  setFlare(on: boolean): void {
    this.flareTarget = on ? 1 : 0;
  }

  setColor(hex: string): void {
    this.color.set(hex);
  }

  /** Moves the flame on by `dt` seconds, in the wind blowing at it. */
  update(dt: number, wind: Air): void {
    this.clock += dt;
    const t = this.clock;
    // It catches over a second or so, and goes out at once.
    this.level += (this.target - this.level) * (1 - Math.exp(-dt / (this.target > this.level ? 0.5 : 0.14)));
    this.flare += (this.flareTarget - this.flare) * (1 - Math.exp(-dt / (this.flareTarget > this.flare ? 0.2 : 1.3)));

    // The flame leans with the wind like a reed on a spring: quick to bend, with a little wobble.
    // Stepped implicitly, so a long frame can't throw it into ever-wilder swings.
    const speed = Math.hypot(wind.x, wind.y);
    this.flutter = Math.min(1.5, speed / 120);
    const push = Number.isFinite(wind.x) ? Math.max(-1, Math.min(1, wind.x / 170)) : 0;
    this.leanSpeed = (this.leanSpeed - SPRING * (this.lean - push) * dt) / (1 + DAMPING * dt + SPRING * dt * dt);
    this.lean += this.leanSpeed * dt;

    // Flicker: the slow breathing of the flame and its quick shivers, never repeating.
    let f = 1 + 0.07 * fbm1(t * 1.7) + 0.035 * fbm1(t * 9.3 + 40) * (1 + 2 * this.flutter);
    // Gusts press it down and dim it.
    f *= 1 - 0.32 * Math.min(1, Math.max(0, (speed - 60) / 220));
    // Now and then it gutters: more often in a draught.
    if (this.random() < (0.025 + 0.35 * this.flutter * this.flutter) * dt) {
      this.dip = 0.25 + 0.3 * this.random();
      this.dipAt = t;
    }
    const since = t - this.dipAt;
    f *= 1 - this.dip * (since < 0.07 ? since / 0.07 : Math.exp(-(since - 0.07) / 0.3));
    if (t < this.catching) f *= 0.55 + 0.45 * Math.abs(fbm1(t * 25));

    this.power = this.level * f * (1 + 0.95 * this.flare);
    this.glow.copy(this.color).lerp(HOT, 0.3 * this.flare);
    // The light sits in the flame's heart, which the wind carries over and down.
    this.position.set(
      this.base.x + this.lean * this.height * 0.12,
      this.base.y - Math.abs(this.lean) * this.height * 0.08,
      this.base.z,
    );
  }

  /** The tip of the flame, where its motes of heat leave it, as the wind bends it over. */
  get tip(): { x: number; y: number } {
    return { x: this.base.x + this.lean * this.height * 0.5, y: this.base.y + this.height * (0.5 - 0.12 * Math.abs(this.lean)) };
  }

  /** How strongly the light falls on a point, as the shaders reckon it. */
  at(p: Vector3, range: number): number {
    return this.power / (1 + p.distanceToSquared(this.position) / (range * range));
  }
}
