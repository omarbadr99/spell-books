// The board's surface, painted once per layout into a bitmap so the planchette's
// glass can magnify it cheaply: black card dusted with stars, a moon and banks of
// cloud drawn in dots, after pointillist night etchings. Everything is seeded, so
// the board is the same on every visit.

import type { BoardLayout, Point } from "./layout";

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

function fbm(x: number, y: number, seed: number, octaves = 4): number {
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

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dots collected by brightness and filled in a few passes, which is far quicker than one by one. */
class Dots {
  private paths: Path2D[];

  constructor(private readonly levels: number[]) {
    this.paths = levels.map(() => new Path2D());
  }

  add(x: number, y: number, r: number, brightness: number): void {
    const i = Math.min(this.levels.length - 1, Math.max(0, Math.round(brightness * (this.levels.length - 1))));
    this.paths[i].moveTo(x + r, y);
    this.paths[i].arc(x, y, r, 0, Math.PI * 2);
  }

  fill(ctx: CanvasRenderingContext2D, rgb: string): void {
    this.paths.forEach((path, i) => {
      ctx.fillStyle = `rgba(${rgb}, ${this.levels[i]})`;
      ctx.fill(path);
    });
  }
}

/**
 * Scatters dots over an area: one chance per cell of a jittered grid, taken with
 * the probability `density` gives for that spot. That keeps the even spacing of
 * hand stippling while the density field draws the picture.
 */
function stipple(
  dots: Dots,
  rand: () => number,
  box: { x0: number; y0: number; x1: number; y1: number },
  cell: number,
  density: (x: number, y: number) => number,
  size: [number, number],
): void {
  for (let y = box.y0; y < box.y1; y += cell) {
    for (let x = box.x0; x < box.x1; x += cell) {
      const px = x + rand() * cell;
      const py = y + rand() * cell;
      const d = density(px, py);
      if (d <= 0 || rand() > d) continue;
      dots.add(px, py, size[0] + (size[1] - size[0]) * rand(), Math.min(1, 0.35 + d * 0.65) * (0.7 + rand() * 0.3));
    }
  }
}

/** 1 well clear of every glyph, falling to 0 inside them, so the dots never crowd a letter. */
function clearOfGlyphs(layout: BoardLayout, margin: number): (x: number, y: number) => number {
  return (x, y) => {
    let k = 1;
    for (const el of layout.elements) {
      const d = Math.hypot((x - el.x) / (el.rx + margin), (y - el.y) / (el.ry + margin));
      if (d < 1.6) k = Math.min(k, smoothstep(0.75, 1.3, d));
    }
    return k;
  };
}

/**
 * A waxing moon, tilted a little and lit from the right: a solid disc with a clean
 * edge to its shadow and dark grain for its seas, craters and shading, the way
 * stipplers draw it. It sits behind `bank`, a cloud bank drawn over it afterwards.
 */
function paintMoon(ctx: CanvasRenderingContext2D, rand: () => number, moon: Point & { r: number }, bank: Bank, grain: number): void {
  const { x: mx, y: my, r } = moon;
  // A faint glow in the air around it.
  const glow = ctx.createRadialGradient(mx, my, r * 0.8, mx, my, r * 3.2);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.1)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(mx - r * 3.2, my - r * 3.2, r * 6.4, r * 6.4);

  ctx.save();
  // Only what rises above the clouds' edge shows.
  ctx.beginPath();
  ctx.moveTo(mx - r * 1.6, my - r * 1.6);
  for (let x = mx - r * 1.6; x <= mx + r * 1.6; x += 2) ctx.lineTo(x, bankEdge(bank, x) + 2);
  ctx.lineTo(mx + r * 1.6, my - r * 1.6);
  ctx.closePath();
  ctx.clip();

  ctx.translate(mx, my);
  ctx.rotate(-0.35);
  // The dark side, just visible.
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // The lit part: the right half of the disc and a half ellipse past the middle.
  const bow = 0.45;
  const lit = new Path2D();
  lit.moveTo(0, -r);
  lit.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  lit.ellipse(0, 0, r * bow, r, 0, Math.PI / 2, (Math.PI * 3) / 2);
  const shine = ctx.createRadialGradient(r * 0.35, -r * 0.2, r * 0.1, 0, 0, r);
  shine.addColorStop(0, "#ffffff");
  shine.addColorStop(0.7, "#ececf0");
  shine.addColorStop(1, "#c8c8ce");
  ctx.fillStyle = shine;
  ctx.fill(lit);

  // Dark grain: seas, craters, and shading that deepens toward the shadow's edge.
  const grit = new Dots([0.18, 0.32, 0.48, 0.66]);
  stipple(grit, rand, { x0: -r, y0: -r, x1: r, y1: r }, 1.4 * grain, (x, y) => {
    const q = (x * x + y * y) / (r * r);
    if (q > 0.995) return 0;
    const edge = -bow * r * Math.sqrt(Math.max(0, 1 - (y * y) / (r * r)));
    const into = (x - edge) / (r * 1.45);
    if (into < 0) return 0;
    const nx = x / r;
    const ny = y / r;
    const seas = smoothstep(0.5, 0.68, fbm(nx * 2.2 + 5, ny * 2.2 + 5, 41, 4));
    const craters = smoothstep(0.62, 0.78, fbm(nx * 6 + 1, ny * 6 + 1, 17, 3));
    const shade = 1 - smoothstep(0, 0.38, into);
    const limb = smoothstep(0.85, 1, Math.sqrt(q)) * 0.25;
    return Math.min(0.9, seas * 0.5 + craters * 0.35 + shade * 0.8 + limb);
  }, [0.45 * grain, 0.8 * grain]);
  grit.fill(ctx, "12, 12, 16");
  ctx.restore();
}

