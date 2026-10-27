// The planchette's position and feel. The sitters drag it (with a little lag,
// like real wood on felt); a spirit drives it directly.

import type { Point } from "../board/layout";
import type { BoardView } from "../board/render";

/** The planchette's body, which fingers can take hold of: an ellipse around the window and up to its point. */
const BODY = { dy: -30, rx: 112, ry: 132 };
const EDGE = 44;
/** Finger movement smaller than this (board units) is jitter, not a move. */
const JITTER = 10;

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
  /** When the sitters' fingers last moved, and where they were. */
  private movedAt = 0;
  private anchor: Point = { x: 0, y: 0 };
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
    const s = this.view.layout.planchetteScale;
    return Math.hypot((p.x - this.pos.x) / (BODY.rx * s), (p.y - this.pos.y - BODY.dy * s) / (BODY.ry * s)) <= 1;
  }

  grab(p: Point): void {
    this.held = true;
    this.grabOffset = { x: this.pos.x - p.x, y: this.pos.y - p.y };
    this.target = { ...this.pos };
    this.anchor = { ...this.pos };
    this.movedAt = performance.now();
  }

  dragTo(p: Point): void {
    if (!this.held || this.driven) return;
    const next = this.clamp({ x: p.x + this.grabOffset.x, y: p.y + this.grabOffset.y });
    if (Math.hypot(next.x - this.anchor.x, next.y - this.anchor.y) > JITTER) {
      this.movedAt = performance.now();
      this.anchor = next;
    }
    this.target = next;
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

    // It turns a few degrees into a sideways move, the way wood drags on felt.
    const lean = Math.max(-8, Math.min(8, this.velocity.x * 0.006)) + this.tilt;
    this.angle += (lean - this.angle) * (1 - Math.exp(-dt / 0.24));
    this.view.drawPlanchette(this.pos, this.angle);
  }

  /**
   * The sitters' fingers have come to rest and the planchette has caught up with
   * them. Only then may the glass choose a glyph, however slowly frames arrive.
   */
  settled(now: number): boolean {
    const lag = Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.y);
    return lag < 18 && now - this.movedAt > 80;
  }

  /** Where the sitters' fingers are taking the planchette. */
  get aim(): Point {
    return { ...this.target };
  }

  private clamp(p: Point): Point {
    const { width, height } = this.view.layout;
    return { x: Math.min(width - EDGE, Math.max(EDGE, p.x)), y: Math.min(height - EDGE, Math.max(EDGE, p.y)) };
  }
}
