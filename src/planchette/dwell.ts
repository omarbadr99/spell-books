// Dwell-to-select: a glyph is chosen when the planchette's glass rests on it.
// Pure logic, driven once per frame while the sitters have the planchette.

export interface DwellOptions {
  /** How long the glass must rest on a glyph, in ms. */
  dwellMs: number;
  /** Per-glyph wait, e.g. 0 for a glyph that acts the moment the glass stops on it. */
  dwellFor?: (id: string) => number;
  /** Moving faster than this (board units per second) restarts the wait. */
  maxSpeed: number;
}

export interface DwellState {
  /** Glyph under the glass, if any. */
  hoverId: string | null;
  /** 0..1 progress toward selecting hoverId. */
  progress: number;
  /** Set on the frame a glyph is selected. */
  selected: string | null;
}

export class DwellDetector {
  private candidate: string | null = null;
  private since = 0;
  /** The last selection stays blocked until the glass leaves it, so letters don't repeat by accident. */
  private blocked: string | null = null;
  private last: { t: number; x: number; y: number } | null = null;
  private speed = 0;

  constructor(
    private readonly hit: (x: number, y: number) => string | null,
    private readonly options: DwellOptions,
  ) {}

  /**
   * Call once per frame while the sitters hold the planchette. `steady` is false
   * while the planchette still trails the sitters' fingers, so a glyph it merely
   * passes over during a slow frame never counts.
   */
  update(t: number, x: number, y: number, steady = true): DwellState {
    if (this.last) {
      const dt = Math.max(1, t - this.last.t);
      const instant = (Math.hypot(x - this.last.x, y - this.last.y) / dt) * 1000;
      this.speed = this.speed * 0.6 + instant * 0.4;
    }
    this.last = { t, x, y };

    const id = this.hit(x, y);
    if (id !== this.blocked) this.blocked = null;
    if (id !== this.candidate) {
      this.candidate = id;
      this.since = t;
    }
    const still = steady && this.speed <= this.options.maxSpeed;
    if (!still) this.since = t;
    if (!id || id === this.blocked) return { hoverId: id, progress: 0, selected: null };

    // A glyph with no wait acts as soon as the glass stops on it.
    const wait = this.options.dwellFor?.(id) ?? this.options.dwellMs;
    const progress = wait <= 0 ? (still ? 1 : 0) : Math.min(1, (t - this.since) / wait);
    if (progress < 1) return { hoverId: id, progress, selected: null };
    this.blocked = id;
    this.since = t;
    return { hoverId: id, progress: 1, selected: id };
  }

  /** A glyph chosen some other way, e.g. with a click: it stays blocked until the glass leaves it, as if dwelt on. */
  chose(id: string): void {
    this.blocked = id;
    this.candidate = id;
  }

  /** The sitters let go: forget the pending glyph but keep the last selection blocked. */
  release(): void {
    this.candidate = null;
    this.last = null;
    this.speed = 0;
  }

  /** Forget everything, e.g. when a new séance starts. */
  reset(): void {
    this.release();
    this.blocked = null;
  }
}
