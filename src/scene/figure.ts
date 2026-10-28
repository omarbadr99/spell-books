// A standing figure in a long coat, reaching out with one hand, seen from the
// side. The farewell shows two of them meeting: the spirit, sampled into
// particles from a mask of this shape, and the sitter, drawn solid with the
// same porcelain gradients as the planchette.
//
// The shape is in figure units: 1 is its height, its feet stand at y = 0 and
// it faces right, its hand reaching to about x = 0.33.

import type { Drawn } from "./masks";

type Pt = readonly [number, number];
/** A limb: a stroke that tapers from one radius to another. */
interface Limb {
  a: Pt;
  b: Pt;
  ra: number;
  rb: number;
}

const HEAD = { x: 0.018, y: 0.912, rx: 0.05, ry: 0.061, tilt: -0.12 };
/** The coat, from the back of the shoulders round to the front, smoothed through these points. */
const COAT: Pt[] = [
  [-0.07, 0.83],
  [0.045, 0.835],
  [0.072, 0.75],
  [0.062, 0.6],
  [0.072, 0.47],
  [0.098, 0.17],
  [0.02, 0.15],
  [-0.1, 0.16],
  [-0.085, 0.47],
  [-0.074, 0.6],
  [-0.088, 0.74],
];
const LIMBS: Limb[] = [
  // Neck.
  { a: [0.008, 0.865], b: [0.002, 0.825], ra: 0.026, rb: 0.03 },
  // The arm that reaches out, and its hand.
  { a: [0.04, 0.79], b: [0.16, 0.7], ra: 0.031, rb: 0.025 },
  { a: [0.16, 0.7], b: [0.29, 0.655], ra: 0.025, rb: 0.018 },
  { a: [0.288, 0.655], b: [0.33, 0.648], ra: 0.02, rb: 0.012 },
  // The arm that hangs.
  { a: [-0.058, 0.79], b: [-0.082, 0.63], ra: 0.03, rb: 0.024 },
  { a: [-0.082, 0.63], b: [-0.07, 0.48], ra: 0.024, rb: 0.018 },
  { a: [-0.07, 0.48], b: [-0.066, 0.44], ra: 0.019, rb: 0.012 },
  // Legs below the coat, and feet.
  { a: [-0.035, 0.18], b: [-0.045, 0.025], ra: 0.033, rb: 0.024 },
  { a: [0.035, 0.18], b: [0.052, 0.025], ra: 0.033, rb: 0.024 },
  { a: [-0.06, 0.014], b: [-0.005, 0.01], ra: 0.016, rb: 0.013 },
  { a: [0.04, 0.014], b: [0.098, 0.01], ra: 0.016, rb: 0.013 },
];
/** Where the reaching hand ends, in figure units. */
export const HAND = { x: 0.335, y: 0.648 };

/** A smooth closed path through points (Catmull-Rom as Bézier curves), in SVG path syntax. */
function smoothPath(points: Pt[], map: (p: Pt) => Pt): string {
  const p = points.map(map);
  const n = p.length;
  let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p[(i - 1 + n) % n], p[i], p[(i + 1) % n], p[(i + 2) % n]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d} Z`;
}

/** A tapered limb as a closed outline: two half circles joined by their tangents. */
function limbPath(limb: Limb, map: (p: Pt) => Pt, scale: number): string {
  const a = map(limb.a);
  const b = map(limb.b);
  const ra = limb.ra * scale;
  const rb = limb.rb * scale;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Turned a quarter to the side.
  const nx = -uy;
  const ny = ux;
  const f = (n: number) => n.toFixed(2);
  return [
    `M${f(a[0] + nx * ra)} ${f(a[1] + ny * ra)}`,
    `L${f(b[0] + nx * rb)} ${f(b[1] + ny * rb)}`,
    `A${f(rb)} ${f(rb)} 0 0 0 ${f(b[0] - nx * rb)} ${f(b[1] - ny * rb)}`,
    `L${f(a[0] - nx * ra)} ${f(a[1] - ny * ra)}`,
    `A${f(ra)} ${f(ra)} 0 0 0 ${f(a[0] + nx * ra)} ${f(a[1] + ny * ra)}`,
    "Z",
  ].join(" ");
}

/**
 * The figure as SVG paths, `height` pixels tall, with its feet at the bottom
 * middle of a box `height` square. `facing` is 1 for right and -1 for left.
 */
export function figurePaths(height: number, facing: 1 | -1): string[] {
  const map = (p: Pt): Pt => [height / 2 + facing * p[0] * height, height * (1 - p[1])];
  const head = map([HEAD.x, HEAD.y]);
  const tilt = (facing * HEAD.tilt * 180) / Math.PI;
  return [
    smoothPath(COAT, map),
    ...LIMBS.map((limb) => limbPath(limb, map, height)),
    `M${(head[0] - HEAD.rx * height).toFixed(2)} ${head[1].toFixed(2)} a${(HEAD.rx * height).toFixed(2)} ${(HEAD.ry * height).toFixed(2)} ${tilt.toFixed(1)} 1 0 ${(2 * HEAD.rx * height).toFixed(2)} 0 a${(HEAD.rx * height).toFixed(2)} ${(HEAD.ry * height).toFixed(2)} ${tilt.toFixed(1)} 1 0 ${(-2 * HEAD.rx * height).toFixed(2)} 0 Z`,
  ];
}

/** The figure drawn into a mask `px` pixels tall, for the particles to be sampled from. */
export function figureMask(px: number, facing: 1 | -1): Drawn {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(px);
  canvas.height = Math.ceil(px);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  for (const d of figurePaths(px, facing)) ctx.fill(new Path2D(d));
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  // Its middle is where the feet stand: the bottom middle.
  return { alpha, width: canvas.width, height: canvas.height, cx: canvas.width / 2, cy: canvas.height };
}
