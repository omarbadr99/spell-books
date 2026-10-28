// The two figures in the farewell, holding hands: the sitter, walking away from
// us and reaching back, and the spirit facing them, reaching out. Each is drawn
// from a few simple parts (a head, a body, tapered limbs), and the particles
// are scattered through those parts.
//
// The shapes are in figure units: 1 is a figure's height, its feet stand at
// y = 0 and y points up.

type Pt = readonly [number, number];

/** A part of a figure: an ellipse, a stroke tapering from one radius to another, or a smooth outline. */
type Part =
  | { kind: "head"; x: number; y: number; rx: number; ry: number; tilt: number }
  | { kind: "limb"; a: Pt; b: Pt; ra: number; rb: number }
  | { kind: "body"; outline: Pt[]; bounds: { x0: number; x1: number; y0: number; y1: number } };

export interface Figure {
  parts: Part[];
  /** Where its reaching hand ends. */
  hand: Pt;
  /** Its bounds, for scattering points through it. */
  box: { x0: number; x1: number; y0: number; y1: number };
}

/** A body's outline: a smooth closed curve through points, and its bounds. */
function body(points: Pt[]): Part {
  const outline = smooth(points);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  return { kind: "body", outline, bounds: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
}

/** A smooth closed curve through points (Catmull-Rom), as a polygon fine enough to test against. */
function smooth(points: Pt[], steps = 6): Pt[] {
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (j: 0 | 1) =>
        0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  return out;
}

function figure(parts: Part[], hand: Pt): Figure {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const grow = (x: number, y: number, r: number) => {
    box.x0 = Math.min(box.x0, x - r);
    box.x1 = Math.max(box.x1, x + r);
    box.y0 = Math.min(box.y0, y - r);
    box.y1 = Math.max(box.y1, y + r);
  };
  for (const part of parts) {
    if (part.kind === "head") grow(part.x, part.y, Math.max(part.rx, part.ry));
    else if (part.kind === "limb") {
      grow(part.a[0], part.a[1], part.ra);
      grow(part.b[0], part.b[1], part.rb);
    } else for (const [x, y] of part.outline) grow(x, y, 0);
  }
  return { parts, hand, box };
}

/** The sitter, seen from behind, walking off to the right in a long coat and reaching back with their right hand. */
export const SITTER: Figure = figure(
  [
    { kind: "head", x: -0.045, y: 0.933, rx: 0.068, ry: 0.074, tilt: 0.05 },
    { kind: "limb", a: [-0.04, 0.88], b: [-0.03, 0.82], ra: 0.05, rb: 0.058 },
    body([
      [-0.13, 0.8], [-0.08, 0.835], [0, 0.845], [0.07, 0.835], [0.12, 0.805], [0.142, 0.75], [0.146, 0.69], [0.135, 0.6],
      [0.122, 0.54], [0.115, 0.42], [0.1, 0.24], [0.075, 0.06], [0.065, 0], [-0.07, 0], [-0.078, 0.06], [-0.1, 0.24],
      [-0.113, 0.42], [-0.12, 0.54], [-0.132, 0.63], [-0.144, 0.72],
    ]),
    // The arm hanging at their side.
    { kind: "limb", a: [0.12, 0.78], b: [0.167, 0.57], ra: 0.04, rb: 0.034 },
    { kind: "limb", a: [0.167, 0.57], b: [0.197, 0.42], ra: 0.034, rb: 0.028 },
    { kind: "limb", a: [0.197, 0.42], b: [0.218, 0.36], ra: 0.028, rb: 0.02 },
    // The arm reaching back, and its hand.
    { kind: "limb", a: [-0.12, 0.785], b: [-0.364, 0.812], ra: 0.045, rb: 0.036 },
    { kind: "limb", a: [-0.364, 0.812], b: [-0.5, 0.85], ra: 0.036, rb: 0.028 },
    { kind: "limb", a: [-0.5, 0.85], b: [-0.545, 0.862], ra: 0.028, rb: 0.022 },
  ],
  [-0.545, 0.862],
);

/** The spirit, a robed figure facing the sitter and reaching out to them. */
export const SPIRIT: Figure = figure(
  [
    { kind: "head", x: 0, y: 0.913, rx: 0.08, ry: 0.082, tilt: -0.05 },
    { kind: "limb", a: [0, 0.86], b: [0, 0.8], ra: 0.05, rb: 0.06 },
    body([
      [-0.12, 0.79], [-0.07, 0.825], [0, 0.835], [0.07, 0.825], [0.12, 0.79], [0.138, 0.72], [0.136, 0.6], [0.132, 0.45],
      [0.12, 0.25], [0.1, 0.06], [0.09, 0], [-0.09, 0], [-0.1, 0.06], [-0.12, 0.25], [-0.132, 0.45], [-0.136, 0.6],
      [-0.138, 0.72],
    ]),
    { kind: "limb", a: [0.09, 0.79], b: [0.3, 0.825], ra: 0.042, rb: 0.032 },
    { kind: "limb", a: [0.3, 0.825], b: [0.48, 0.85], ra: 0.032, rb: 0.024 },
  ],
  [0.48, 0.85],
);

/** How far inside a part a point is: above 0 inside, 1 at its middle. */
function depthIn(part: Part, x: number, y: number): number {
  if (part.kind === "head") {
    const c = Math.cos(part.tilt);
    const s = Math.sin(part.tilt);
    const dx = x - part.x;
    const dy = y - part.y;
    const u = (dx * c + dy * s) / part.rx;
    const v = (-dx * s + dy * c) / part.ry;
    return 1 - Math.hypot(u, v);
  }
  if (part.kind === "limb") {
    const [ax, ay] = part.a;
    const dx = part.b[0] - ax;
    const dy = part.b[1] - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    const r = part.ra + (part.rb - part.ra) * t;
    return 1 - Math.hypot(x - ax - dx * t, y - ay - dy * t) / r;
  }
  // Inside the outline, by crossings; how deep, by the distance to its nearest edge.
  const o = part.outline;
  const b = part.bounds;
  if (x < b.x0 - 0.14 || x > b.x1 + 0.14 || y < b.y0 - 0.14 || y > b.y1 + 0.14) return -1;
  let inside = false;
  let near = Infinity;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [xi, yi] = o[i];
    const [xj, yj] = o[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const ex = xj - xi;
    const ey = yj - yi;
    const t = Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey)));
    near = Math.min(near, Math.hypot(x - xi - ex * t, y - yi - ey * t));
  }
  // Depth in units of a body's half width, about 0.14.
  return inside ? Math.min(1, near / 0.14) : -near / 0.14;
}

