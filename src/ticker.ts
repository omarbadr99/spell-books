// One requestAnimationFrame loop for everything that moves.

/** Return false to stop being called. */
export type TickFn = (now: number, dt: number) => boolean | void;

export class Ticker {
  private fns = new Set<TickFn>();
  private draw: ((now: number, dt: number) => void) | null = null;
  private last = performance.now();

  start(): void {
    const loop = (now: number) => {
      // Long frames still advance most of the way, so the planchette keeps up with the fingers.
      const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      for (const fn of [...this.fns]) {
        if (fn(now, dt) === false) this.fns.delete(fn);
      }
      this.draw?.(now, dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  add(fn: TickFn): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }

  /** Runs once a frame after everything else has moved: where the scene is drawn. */
  onDraw(fn: (now: number, dt: number) => void): void {
    this.draw = fn;
  }
}
