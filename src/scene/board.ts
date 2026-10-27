// The board's particles: every letter, number and word, and the candle, each
// sampled from its shape into a few hundred glowing points. Each point also
// knows where it starts from, out in the dark, so the board can form, and which
// way its stroke's edge faces, so the candle can light it from the side.

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

/** The candle's proportions, shared with the flame that sits on it. */
export function candleGeometry(layout: BoardLayout) {
  const { x, y, h } = layout.candle;
  const wickTop = y - h * 1.09;
  const flame = h * 0.27;
  return { x, base: y, h, width: h * 0.42, wickTop, flame, light: new Vector3(x, -(wickTop - flame * 0.45), 24) };
}

function inSphere(rand: () => number, r: number): [number, number, number] {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const d = r * Math.cbrt(rand());
  return [Math.cos(a) * s * d, Math.sin(a) * s * d, u * d];
}

/**
 * Builds the particles for a layout. `density` is how many points to spend on
 * each square board unit of stroke, so finer screens can afford more.
 */
export function buildBoard(layout: BoardLayout, density: number): BoardParticles {
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
    from: [number, number, number],
    lateness: number,
  ) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (const pt of points) {
      const [x, y] = toBoard(pt.x, pt.y);
      const z = pt.kind === KIND.dust ? (rand() - 0.5) * 60 : (rand() - 0.5) * 6;
      const [dx, dy, dz] = inSphere(rand, 60 + rand() * 220);
      home.push(x, -y, z);
      start.push(x + from[0] + dx, -y + from[1] + dy, z + from[2] + dz);
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
      // Each glyph is carried in on the wind from somewhere upwind in the dark, far behind or close by,
      // so the board fills in from the left as the gust passes over it.
      const from: [number, number, number] = [-500 - rand() * 700, (rand() - 0.5) * 500, -1300 + rand() * 1700];
      const lateness = 0.08 + 0.62 * (el.x / layout.width) + 0.1 * rand();
      place(
        sampleMask(mask, count, rand, OVERSAMPLE),
        (mx, my) => {
          const lx = (mx - mask.cx) / OVERSAMPLE;
          const ly = (my - mask.cy) / OVERSAMPLE;
          return [el.x + lx * cos - ly * sin, el.y + lx * sin + ly * cos];
        },
        turn,
        slot,
        from,
        lateness,
      );
    });

  // The candle rises out of the dark below, last of all.
  const candle = candleGeometry(layout);
  const mask = candleMask(candle.width * OVERSAMPLE, candle.h * OVERSAMPLE, rand);
  place(
    sampleMask(mask, Math.round((coverage(mask) / OVERSAMPLE ** 2) * density * 0.75), rand, OVERSAMPLE),
    (mx, my) => [candle.x + (mx - mask.cx) / OVERSAMPLE, candle.base + (my - mask.cy) / OVERSAMPLE],
    0,
    -1,
    [0, -520, -500],
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
