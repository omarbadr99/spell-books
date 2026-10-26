// The planchette's position and feel. The sitters drag it (with a little lag,
// like real wood on felt); a spirit drives it directly.

import type { Point } from "../board/layout";
import type { BoardView } from "../board/render";

const GRAB_RADIUS = 128;
const EDGE = 44;

export class Planchette {
  pos: Point = { x: 0, y: 0 };
  /** Smoothed speed in board units per second, for the scrape sound. */
  speed = 0;
  held = false;
  /** True while a spirit moves it; the sitters' fingers do nothing then. */
  driven = false;
  /** Extra tilt a spirit can add, in degrees. */
  tilt = 0;
  private target: Point = { x: 0, y: 0 };
  private grabOffset: Point = { x: 0, y: 0 };
  private prev: Point = { x: 0, y: 0 };
  private velocity: Point = { x: 0, y: 0 };
  private angle = 0;

  constructor(private readonly view: BoardView) {}

  place(p: Point): void {
    this.pos = { ...p };
    this.target = { ...p };
    this.prev = { ...p };
    this.velocity = { x: 0, y: 0 };
  }

  canGrab(p: Point): boolean {
    return Math.hypot(p.x - this.pos.x, p.y - this.pos.y) <= GRAB_RADIUS * this.view.layout.planchetteScale;
  }

  grab(p: Point): void {
    this.held = true;
    this.grabOffset = { x: this.pos.x - p.x, y: this.pos.y - p.y };
    this.target = { ...this.pos };
  }

  dragTo(p: Point): void {
    if (!this.held || this.driven) return;
    this.target = this.clamp({ x: p.x + this.grabOffset.x, y: p.y + this.grabOffset.y });
  }

  release(): void {
    this.held = false;
    this.target = { ...this.pos };
  }

  /** A spirit sets the position directly. */
  drive(p: Point): void {
    this.pos = this.clamp(p);
    this.target = { ...this.pos };
  }

  tick(dt: number): void {
    if (!this.driven) {
      const k = 1 - Math.exp(-dt / 0.055);
      this.pos = { x: this.pos.x + (this.target.x - this.pos.x) * k, y: this.pos.y + (this.target.y - this.pos.y) * k };
    }
    const step = Math.max(dt, 1 / 240);
    const vx = (this.pos.x - this.prev.x) / step;
    const vy = (this.pos.y - this.prev.y) / step;
    this.velocity = { x: this.velocity.x * 0.8 + vx * 0.2, y: this.velocity.y * 0.8 + vy * 0.2 };
    this.speed = Math.hypot(this.velocity.x, this.velocity.y);
    this.prev = { ...this.pos };

    const lean = Math.max(-13, Math.min(13, this.velocity.x * 0.011)) + this.tilt;
    this.angle += (lean - this.angle) * (1 - Math.exp(-dt / 0.14));
    this.view.drawPlanchette(this.pos, this.angle);
  }

  private clamp(p: Point): Point {
    const { width, height } = this.view.layout;
    return { x: Math.min(width - EDGE, Math.max(EDGE, p.x)), y: Math.min(height - EDGE, Math.max(EDGE, p.y)) };
  }
}
