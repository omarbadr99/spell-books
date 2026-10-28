// The planchette: the sitters' cursor. Its window sits wherever their pointer
// is (a little above a fingertip, so the finger doesn't hide the letter), and
// it follows with only the slightest lag, like wood sliding on felt. While the
// spirit has it, it ignores the sitters altogether.

import type { Point } from "../board/layout";
import type { BoardView } from "../board/render";


export class Planchette {
  pos: Point = { x: 0, y: 0 };
  /** Smoothed speed in board units per second, for the scrape sound. */
  speed = 0;
  /** True while the spirit moves it; the sitters' hand does nothing then. */
  driven = false;
  /** Extra tilt the spirit can add, in degrees. */
  tilt = 0;
  private target: Point = { x: 0, y: 0 };
  /** When the sitters' hand last moved. */
  private movedAt = 0;
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

  /**
   * Where the sitters' hand is taking it, in board units, and whether the hand
   * itself has moved (rather than the view swaying under it).
   */
  follow(p: Point, moved: boolean): void {
    if (this.driven) return;
    if (moved) this.movedAt = performance.now();
    this.target = { ...p };
  }

  /** The spirit sets the position directly. */
  drive(p: Point): void {
    this.pos = { ...p };
    this.target = { ...p };
  }

  tick(dt: number): void {
    if (!this.driven) {
      const k = 1 - Math.exp(-dt / 0.03);
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
   * The sitters' hand has come to rest and the planchette has caught up with
   * it. Only then may the glass choose a glyph, however slowly frames arrive.
   */
  settled(now: number): boolean {
    const lag = Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.y);
    return lag < 18 && now - this.movedAt > 80;
  }

  /** How long the sitters' hand has been still, in ms. */
  stillFor(now: number): number {
    return now - this.movedAt;
  }
}
