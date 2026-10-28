// The board's particles: every letter, number and word, and the candle, each
// sampled from its shape into a few hundred glowing points. Each point also
// knows where its glyph floats before the board forms (tipped and turned,
// somewhere in the depths of the dark), where it drifts as loose dust before
// even that, and which way its stroke's edge faces, so the light can catch it
// from the side.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from "three";
import type { BoardLayout } from "../board/layout";
import { candleMask, textMask } from "./masks";
import { coverage, KIND, sampleMask, seeded, type Sample } from "./sampling";
import { BOARD_VERTEX, POINT_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";

/** Masks are drawn at twice the board's units, for finer detail. */
export const OVERSAMPLE = 2;
/** Glyphs the shader can light one by one. */
export const MAX_GLYPHS = 64;
export const BOARD_FONT = "Cinzel, Georgia, 'Times New Roman', serif";

export interface BoardParticles {
  points: Points<BufferGeometry, ShaderMaterial>;
  /** Each glyph's slot in the shader's uGlow array. */
  slots: Map<string, number>;
}

/** Where the camera looks on the board's plane, in world space, and how far back it stands. */
export interface Eye {
  x: number;
  y: number;
  distance: number;
}

/** Where a glyph floats before the board forms: how far from its place, and how it is tipped and turned. */
interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** The candle's proportions, shared with the flame that sits on it. */
export function candleGeometry(layout: BoardLayout) {
  const { x, y, h } = layout.candle;
  const wickTop = y - h * 1.09;
  const flame = h * 0.27;
  return { x, base: y, h, width: h * 0.42, wickTop, flame, light: new Vector3(x, -(wickTop - flame * 0.45), 24) };
}

export function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where a glyph floats before the board forms. Glyphs near the board's middle
 * sink far back into the dark and those toward its edges come forward, each
 * turned to face in a little, as if lining a funnel the eye looks down; every
 * one is tipped a little its own way too. Seen from the eye, each still shows
 * about where it will sit on the board, the near ones a little further out, so
 * none swings out of view. `reach` is how far toward the eye or away it may go.
 */
function poseFor(x: number, y: number, reach: number, layout: BoardLayout, eye: Eye, rand: () => number): Pose {
  const across = (x - layout.width / 2) / (layout.width / 2);
  const up = -(y - layout.height / 2) / (layout.height / 2);
  const out = Math.min(1.2, Math.hypot(across, up * 0.85));
  const d = eye.distance;
  const depth = -0.75 + 1.3 * smoothstep(0.15, 0.95, out) + gauss(rand) * 0.1;
  const z = d * Math.min(0.6, Math.max(-0.95, depth * reach));
  // Where it shows on the screen, and the place in the air that shows there.
  const spread = 1 + 0.12 * Math.max(0, z / d);
  const sx = x + gauss(rand) * layout.width * 0.018;
  const sy = -y + gauss(rand) * layout.height * 0.02;
  const back = (d - z) / d;
  return {
    x: eye.x + (sx - eye.x) * spread * back - x,
    y: eye.y + (sy - eye.y) * spread * back + y,
    z,
    rx: 0.5 * up + gauss(rand) * 0.32,
    ry: 0.6 * across + gauss(rand) * 0.38,
    rz: gauss(rand) * 0.2,
  };
}

/**
 * Builds the particles for a layout. `density` is how many points to spend on
 * each square board unit of stroke, so finer screens can afford more; `eye` is
 * where the camera stands, which sets how far the glyphs float into the dark.
 */
export function buildBoard(layout: BoardLayout, density: number, eye: Eye): BoardParticles {
  const rand = seeded(layout.kind === "wide" ? 1911 : 1903);
  const home: number[] = [];
  const start: number[] = [];
  const seed: number[] = [];
  const info: number[] = [];
  const center: number[] = [];
  const pose: number[] = [];
  const tilt: number[] = [];
  const slots = new Map<string, number>();

  const place = (
    points: Sample[],
    toBoard: (x: number, y: number) => [number, number],
    turn: number,
    slot: number,
    middle: { x: number; y: number; lateness: number },
    floating: Pose,
    loose: (rand: () => number) => [number, number, number],
  ) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    // Glyphs gather out of the dust in no particular order.
    const gathers = rand();
    for (const pt of points) {
      const [x, y] = toBoard(pt.x, pt.y);
      const z = pt.kind === KIND.dust ? (rand() - 0.5) * 60 : (rand() - 0.5) * 6;
      home.push(x, -y, z);
      start.push(...loose(rand));
      seed.push(0.75 * gathers + 0.25 * rand(), rand(), rand(), rand());
      // Turned with its glyph, and into world space, where y points up.
      info.push(slot, pt.kind, pt.nx * cos - pt.ny * sin, -(pt.nx * sin + pt.ny * cos));
      center.push(middle.x, -middle.y, middle.lateness);
      pose.push(floating.x, floating.y, floating.z, floating.rz);
      tilt.push(floating.rx, floating.ry);
    }
  };

  // Before it gathers, each grain drifts somewhere around its glyph, mostly upstream of it.
  const nearby = (spread: number) => (r: () => number): [number, number, number] => {
    const far = spread * (0.35 + 0.65 * Math.sqrt(r()));
    const a = r() * Math.PI * 2;
    return [Math.cos(a) * far - spread * 0.5 * r(), Math.sin(a) * far * 0.7, gauss(r) * spread * 0.8];
  };

  layout.elements
    .filter((el) => el.id !== "CENTER")
    .forEach((el, slot) => {
      slots.set(el.id, slot);
      const spacing = el.kind === "word" ? el.size * (el.id === "GOODBYE" ? 0.3 : 0.08) : 0;
      const mask = textMask(el.label, el.size * OVERSAMPLE, BOARD_FONT, spacing * OVERSAMPLE);
      const count = Math.round((coverage(mask) / OVERSAMPLE ** 2) * density);
      const turn = (el.rotate * Math.PI) / 180;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      // The board comes down from its middle outward.
      const out = Math.hypot(el.x - layout.width / 2, el.y - layout.height / 2) / Math.hypot(layout.width / 2, layout.height / 2);
      place(
        sampleMask(mask, count, rand, OVERSAMPLE),
        (mx, my) => {
          const lx = (mx - mask.cx) / OVERSAMPLE;
          const ly = (my - mask.cy) / OVERSAMPLE;
          return [el.x + lx * cos - ly * sin, el.y + lx * sin + ly * cos];
        },
        turn,
        slot,
        { x: el.x, y: el.y, lateness: 0.05 + 0.7 * out + 0.1 * rand() },
        // Words keep nearer the board than the letters do.
        poseFor(el.x, el.y, el.kind === "word" ? 0.5 : 1, layout, eye, rand),
        nearby(el.size * 1.9),
      );
    });

  // The candle stays loose dust until the board comes down, and gathers last of all.
  const candle = candleGeometry(layout);
  const mask = candleMask(candle.width * OVERSAMPLE, candle.h * OVERSAMPLE, rand);
  place(
    sampleMask(mask, Math.round((coverage(mask) / OVERSAMPLE ** 2) * density * 0.75), rand, OVERSAMPLE),
    (mx, my) => [candle.x + (mx - mask.cx) / OVERSAMPLE, candle.base + (my - mask.cy) / OVERSAMPLE],
    0,
    -1,
    { x: candle.x, y: candle.base - candle.h / 2, lateness: 1 },
    { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    nearby(candle.h * 2.2),
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(home), 3));
  geometry.setAttribute("aStart", new BufferAttribute(new Float32Array(start), 3));
  geometry.setAttribute("aSeed", new BufferAttribute(new Float32Array(seed), 4));
  geometry.setAttribute("aInfo", new BufferAttribute(new Float32Array(info), 4));
  geometry.setAttribute("aCenter", new BufferAttribute(new Float32Array(center), 3));
  geometry.setAttribute("aPose", new BufferAttribute(new Float32Array(pose), 4));
  geometry.setAttribute("aTilt", new BufferAttribute(new Float32Array(tilt), 2));
  const material = new ShaderMaterial({
    uniforms: {
      ...shared,
      uGather: { value: 0 },
      uForm: { value: 0 },
      uGlow: { value: new Float32Array(MAX_GLYPHS) },
      uHole: { value: new Vector3() },
    },
    vertexShader: BOARD_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, slots };
}
