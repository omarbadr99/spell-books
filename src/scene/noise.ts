// Smooth noise for the wind and the flicker of the flame: values that wander
// without ever repeating. Value noise, with its gradient, so a stream function
// made of it can be turned into swirling, divergence-free air (curl noise).

/** A pseudo-random number in -1..1 for each lattice point. */
function hash(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32767.5 - 1;
}

/** Smooth noise along a line, in -1..1. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i, 0, 0);
  return a + (hash(i + 1, 0, 0) - a) * u;
}

/** A few octaves of noise1, for flicker that has both slow breaths and quick shivers. */
export function fbm1(x: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(x * 2 ** o + o * 17.3);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

export interface Noise3 {
  value: number;
  dx: number;
  dy: number;
}

/** Smooth noise in space and time, in -1..1, with its gradient in x and y. Writes into `out`. */
export function noise3(x: number, y: number, z: number, out: Noise3): Noise3 {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const dux = 6 * fx * (1 - fx);
  const duy = 6 * fy * (1 - fy);

  const a = hash(ix, iy, iz);
  const b = hash(ix + 1, iy, iz);
  const c = hash(ix, iy + 1, iz);
  const d = hash(ix + 1, iy + 1, iz);
  const e = hash(ix, iy, iz + 1);
  const f = hash(ix + 1, iy, iz + 1);
  const g = hash(ix, iy + 1, iz + 1);
  const h = hash(ix + 1, iy + 1, iz + 1);

  const k1 = b - a;
  const k2 = c - a;
  const k3 = e - a;
  const k4 = a - b - c + d;
  const k5 = a - c - e + g;
  const k6 = a - b - e + f;
  const k7 = -a + b + c - d + e - f - g + h;

  out.value = a + k1 * ux + k2 * uy + k3 * uz + k4 * ux * uy + k5 * uy * uz + k6 * uz * ux + k7 * ux * uy * uz;
  out.dx = dux * (k1 + k4 * uy + k6 * uz + k7 * uy * uz);
  out.dy = duy * (k2 + k5 * uz + k4 * ux + k7 * uz * ux);
  return out;
}
