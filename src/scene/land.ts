// The land the farewell happens in: rolling dunes of dust under the stars, a
// hill rising to the left, and a stream of light flowing along the ridge where
// the sitter and the spirit stand holding hands. All of it is laid out here, in
// land units (1 is a figure's height), as seen by an eye standing a little way
// off and looking down at the two figures; the shaders carry every point from
// there into the scene (see LAND_GLSL).
//
// Land space: x across to the right, y up, and f straight ahead of the eye
// along the ground. The sitter's feet are at y = 0.

import { prepare, scatter, SITTER, SPIRIT, type Figure } from "./figure";

/** The eye: how high above the sitter's feet it is, and how far it looks down (radians). */
export const EYE = { height: 1.05, pitch: 0.2175 } as const;
/** Half the camera's field of view, up and down, as its tangent (FOV in stage.ts). */
const TAN = Math.tan((35 * Math.PI) / 360);
/** Where the sitter shows in the view, in view units (half-heights of the view about its middle, y up): across, their feet, and how tall. */
export const FRAME = { x: 0.2, feet: 0.12, tall: 0.55 } as const;

/**
 * How the farewell is framed in a view `aspect` wide for its height. A wide
 * view shows it as laid out here; a narrow one (a phone held upright) draws it
 * smaller, about the height of the figures' feet, and moves the two figures
 * to its middle. `zoom` is how much smaller, `across` how far it moves (view
 * units), and `aspect` how wide the view is in the land's own framing, for
 * laying it out.
 */
export function framing(aspect: number): { zoom: number; across: number; aspect: number } {
  // Shown in full in a view at least this wide for its height.
  const zoom = Math.min(1, aspect / 0.57);
  // The middle of the pair as laid out, from the spirit's back to the sitter's hanging hand.
  const middle = -0.045;
  const across = -middle * zoom * (1 - smoothstep(0.5, 1, aspect));
  return { zoom, across, aspect: (aspect + Math.abs(across)) / zoom };
}

/** What each point becomes in the farewell. */
export const ROLE = { sitter: 0, spirit: 1, spray: 2, stream: 3, ground: 4 } as const;

/** Shares of the points for each part of the picture; the rest are ground. */
const SHARE = { sitter: 0.28, spirit: 0.15, spray: 0.02, stream: 0.42 };

type Pt = readonly [number, number];
type Curve = (x: number) => [number, number];

