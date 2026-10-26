// Procedural dark wood for the board, painted once per layout into a bitmap so
// the planchette's lens can magnify it cheaply.

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 31);
    freq *= 2;
    amp *= 0.5;
  }
  return sum / (1 - 0.5 ** octaves);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DARK = [30, 14, 8];
const MID = [74, 37, 19];
const LIGHT = [122, 68, 36];

function woodColor(tone: number): number[] {
  const t = Math.min(1, Math.max(0, tone));
  const [from, to, k] = t < 0.5 ? [DARK, MID, t / 0.5] : [MID, LIGHT, (t - 0.5) / 0.5];
  return from.map((c, i) => c + (to[i] - c) * k);
}

/** Paints the wood and returns it as a data URL. */
export function paintWood(width: number, height: number, seed = 11): string {
  const scale = Math.min(1, 900 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(w, h);
  const aspect = width / height;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warp = fbm(u * 1.6 * aspect, v * 5, seed, 4);
      const rings = 0.5 + 0.5 * Math.sin((v * 26 + warp * 6.5) * Math.PI);
      const line = rings ** 6;
      const fibre = fbm(u * 60 * aspect, v * 520, seed + 7, 2);
      const blotch = fbm(u * 3 * aspect, v * 3, seed + 3, 3);

      let tone = 0.5 + (warp - 0.5) * 0.7 + (blotch - 0.5) * 0.35 - line * 0.32 + (fibre - 0.5) * 0.16;

      const dx = (u - 0.5) * 1.15;
      const dy = (v - 0.48) * 1.25;
      const dist = Math.sqrt(dx * dx + dy * dy) * 1.55;
      tone *= 1 - 0.62 * smoothstep(0.42, 1.1, dist);
      tone += 0.08 * (1 - smoothstep(0, 0.6, dist));

      const [r, g, b] = woodColor(tone);
      const i = (y * w + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.86);
}
