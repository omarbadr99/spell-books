// Turns shapes into points for particles. A shape is drawn into a mask (see
// masks.ts); points crowd toward its edges and run in short threads through its
// strokes, which keeps particle lettering crisp and makes it look spun rather
// than sprayed.

export interface Mask {
  /** How much of each pixel the shape covers, 0..255. */
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
}

/** What a point is part of. The shaders treat each kind a little differently. */
export const KIND = {
  /** The body of a stroke, thickest along its edges. */
  body: 0,
  /** A thread wandering through a stroke. */
  thread: 1,
  /** A speck of stray dust just off the shape. */
  dust: 2,
  /** A large, faint point over a stroke; together they read as a glow. */
  haze: 3,
} as const;

export interface Sample {
  x: number;
  y: number;
  kind: number;
}

export interface SampleMix {
  thread: number;
  dust: number;
  haze: number;
  /** How much more often edges are picked than the middle of a stroke. */
  edge: number;
}

const DEFAULT_MIX: SampleMix = { thread: 0.32, dust: 0.08, haze: 0.04, edge: 3 };
const SOLID = 110;
const NEAR = [
  [-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-3, -3], [3, -3], [-3, 3], [3, 3],
];

/** Seeded random numbers, so a board looks the same on every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many pixels of the mask the shape fills. */
export function coverage(mask: Mask): number {
  let n = 0;
  for (const a of mask.alpha) if (a >= SOLID) n++;
  return n;
}

/**
 * Picks `count` points for a shape, in mask pixels. `unit` is how many pixels
 * make one board unit, which sets how far stray dust may wander.
 */
export function sampleMask(mask: Mask, count: number, rand: () => number, unit = 1, mix: SampleMix = DEFAULT_MIX): Sample[] {
  const { alpha, width: w, height: h } = mask;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]);

  // Every filled pixel, weighted by how close it sits to the shape's edge and by
  // how solidly it is filled, so a mask can be shaded.
  const inside: number[] = [];
  const cdf: number[] = [];
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = alpha[y * w + x];
      if (a < SOLID) continue;
      let open = 0;
      for (const [dx, dy] of NEAR) open += 255 - at(x + dx, y + dy);
      const edge = Math.min(1, (open / (255 * NEAR.length)) * 2.4);
      total += (1 + mix.edge * edge) * (a / 255) ** 3;
      inside.push(y * w + x);
      cdf.push(total);
    }
  }
  if (!inside.length || count <= 0) return [];
  const pick = () => {
    const r = rand() * total;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return inside[lo];
  };
  const solid = (x: number, y: number) => at(Math.floor(x), Math.floor(y)) >= SOLID;

  const threads = Math.round(count * mix.thread);
  const dust = Math.round(count * mix.dust);
  const haze = Math.max(1, Math.round(count * mix.haze));
  const body = Math.max(0, count - threads - dust - haze);
  const out: Sample[] = [];

  for (let i = 0; i < body; i++) {
    const p = pick();
    out.push({ x: (p % w) + rand(), y: Math.floor(p / w) + rand(), kind: KIND.body });
  }

  // Threads: short walks that wander through the strokes and turn back at their edges.
  for (let made = 0, tries = 0; made < threads && tries < threads * 12; tries++) {
    const p = pick();
    let x = (p % w) + 0.5;
    let y = Math.floor(p / w) + 0.5;
    let a = rand() * Math.PI * 2;
    const steps = 8 + Math.floor(rand() * 26);
    for (let s = 0; s < steps && made < threads; s++) {
      a += (rand() - 0.5) * 0.7;
      const nx = x + Math.cos(a) * 1.7;
      const ny = y + Math.sin(a) * 1.7;
      if (!solid(nx, ny)) {
        a += Math.PI * (0.6 + rand() * 0.8);
        continue;
      }
      x = nx;
      y = ny;
      out.push({ x, y, kind: KIND.thread });
      made++;
    }
  }

  // Dust: specks scattered just around the shape.
  for (let i = 0; i < dust; i++) {
    const p = pick();
    const r = (1.5 + Math.abs(gauss(rand)) * 6) * unit;
    const a = rand() * Math.PI * 2;
    out.push({ x: (p % w) + Math.cos(a) * r, y: Math.floor(p / w) + Math.sin(a) * r, kind: KIND.dust });
  }

  for (let i = 0; i < haze; i++) {
    const p = inside[Math.floor(rand() * inside.length)];
    out.push({ x: p % w, y: Math.floor(p / w), kind: KIND.haze });
  }
  return out;
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