/** A smooth curve over the ground, given as how far ahead it lies (f) at each x. Returns f and its slope. */
function curve(points: Pt[]): Curve {
  const n = points.length;
  const slope = points.map((_, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (x: number) => {
    if (x <= points[0][0]) return [points[0][1] + slope[0] * (x - points[0][0]), slope[0]];
    if (x >= points[n - 1][0]) return [points[n - 1][1] + slope[n - 1] * (x - points[n - 1][0]), slope[n - 1]];
    let i = 0;
    while (x > points[i + 1][0]) i++;
    const [x0, f0] = points[i];
    const [x1, f1] = points[i + 1];
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const m0 = slope[i] * h;
    const m1 = slope[i + 1] * h;
    const f = (2 * t3 - 3 * t2 + 1) * f0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * f1 + (t3 - t2) * m1;
    const df = ((6 * t2 - 6 * t) * f0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * f1 + (3 * t2 - 2 * t) * m1) / h;
    return [f, df];
  };
}

/** The view's coordinates for a place traced as it shows across and up from the sitter's feet, in sitter heights. */
function inFrame(u: number, v: number): Pt {
  return [FRAME.x + u * FRAME.tall, FRAME.feet + v * FRAME.tall];
}

/** Where the eye's line through a place in the view, (vx, vy), comes to height h: across and how far ahead. */
function atHeight(vx: number, vy: number, h: number): Pt {
  const c = Math.cos(EYE.pitch);
  const s = Math.sin(EYE.pitch);
  const rise = h - EYE.height;
  const f = (rise * (c + vy * TAN * s)) / (vy * TAN * c - s);
  return [vx * (f * c - rise * s) * TAN, f];
}

/** Where the same line has come to by f ahead: across, and how high. */
function atDistance(vx: number, vy: number, f: number): Pt {
  const c = Math.cos(EYE.pitch);
  const s = Math.sin(EYE.pitch);
  const rise = (f * (vy * TAN * c - s)) / (c + vy * TAN * s);
  return [vx * (f * c - rise * s) * TAN, EYE.height + rise];
}

/** The place on the ground at height h that shows at (u, v), across and up from the sitter's feet in the view. */
function onGround(u: number, v: number, h: number): Pt {
  const [vx, vy] = inFrame(u, v);
  return atHeight(vx, vy, h);
}

/** A line across the land: how far ahead it lies and how high, for each x from one end to the other. */
interface Line {
  at: Curve;
  height: (x: number) => number;
  from: number;
  to: number;
}

/** A line traced as it shows in the view (see onGround), lying at height h, or (with `far`) all at one distance ahead. */
function traced(points: Pt[], place: { h: number } | { far: number }): Line {
  const land = points.map(([u, v]) => {
    const [vx, vy] = inFrame(u, v);
    if ("h" in place) {
      const [x, f] = atHeight(vx, vy, place.h);
      return { x, f, h: place.h };
    }
    const [x, h] = atDistance(vx, vy, place.far);
    return { x, f: place.far, h };
  });
  const heights = curve(land.map((p) => [p.x, p.h]));
  return { at: curve(land.map((p) => [p.x, p.f])), height: (x) => heights(x)[0], from: land[0].x, to: land[land.length - 1].x };
}

/** A crest in the land, and how far its slopes reach toward the eye and away. */
interface Crest {
  line: Line;
  front: number;
  back: number;
  /** Whether it runs on past its ends (the ridge does), or sinks away there. */
  endless?: boolean;
}

/** The ridge the figures stand on, with the stream flowing along it. */
const RIDGE = traced(
  [
    [-5, 0.42], [-2.807, 0.3], [-2.14, 0.3], [-1.807, 0.267], [-1.473, 0.207], [-1.14, 0.153], [-0.807, 0.107],
    [-0.473, 0.06], [0, -0.03], [0.193, -0.065], [0.527, -0.093], [0.86, -0.113], [1.193, -0.133], [1.527, -0.147],
    [1.86, -0.16], [2.093, -0.173], [4, -0.22],
  ],
  { h: 0 },
);
/** The hill to the left, rising behind the spirit. */
const HILL = traced([[-5, 0.5], [-2.807, 0.687], [-2.307, 0.707], [-2.14, 0.753], [-1.807, 0.8], [-1.473, 0.83], [-1.14, 0.85], [-0.873, 0.84], [-0.6, 0.8]], { far: 12 });
/** Dunes in front of the ridge: two on the left, and a big one close in front on the right. */
const DUNES = [
  traced([[-5, -0.62], [-2.473, -0.293], [-2.307, -0.22], [-2.14, -0.167], [-1.807, -0.12], [-1.473, -0.087], [-1.14, -0.067], [-0.807, -0.06], [-0.473, -0.07], [0, -0.12]], { h: -0.12 }),
  traced([[-4, -0.9], [-2.307, -0.447], [-2.14, -0.387], [-1.973, -0.333], [-1.64, -0.253], [-1.2, -0.25]], { h: -0.3 }),
  traced([[-1.6, -1.1], [-1.07, -0.85], [-0.273, -0.68], [0.193, -0.613], [0.527, -0.587], [0.86, -0.587], [1.193, -0.613], [1.527, -0.66], [1.86, -0.713], [2.093, -0.76], [3.5, -0.95]], { h: -0.35 }),
];
/** A filament leaving the stream and running down toward the eye, and another rising away from it. */
const FALLING = traced([[0.393, -0.12], [0.727, -0.167], [0.893, -0.19], [1.06, -0.267], [1.26, -0.4], [1.527, -0.56], [1.86, -0.78], [2.027, -0.893], [3, -1.4]], { h: -0.12 });
const RISING = traced([[1.027, -0.147], [1.36, -0.127], [1.693, -0.093], [2.027, -0.067], [3.5, 0]], { h: -0.04 });
const CRESTS: Crest[] = [
  { line: RIDGE, front: 1.9, back: 1.8, endless: true },
  { line: HILL, front: 2.6, back: 3 },
  { line: DUNES[0], front: 0.45, back: 1.1 },
  { line: DUNES[1], front: 0.4, back: 0.9 },
  { line: DUNES[2], front: 0.5, back: 1.1 },
  { line: FALLING, front: 0.5, back: 0.4 },
  { line: RISING, front: 0.5, back: 0.5 },
];

/** How far a point lies beyond a curve, measured square to it (negative: between it and the eye). */
function beyond(c: Curve, x: number, f: number): number {
  const [cf, slope] = c(x);
  return (f - cf) / Math.sqrt(1 + slope * slope);
}

/** The larger of two heights, blended where they meet so the land has no creases. */
function smax(a: number, b: number, k = 0.12): number {
  return (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
}

/** The height of the ground, worked out in full. */
function exactGround(x: number, f: number): number {
  let h = -0.5 + 0.04 * Math.sin(0.7 * x + 0.3 * f);
  for (const { line, front, back, endless } of CRESTS) {
    const d = beyond(line.at, x, f);
    const w = d < 0 ? front : back;
    // Past its ends a crest sinks away into the dunes.
    const sink = endless ? 0 : 1.5 * (1 - smoothstep(line.from - 1.2, line.from, x) * smoothstep(line.to + 1.2, line.to, x));
    h = smax(h, line.height(Math.max(line.from, Math.min(line.to, x))) - sink - (d / w) * (d / w));
  }
  // Ripples in the dust.
  return h + 0.02 * Math.sin(1.9 * x + 0.8 * f) * Math.sin(1.3 * f - 0.5 * x);
}

/** How much the streams light the ground about them, worked out in full: about as far each side as the eye sees, wherever they are. */
function exactGlow(x: number, f: number): number {
  const [rf] = RIDGE.at(x);
  const r = beyond(RIDGE.at, x, f) / Math.max(1, rf);
  return (
    Math.exp(-((r / (r < 0 ? 0.12 : 0.07)) ** 2)) * (1 - 0.45 * smoothstep(1, 5, x)) +
    0.25 * Math.exp(-((beyond(FALLING.at, x, f) / 0.3) ** 2)) * smoothstep(FALLING.from - 0.5, FALLING.from + 0.5, x) +
    0.15 * Math.exp(-((beyond(RISING.at, x, f) / 0.3) ** 2)) * smoothstep(RISING.from - 0.5, RISING.from + 0.5, x)
  );
}

/** The ground's height, and the streams' light on it, on a fine grid, worked out once, for looking up quickly. */
const GRID = { x0: -21, f0: 0.4, step: 0.09, columns: 467, rows: 281 };
let surface: { heights: Float32Array; glows: Float32Array } | null = null;

/** Works out the grid a few rows at a time, yielding between them. */
function* prepareLand(): Generator<void, void> {
  if (surface) return;
  const heights = new Float32Array(GRID.columns * GRID.rows);
  const glows = new Float32Array(GRID.columns * GRID.rows);
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.columns; c++) {
      const x = GRID.x0 + c * GRID.step;
      const f = GRID.f0 + r * GRID.step;
      heights[r * GRID.columns + c] = exactGround(x, f);
      glows[r * GRID.columns + c] = exactGlow(x, f);
    }
    if (r % 6 === 5) yield;
  }
  surface ??= { heights, glows };
}

function lookUp(x: number, f: number, which: "heights" | "glows", exact: (x: number, f: number) => number): number {
  const gx = (x - GRID.x0) / GRID.step;
  const gf = (f - GRID.f0) / GRID.step;
  const i = Math.floor(gx);
  const j = Math.floor(gf);
  if (i < 0 || j < 0 || i >= GRID.columns - 1 || j >= GRID.rows - 1) return exact(x, f);
  if (!surface) for (const _ of prepareLand());
  const grid = surface![which];
  const u = gx - i;
  const v = gf - j;
  const a = j * GRID.columns + i;
  const b = a + GRID.columns;
  return (grid[a] * (1 - u) + grid[a + 1] * u) * (1 - v) + (grid[b] * (1 - u) + grid[b + 1] * u) * v;
}

/** The height of the ground. */
export function ground(x: number, f: number): number {
  return lookUp(x, f, "heights", exactGround);
}

/** How much the streams light the ground at a place. */
function glowAt(x: number, f: number): number {
  return lookUp(x, f, "glows", exactGlow);
}

/** The same, for the shaders: fromLand carries a point from land space into the scene, viewY tells how high it shows. */
export const LAND_GLSL = (() => {
  const c = Math.cos(EYE.pitch);
  const s = Math.sin(EYE.pitch);
  // The sitter stands on the board's plane, so they stay put while the eye sways and the land slides past.
  const depth = onGround(0, 0, 0)[1] * c + EYE.height * s;
  const n = (v: number) => v.toFixed(6);
  return /* glsl */ `
uniform vec2 uFrame;  // how the farewell is framed: how much smaller it is drawn, and how far across it moves (see framing)

vec3 fromLand(vec3 q) {
  float h = q.y - ${n(EYE.height)};
  vec3 c = vec3(q.x, h * ${n(c)} + q.z * ${n(s)}, h * ${n(s)} - q.z * ${n(c)});
  // Framed for the view: drawn smaller about the height of the feet, and moved across.
  float across = -c.z * ${n(TAN)};
  c.xy = c.xy * uFrame.x + vec2(uFrame.y, ${n(FRAME.feet)} * (1.0 - uFrame.x)) * across;
  return vec3(uView.xy, uDistance) + c * (uDistance / ${n(depth)});
}

float viewY(vec3 q) {
  float h = q.y - ${n(EYE.height)};
  float y = (h * ${n(c)} + q.z * ${n(s)}) / ((q.z * ${n(c)} - h * ${n(s)}) * ${n(TAN)});
  return (y - ${n(FRAME.feet)}) * uFrame.x + ${n(FRAME.feet)};
}

/** The land fades out toward the bottom of the view, where RESTART is written. */
float landFade(vec3 q) {
  return smoothstep(${n(FRAME.feet - 1.25 * FRAME.tall)}, ${n(FRAME.feet - 0.4 * FRAME.tall)}, viewY(q));
}
`;
})();

/**
 * Where a point in land space shows, as laid out (before it is framed for the
 * view), in view units (half-heights of the view about its middle, y up), and
 * how far ahead of the eye it is.
 */
export function project(x: number, y: number, f: number): { x: number; y: number; depth: number } {
  const c = Math.cos(EYE.pitch);
  const s = Math.sin(EYE.pitch);
  const h = y - EYE.height;
  const depth = f * c - h * s;
  return { x: x / (depth * TAN), y: (h * c + f * s) / (depth * TAN), depth };
}

/** Which way the moonlight comes from: high up, from the left and behind the eye. */
const MOON = (() => {
  const v = [-0.55, 0.65, -0.5];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((n) => n / l);
})();

/** The streams of light: where each flows, how thickly its grains lie along it in the view, how wide it runs, and how bright. */
const STREAMS: { line: Line; thick: number; width: number; bright: number }[] = [
  { line: RIDGE, thick: 1.5, width: 1, bright: 1 },
  { line: FALLING, thick: 0.4, width: 0.5, bright: 0.9 },
  { line: RISING, thick: 0.25, width: 0.45, bright: 0.8 },
  // Dust blowing along the crests of the dunes and the hill, in thinner threads.
  { line: HILL, thick: 0.3, width: 0.3, bright: 0.65 },
  { line: DUNES[0], thick: 0.42, width: 0.2, bright: 0.9 },
  { line: DUNES[1], thick: 0.16, width: 0.18, bright: 0.6 },
  { line: DUNES[2], thick: 0.42, width: 0.22, bright: 0.9 },
];

/**
 * A line as the eye sees it: its points from end to end with how far along
 * each is in the view, counting only what is in sight, so grains can be spread
 * evenly along what shows.
 */
function inSight(line: Line, from: number, to: number, aspect: number): { x: number[]; along: number[] } {
  const x: number[] = [];
  const along: number[] = [];
  let total = 0;
  let last: { x: number; y: number } | null = null;
  const steps = Math.ceil((to - from) / 0.02);
  for (let i = 0; i <= steps; i++) {
    const px = from + ((to - from) * i) / steps;
    const pf = line.at(px)[0];
    if (pf < 1) {
      last = null;
      continue;
    }
    const p = project(px, line.height(Math.max(line.from, Math.min(line.to, px))), pf);
    const seen = Math.abs(p.x) < aspect * 1.15 && p.y > -1.2 && p.y < 1.2;
    if (last && seen) total += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
    x.push(px);
    along.push(total);
  }
  return { x, along };
}

export interface FarewellLayout {
  /** For each point: where it is in land space and what it is (ROLE). */
  end: Float32Array;
  /** For each point: how bright it is; for the stream, which way it flows (radians), how steeply, and how far it runs. */
  look: Float32Array;
  /** The extra dust: where each grain lies in land space, and how brightly it is lit. */
  dust: Float32Array;
}

/** Where the sitter stands, and the spirit, a little further off, with their hands meeting. */
function placeFigures() {
  const [sx, sf] = onGround(0, 0, 0);
  const [, gf] = onGround(-0.94, 0.107, 0);
  const sitter = { x: sx, y: ground(sx, sf), f: sf, lean: 0 };
  const hand = { x: sx + SITTER.hand[0] - 0.02, y: sitter.y + SITTER.hand[1], f: (sf + gf) / 2 };
  // Each turns a little toward the other, so their hands meet in depth too.
  sitter.lean = (hand.f - sf) / SITTER.hand[0];
  const spirit = { x: 0, y: 0, f: gf, lean: 0, scale: 1 };
  for (let i = 0; i < 4; i++) {
    spirit.x = hand.x - SPIRIT.hand[0] * spirit.scale;
    spirit.y = ground(spirit.x, spirit.f);
    spirit.scale = (hand.y - spirit.y) / SPIRIT.hand[1];
  }
  spirit.lean = (hand.f - spirit.f) / (SPIRIT.hand[0] * spirit.scale);
  return { sitter, spirit, hand };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A rough normal deviate. */
function gaussLike(rand: () => number): number {
  return (rand() + rand() + rand() - 1.5) * 2;
}

/**
 * Lays out the farewell for the board's `n` points: how many go to each part
 * of the picture, and where each one is; and `m` more grains of dust for the
 * ground. `aspect` is the view's width for its height, which sets how wide the
 * land must reach. It works a little at a time, yielding between steps, so it
 * can be spread over many frames; the last step returns the layout.
 */
export function* layOutFarewell(n: number, m: number, aspect: number, rand: () => number): Generator<void, FarewellLayout> {
  yield* prepareLand();
  yield* prepare(SITTER);
  yield* prepare(SPIRIT);
  const grain = groundGrains(aspect, rand);
  yield;
  const end = new Float32Array(n * 4);
  const look = new Float32Array(n * 4);
  const { sitter, spirit, hand } = placeFigures();
  let k = 0;
  const put = (x: number, y: number, f: number, role: number, a = 0, b = 0, c = 0, d = 0) => {
    end.set([x, y, f, role], k * 4);
    look.set([a, b, c, d], k * 4);
    k++;
  };

  // The figures: points all through their bodies, with a little thickness, and how deep in each one is.
  const figurePoints = (fig: Figure, count: number, at: { x: number; y: number; f: number; lean: number }, scale: number, role: number) => {
    // The spirit's edges come apart in the air.
    const fray = role === ROLE.spirit ? 0.016 : 0;
    for (const p of scatter(fig, count, rand)) {
      const loose = fray * (1 - p.depth) ** 2;
      const x = at.x + (p.x + loose * gaussLike(rand)) * scale;
      const y = at.y + (p.y + loose * gaussLike(rand)) * scale;
      const f = at.f + at.lean * p.x * scale + (rand() - 0.5) * 0.08 * Math.sqrt(p.depth);
      put(x, y, f, role, p.depth, p.y);
    }
  };
  figurePoints(SITTER, Math.round(n * SHARE.sitter), sitter, 1, ROLE.sitter);
  figurePoints(SPIRIT, Math.round(n * SHARE.spirit), spirit, spirit.scale, ROLE.spirit);
  yield;
  // Spray: grains the wind has taken off the spirit, and round their hands.
  const sprays = Math.round(n * SHARE.spray);
  for (let i = 0; i < sprays; i++) {
    const nearHands = rand() < 0.15;
    const p = nearHands ? { x: hand.x, y: hand.y, f: hand.f } : { x: spirit.x, y: spirit.y + spirit.scale * (0.15 + 0.8 * rand()), f: spirit.f };
    const spread = nearHands ? 0.12 : 0.22;
    put(p.x + (rand() - 0.4) * spread * 2, p.y + (rand() - 0.5) * spread, p.f + (rand() - 0.5) * 0.3, ROLE.spray, rand());
  }

  // A bush on the hill's crest, far to the left.
  const [bx, bh] = atDistance(...inFrame(-2.6, 0.745), 12);
  for (let i = 0, bushes = Math.round(n * 0.006); i < bushes; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    put(bx + Math.cos(a) * r * 0.32, bh + 0.05 + Math.abs(Math.sin(a)) * r * 0.2, 12 + (rand() - 0.5) * 0.3, ROLE.ground, 0.75 + 0.3 * rand());
  }

  // The streams: grains flowing along the ridge and the filaments leaving it, in braided threads, and dust
  // blowing along the crests, spread evenly along each as it shows in the view: a dense core, and a looser
  // haze about it that rises off the ground.
  const sights = STREAMS.map((stream) => {
    const { line } = stream;
    const sight = inSight(line, line === RIDGE ? -16 : line.from, line === RIDGE ? 16 : line.to, aspect);
    return { ...stream, ...sight, weight: stream.thick * sight.along[sight.along.length - 1] };
  });
  const totalWeight = sights.reduce((sum, s) => sum + s.weight, 0);
  const streams = Math.round(n * SHARE.stream);
  for (let i = 0; i < streams; ) {
    let pick = rand() * totalWeight;
    const stream = sights.find((s) => (pick -= s.weight) < 0) ?? sights[0];
    const { line, x: xs, along } = stream;
    // Where along it, as the eye sees it.
    const at = rand() * along[along.length - 1];
    let lo = 0;
    let hi = along.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (along[mid] < at) lo = mid;
      else hi = mid;
    }
    const x = xs[lo] + (xs[hi] - xs[lo]) * ((at - along[lo]) / Math.max(1e-6, along[hi] - along[lo]));
    // The ridge's stream runs thinner past the sitter, out to the right.
    if (line === RIDGE && rand() < 0.45 * smoothstep(1, 5, x)) continue;
    i++;
    const [cf, slope] = line.at(x);
    const thread = Math.floor(rand() * 3);
    const core = rand() < 0.68;
    const braid = 0.16 * Math.sin(x * (0.9 + 0.35 * thread) + thread * 2.1);
    // A stream spreads wider further off, so it shows about as thick wherever it is.
    const spread = (stream.width * cf) / 6.5;
    const across = (core ? 0.06 * gaussLike(rand) + 0.4 * braid : braid + 0.26 * gaussLike(rand)) * spread;
    const norm = Math.sqrt(1 + slope * slope);
    const px = x - (slope * across) / norm;
    const pf = cf + across / norm;
    const rise = ((line === RIDGE ? (core ? 0.07 : 0.3) : 0.06) * cf) / 6.5;
    const y = ground(px, pf) + 0.01 + rise * rand() ** 1.5;
    // Which way it flows: along the line, rightward, and how much it climbs as it goes.
    const angle = Math.atan(slope);
    const step = 0.05;
    const climb = (ground(px + Math.cos(angle) * step, pf + Math.sin(angle) * step) - ground(px, pf)) / step;
    // Thinning out toward the ends of the lines that have them.
    const ends = line === RIDGE ? 1 : smoothstep(line.from, line.from + 0.8, x) * smoothstep(line.to, line.to - 0.8, x);
    put(px, y, pf, ROLE.stream, angle, climb, 0.35 + 0.3 * rand(), stream.bright * ends * (core ? 1 : 0.7));
    if (i % 1500 === 0) yield;
  }

  // The ground: as many grains as are left.
  while (k < n) {
    const g = grain();
    if (!g) break;
    put(g[0], g[1], g[2], ROLE.ground, g[3]);
    if (k % 1500 === 0) yield;
  }
  // If the ground ran out of places for grains, the rest lie far off, unseen.
  while (k < n) put(0, -50, 40, ROLE.ground, 0);

  // And more dust on the ground, for the layer that only shows in the farewell.
  const dust = new Float32Array(m * 4);
  for (let i = 0; i < m; i++) {
    dust.set(grain() ?? [0, -50, 40, 0], i * 4);
    if (i % 1500 === 1499) yield;
  }
  return { end, look, dust };
}

/**
 * Grains of dust on the ground, one at a time: spread over the land where the
 * eye can see it, a little thinner further off, so they crowd together wherever
 * the ground is seen edge-on, along its crests and far away. More lie where the
 * moon or the stream lights the ground. The land reaches back over the hill on
 * the left, but not far beyond the figures on the right. Each is where it lies
 * in land space, and how brightly it is lit.
 */
function groundGrains(aspect: number, rand: () => number): () => [number, number, number, number] | null {
  const horizon = occluder(aspect);
  const reach = (f: number) => (aspect * 1.12 + 0.1) * f * TAN;
  const near = 2.4;
  const far = 22;
  const edge = (x: number) => 8 + 6 * smoothstep(1.5, -3, x);
  return () => {
    for (let tries = 0; tries < 200; tries++) {
      const f = near * (far / near) ** rand();
      const x = (rand() * 2 - 1) * reach(f);
      if (rand() > smoothstep(edge(x) + 1.5, edge(x) - 1, f)) continue;
      const y = ground(x, f);
      if (!horizon.sees(x, y, f)) continue;
      const e = 0.03;
      const nx = -(ground(x + e, f) - ground(x - e, f)) / (2 * e);
      const nf = -(ground(x, f + e) - ground(x, f - e)) / (2 * e);
      const nl = Math.hypot(nx, 1, nf);
      const lit = Math.max(0, (nx * MOON[0] + MOON[1] + nf * MOON[2]) / nl);
      // The streams light the ground beside them, and the dust gathers there; and on the face of the hill.
      const glow = glowAt(x, f);
      // The hill's face is brightest far over to the left.
      const high = smoothstep(0.05, 0.35, y) * (0.4 + 0.6 * lit) * (1 + 0.5 * smoothstep(-2, -6, x));
      // Behind the ridge to the right the land falls away into the dark.
      const beyondRidge = smoothstep(0.5, 2.5, x) * smoothstep(0.3, 1.5, beyond(RIDGE.at, x, f));
      const want = Math.min(1, (0.05 + 0.2 * lit ** 3 + 0.9 * high + 0.55 * glow) * (1 - 0.85 * beyondRidge));
      // Grains are offered evenly over the ground, so ground facing the eye shows fewer of them for its size
      // than ground seen edge-on; taking more of them where it faces the eye squarely evens that out, partly,
      // so crests still gather a few more, and what is left is how brightly each place should show.
      const tx = -x;
      const ty = EYE.height - y;
      const tf = -f;
      const facing = Math.max(0, (nx * tx + ty + nf * tf) / (nl * Math.hypot(tx, ty, tf)));
      if (rand() > want * Math.sqrt(facing / 0.4)) continue;
      const light = 0.35 + 0.65 * want;
      return [x, y, f, light];
    }
    return null;
  };
}

/**
 * Which ground the eye can see: for directions across the view, the highest the
 * ground rises (as a slope from the eye) at every distance out, so a grain
 * hidden behind a nearer crest can be left out.
 */
function occluder(aspect: number) {
  const columns = 240;
  const rows = 160;
  const near = 1.2;
  const far = 40;
  const wide = Math.atan((aspect * 1.12 + 0.2) * TAN);
  const table = new Float32Array(columns * rows);
  const at = (row: number) => near * (far / near) ** (row / (rows - 1));
  for (let c = 0; c < columns; c++) {
    const a = -wide + (2 * wide * c) / (columns - 1);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    let top = -Infinity;
    for (let r = 0; r < rows; r++) {
      const d = at(r);
      table[c * rows + r] = top;
      top = Math.max(top, (ground(d * sin, d * cos) - EYE.height) / d);
    }
  }
  return {
    sees(x: number, y: number, f: number): boolean {
      const d = Math.hypot(x, f);
      const c = Math.round(((Math.atan2(x, f) + wide) / (2 * wide)) * (columns - 1));
      if (c < 0 || c >= columns) return true;
      const r = Math.floor((Math.log(d / near) / Math.log(far / near)) * (rows - 1));
      if (r <= 0) return true;
      return (y - EYE.height) / d >= table[c * rows + Math.min(rows - 1, r)] - 0.004;
    },
  };
}

/** Runs a piece of work that yields as it goes straight through to its end. */
export function finish<T>(work: Generator<void, T>): T {
  for (;;) {
    const step = work.next();
    if (step.done) return step.value;
  }
}
