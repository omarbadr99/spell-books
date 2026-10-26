// One requestAnimationFrame loop for everything that moves.

/** Return false to stop being called. */
export type TickFn = (now: number, dt: number) => boolean | void;

export class Ticker {
  private fns = new Set<TickFn>();
  private last = performance.now();

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      for (const fn of [...this.fns]) {
        if (fn(now, dt) === false) this.fns.delete(fn);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  add(fn: TickFn): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
}
