// The board's particles: every letter, number and word, and the candle, each
// sampled from its shape into a few hundred glowing points. Each point also
// knows where it waits before the board forms (somewhere in a slow whirl of
// dust in the dark), and which way its stroke's edge faces, so the light can
// catch it from the side.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from "three";
import type { BoardLayout } from "../board/layout";
import { candleMask, textMask } from "./masks";
import { coverage, KIND, sampleMask, seeded, type Sample } from "./sampling";
import { BOARD_VERTEX, POINT_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";

/** Masks are drawn at twice the board's units, for finer detail. */
const OVERSAMPLE = 2;
/** Glyphs the shader can light one by one. */
export const MAX_GLYPHS = 64;
export const BOARD_FONT = "Cinzel, Georgia, 'Times New Roman', serif";

export interface BoardParticles {
  points: Points<BufferGeometry, ShaderMaterial>;
  /** Each glyph's slot in the shader's uGlow array. */
  slots: Map<string, number>;
}

/** The whirl the points wait in: its middle in world space, how far it reaches, and how flattened it looks. */
export interface Whirl {
  x: number;
  y: number;
  reach: number;
  tilt: number;
}

/** The candle's proportions, shared with the flame that sits on it. */
export function candleGeometry(layout: BoardLayout) {
  const { x, y, h } = layout.candle;
  const wickTop = y - h * 1.09;
  const flame = h * 0.27;
  return { x, base: y, h, width: h * 0.42, wickTop, flame, light: new Vector3(x, -(wickTop - flame * 0.45), 24) };
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Somewhere in the whirl: three loose arms of dust about a bright middle, thicker toward it. */
function inWhirl(rand: () => number, whirl: Whirl): [number, number, number] {
  const out = Math.pow(rand(), 0.65);
  const r = whirl.reach * (0.04 + 0.96 * out);
  const arm = Math.floor(rand() * 3);
  const a = (arm / 3) * Math.PI * 2 + out * 3.6 + gauss(rand) * (0.22 + 0.3 * (1 - out));
  const spread = 14 + 34 * out;
  return [
    whirl.x + Math.cos(a) * r + gauss(rand) * spread,
    whirl.y + Math.sin(a) * r * whirl.tilt + gauss(rand) * spread,
    -150 + gauss(rand) * (40 + 160 * (1 - out)),
  ];
}

/**
 * Builds the particles for a layout. `density` is how many points to spend on
 * each square board unit of stroke, so finer screens can afford more.
 */
export function buildBoard(layout: BoardLayout, density: number, whirl: Whirl): BoardParticles {
  const rand = seeded(layout.kind === "wide" ? 1911 : 1903);
  const home: number[] = [];
  const start: number[] = [];
  const seed: number[] = [];
  const glyph: number[] = [];
  const kind: number[] = [];
  const normal: number[] = [];
  const slots = new Map<string, number>();

  const place = (
    points: Sample[],
    toBoard: (x: number, y: number) => [number, number],
    turn: number,
    slot: number,
    lateness: number,
  ) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (const pt of points) {
      const [x, y] = toBoard(pt.x, pt.y);
      const z = pt.kind === KIND.dust ? (rand() - 0.5) * 60 : (rand() - 0.5) * 6;
      home.push(x, -y, z);
      start.push(...inWhirl(rand, whirl));
      seed.push(0.65 * lateness + 0.35 * rand(), rand(), rand(), rand());
      glyph.push(slot);
      kind.push(pt.kind);
      // Turned with its glyph, and into world space, where y points up.
      normal.push(pt.nx * cos - pt.ny * sin, -(pt.nx * sin + pt.ny * cos));
    }
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
      // The board fills in from its middle outward.
      const out = Math.hypot(el.x - layout.width / 2, el.y - layout.height / 2) / Math.hypot(layout.width / 2, layout.height / 2);
      const lateness = 0.05 + 0.7 * out + 0.1 * rand();
      place(
        sampleMask(mask, count, rand, OVERSAMPLE),
        (mx, my) => {
          const lx = (mx - mask.cx) / OVERSAMPLE;
          const ly = (my - mask.cy) / OVERSAMPLE;
          return [el.x + lx * cos - ly * sin, el.y + lx * sin + ly * cos];
        },
        turn,
        slot,
        lateness,
      );
    });

  // The candle gathers last of all.
  const candle = candleGeometry(layout);
  const mask = candleMask(candle.width * OVERSAMPLE, candle.h * OVERSAMPLE, rand);
  place(
    sampleMask(mask, Math.round((coverage(mask) / OVERSAMPLE ** 2) * density * 0.75), rand, OVERSAMPLE),
    (mx, my) => [candle.x + (mx - mask.cx) / OVERSAMPLE, candle.base + (my - mask.cy) / OVERSAMPLE],
    0,
    -1,
    1,
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(home), 3));
  geometry.setAttribute("aStart", new BufferAttribute(new Float32Array(start), 3));
  geometry.setAttribute("aSeed", new BufferAttribute(new Float32Array(seed), 4));
  geometry.setAttribute("aGlyph", new BufferAttribute(new Float32Array(glyph), 1));
  geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(kind), 1));
  geometry.setAttribute("aNormal", new BufferAttribute(new Float32Array(normal), 2));
  const material = new ShaderMaterial({
    uniforms: {
      ...shared,
      uForm: { value: 0 },
      uWhirl: { value: new Vector3(whirl.x, whirl.y, whirl.reach) },
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