/** How far inside the figure a point is: above 0 inside, toward 1 deep within it. */
export function within(fig: Figure, x: number, y: number): number {
  let best = -Infinity;
  for (const part of fig.parts) best = Math.max(best, depthIn(part, x, y));
  return best;
}

export interface FigurePoint {
  x: number;
  y: number;
  /** How deep inside the figure it is, 0 at its edge to 1. */
  depth: number;
}

/** How deep inside each figure every spot of it is, on a fine grid, worked out once. */
const DEPTHS = new Map<Figure, { grid: Float32Array; columns: number; rows: number }>();
const CELL = 0.006;

/** Works out a figure's grid of depths a few rows at a time, yielding between them. */
export function* prepare(fig: Figure): Generator<void, void> {
  if (DEPTHS.has(fig)) return;
  const { x0, x1, y0, y1 } = fig.box;
  const columns = Math.ceil((x1 - x0) / CELL) + 1;
  const rows = Math.ceil((y1 - y0) / CELL) + 1;
  const grid = new Float32Array(columns * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) grid[r * columns + c] = within(fig, x0 + c * CELL, y0 + r * CELL);
    if (r % 6 === 5) yield;
  }
  DEPTHS.set(fig, { grid, columns, rows });
}

function depths(fig: Figure) {
  if (!DEPTHS.has(fig)) for (const _ of prepare(fig));
  return DEPTHS.get(fig)!;
}

/** Scatters `count` points evenly through a figure. */
export function scatter(fig: Figure, count: number, rand: () => number): FigurePoint[] {
  const { x0, y0 } = fig.box;
  const { grid, columns, rows } = depths(fig);
  const out: FigurePoint[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const gx = rand() * (columns - 1);
    const gy = rand() * (rows - 1);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const u = gx - i;
    const v = gy - j;
    const a = j * columns + i;
    const d = (grid[a] * (1 - u) + grid[a + 1] * u) * (1 - v) + (grid[a + columns] * (1 - u) + grid[a + columns + 1] * u) * v;
    if (d > 0) out.push({ x: x0 + gx * CELL, y: y0 + gy * CELL, depth: d });
  }
  return out;
}