/** A bank of cloud. `top(x)` is where its edge would be without billows; `scale` sets their size. */
interface Bank {
  top: (x: number) => number;
  seed: number;
  scale: number;
}

/** One row of rounded billows along a bank's edge, each a different size. */
function billows(x: number, width: number, height: number, seed: number): number {
  const i = Math.floor(x / width);
  const f = x / width - i;
  return Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) * height * (0.55 + 0.9 * hash(i, 3, seed));
}

/** The billowing top edge of a bank: two rows of rounded billows over a slow drift. */
function bankEdge(bank: Bank, x: number): number {
  const s = bank.scale;
  const bump = Math.max(billows(x, s * 2.6, s * 0.8, bank.seed), billows(x + s * 1.1, s * 1.8, s * 0.6, bank.seed + 1));
  const drift = (fbm(x / (s * 4), bank.seed, bank.seed, 3) - 0.5) * s * 1.4;
  return bank.top(x) - bump - drift;
}

/** Banks of cloud, each with a bright billowing top that fades into its body, as stipplers draw them. */
function cloudBanks(
  rand: () => number,
  dots: Dots,
  box: { x0: number; y0: number; x1: number; y1: number },
  banks: Bank[],
  clear: (x: number, y: number) => number,
  grain: number,
): void {
  stipple(dots, rand, box, 2.3 * grain, (x, y) => {
    let d = 0;
    for (const bank of banks) {
      const depth = y - bankEdge(bank, x);
      if (depth < -3) continue;
      // A bright rim along the billows that falls away into shadow below, so the
      // rows in front stand out against the ones behind.
      const body = depth < 0 ? 0.7 * (1 + depth / 3) : 0.88 * Math.exp(-depth / (bank.scale * 0.34)) + 0.05;
      const mottle = 0.7 + 0.3 * fbm(x / 18, y / 18, bank.seed + 9, 3);
      d = Math.max(d, body * mottle);
    }
    return d * clear(x, y);
  }, [0.5 * grain, 1.05 * grain]);
}

/** Paints the board's surface and returns it as a data URL. */
export function paintBoard(layout: BoardLayout, pixelsPerUnit: number, seed = 1911): string {
  const { width, height, moon } = layout;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelsPerUnit);
  canvas.height = Math.round(height * pixelsPerUnit);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pixelsPerUnit, pixelsPerUnit);
  const rand = seeded(seed);
  // Dots stay at least a pixel or so across however small the board is drawn.
  const grain = Math.max(1, 1.3 / pixelsPerUnit);

  // Black card, a breath lighter toward the middle.
  const card = ctx.createRadialGradient(width / 2, height * 0.46, 0, width / 2, height * 0.46, Math.max(width, height) * 0.72);
  card.addColorStop(0, "#121215");
  card.addColorStop(0.6, "#0a0a0c");
  card.addColorStop(1, "#040405");
  ctx.fillStyle = card;
  ctx.fillRect(0, 0, width, height);

  // Fine vertical scratches, like the etched skies it borrows from.
  ctx.lineWidth = 0.7;
  for (let i = 0; i < (width * height) / 2200; i++) {
    const x = rand() * width;
    const y = rand() * height;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.012 + rand() * 0.028})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 1.2, y + 8 + rand() * 46);
    ctx.stroke();
  }

  const clear = clearOfGlyphs(layout, 18);

  // Clouds banked in the lower corners, and a low bank the moon rises over.
  const clouds = new Dots([0.14, 0.26, 0.4, 0.56, 0.74, 0.92]);
  const corner = (x: number) => Math.abs(x - width / 2) / (width / 2);
  cloudBanks(rand, clouds, { x0: 0, y0: height * 0.45, x1: width, y1: height }, [
    { top: (x) => height - 30 - 310 * corner(x) ** 2.2, seed: 3, scale: 44 },
    { top: (x) => height + 10 - 280 * corner(x) ** 2.4, seed: 8, scale: 38 },
    { top: (x) => height + 50 - 250 * corner(x) ** 2.6, seed: 13, scale: 32 },
  ], clear, grain);
  const mx = moon.x;
  const moonBank: Bank = {
    top: (x) => moon.y + moon.r * 0.62 + (Math.abs(x - mx) / (moon.r * 3)) ** 2 * moon.r * 0.8,
    seed: 21,
    scale: moon.r * 0.5,
  };
  const rows = [0.38, 0.72].map((dy, i): Bank => ({ top: (x) => moonBank.top(x) + moon.r * dy, seed: 27 + i * 6, scale: moon.r * (0.44 - i * 0.06) }));
  cloudBanks(rand, clouds, { x0: mx - moon.r * 4, y0: moon.y - moon.r, x1: mx + moon.r * 4, y1: moon.y + moon.r * 2.2 }, [moonBank, ...rows], (x, y) =>
    clear(x, y) *
    (1 - smoothstep(moon.r * 2.6, moon.r * 3.8, Math.abs(x - mx))) *
    (1 - smoothstep(moon.y + moon.r * 1.25, moon.y + moon.r * 1.9, y)),
    grain,
  );

  paintMoon(ctx, rand, moon, moonBank, grain);
  // The moon sits behind the near bank, so draw that bank again over it.
  clouds.fill(ctx, "236, 236, 240");

  // A halo of dots around the center, where the planchette rests.
  const center = layout.elements.find((el) => el.id === "CENTER")!;
  const halo = new Dots([0.18, 0.34, 0.52, 0.72]);
  const others = clearOfGlyphs({ ...layout, elements: layout.elements.filter((el) => el.id !== "CENTER") }, 10);
  stipple(halo, rand, { x0: center.x - center.rx * 2, y0: center.y - center.ry * 2, x1: center.x + center.rx * 2, y1: center.y + center.ry * 2 }, 2.2 * grain, (x, y) => {
    const d = Math.hypot(x - center.x, y - center.y) / center.rx;
    const ring = Math.exp(-(((d - 1.08) / 0.07) ** 2)) * 0.8 + Math.exp(-(((d - 1.38) / 0.06) ** 2)) * 0.35;
    const mist = d > 1.08 ? 0.18 * Math.exp(-(d - 1.08) / 0.25) : 0.05;
    return (ring + mist) * others(x, y);
  }, [0.5 * grain, 0.9 * grain]);
  halo.fill(ctx, "240, 240, 244");

  // Star dust: mostly faint specks, a few bright ones, and a handful that glint.
  const dust = new Dots([0.12, 0.22, 0.34, 0.5, 0.7, 0.95]);
  const specks = (width * height) / 520;
  for (let i = 0; i < specks; i++) {
    const x = rand() * width;
    const y = rand() * height;
    if (Math.hypot(x - moon.x, y - moon.y) < moon.r * 1.1) continue;
    const b = rand() ** 3;
    dust.add(x, y, (0.4 + b * 0.9 + rand() * 0.25) * Math.sqrt(grain), b);
  }
  dust.fill(ctx, "255, 255, 255");
  for (let placed = 0, tries = 0; placed < 16 && tries < 400; tries++) {
    const x = 60 + rand() * (width - 120);
    const y = 60 + rand() * (height - 120);
    if (clear(x, y) < 1 || Math.hypot(x - moon.x, y - moon.y) < moon.r * 2) continue;
    placed++;
    const s = 4 + rand() * 7;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 1.6);
    g.addColorStop(0, "rgba(255, 255, 255, 0.5)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s * 0.7, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s * 0.7, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}
