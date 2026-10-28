// The board's particles: every letter, number and word, and the candle, each
// sampled from its shape into a few hundred glowing points. The same points
// make every other picture too: loose dust when the page opens, the word START
// with the rest of the dust swirling round it, and the farewell, where they
// become the spirit reaching out, the wind, and the ground underfoot. Each
// point knows where it belongs in each of these, and which way its stroke's
// edge faces on the board, so the light can catch it from the side.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from "three";
import type { BoardLayout } from "../board/layout";
import { figureMask, HAND } from "./figure";
import { candleMask, textMask, type Drawn } from "./masks";
import { coverage, KIND, sampleMask, seeded, type Sample } from "./sampling";
import { BOARD_VERTEX, POINT_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";

/** Masks are drawn at twice the board's units, for finer detail. */
const OVERSAMPLE = 2;
/** Glyphs the shader can light one by one. */
export const MAX_GLYPHS = 64;
export const BOARD_FONT = "Cinzel, Georgia, 'Times New Roman', serif";

/** The pictures the points can make, in the order a séance goes through them. */
export const FORMATION = { dust: 0, start: 1, board: 2, farewell: 3 } as const;
export type Formation = (typeof FORMATION)[keyof typeof FORMATION];

/** A box in view units: half-heights of the view, about its middle, y up. */
export interface ViewBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BoardParticles {
  points: Points<BufferGeometry, ShaderMaterial>;
  /** Each glyph's slot in the shader's uGlow array. */
  slots: Map<string, number>;
  /** Where START is written. */
  start: ViewBox;
  /** Where the sitter stands in the farewell, facing the spirit: the middle of their feet, and their height. */
  sitter: { x: number; y: number; height: number };
}

/** Shares of the points that make START (the rest swirl round it), and the spirit and the wind in the farewell (the rest are ground). */
const SHARE = { word: 0.3, spirit: 0.25, wind: 0.16 };

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

/** The filled part of a mask: its bounds in mask pixels. */
function bounds(mask: Drawn): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.alpha[y * mask.width + x] < 110) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

/** The points' indices in a shuffled order, so each picture takes its share at random. */
function shuffled(n: number, rand: () => number): Uint32Array {
  const order = new Uint32Array(n).map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Builds the particles for a layout. `density` is how many points to spend on
 * each square board unit of stroke, so finer screens can afford more; `aspect`
 * is the view's width for its height, which sets how START and the farewell
 * are laid out.
 */
export function buildBoard(layout: BoardLayout, density: number, aspect: number): BoardParticles {
  const rand = seeded(layout.kind === "wide" ? 1911 : 1903);
  const home: number[] = [];
  const seed: number[] = [];
  const info: number[] = [];
  const slots = new Map<string, number>();

  const place = (points: Sample[], toBoard: (x: number, y: number) => [number, number], turn: number, slot: number) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    for (const pt of points) {
      const [x, y] = toBoard(pt.x, pt.y);
      const z = pt.kind === KIND.dust ? (rand() - 0.5) * 60 : (rand() - 0.5) * 6;
      home.push(x, -y, z);
      seed.push(rand(), rand(), rand(), rand());
      // Turned with its glyph, and into world space, where y points up.
      info.push(slot, pt.kind, pt.nx * cos - pt.ny * sin, -(pt.nx * sin + pt.ny * cos));
    }
  };

  layout.elements.forEach((el, slot) => {
    slots.set(el.id, slot);
    const spacing = el.kind === "word" ? el.size * (el.id === "GOODBYE" ? 0.3 : 0.08) : 0;
    const mask = textMask(el.label, el.size * OVERSAMPLE, BOARD_FONT, spacing * OVERSAMPLE);
    const count = Math.round((coverage(mask) / OVERSAMPLE ** 2) * density);
    const turn = (el.rotate * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    place(
      sampleMask(mask, count, rand, OVERSAMPLE),
      (mx, my) => {
        const lx = (mx - mask.cx) / OVERSAMPLE;
        const ly = (my - mask.cy) / OVERSAMPLE;
        return [el.x + lx * cos - ly * sin, el.y + lx * sin + ly * cos];
      },
      turn,
      slot,
    );
  });

  const candle = candleGeometry(layout);
  const wax = candleMask(candle.width * OVERSAMPLE, candle.h * OVERSAMPLE, rand);
  place(
    sampleMask(wax, Math.round((coverage(wax) / OVERSAMPLE ** 2) * density * 0.75), rand, OVERSAMPLE),
    (mx, my) => [candle.x + (mx - wax.cx) / OVERSAMPLE, candle.base + (my - wax.cy) / OVERSAMPLE],
    0,
    -1,
  );
  const n = home.length / 3;

  // Loose dust, everywhere the eye can see and some of it close to the eye.
  const dust = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    dust.set([(rand() * 2 - 1) * aspect * 1.3, (rand() * 2 - 1) * 1.2, -0.9 + 1.25 * rand() ** 1.4], i * 3);
  }

  // START, as wide as two thirds of the view at most, and the rest of the dust in a slow swirl round it.
  const word = new Float32Array(n * 4);
  const letters = textMask("START", 240, BOARD_FONT, 240 * 0.14);
  const lb = bounds(letters);
  const scale = Math.min(0.3 / (lb.y1 - lb.y0), (1.3 * aspect) / (lb.x1 - lb.x0));
  const mid = { x: (lb.x0 + lb.x1) / 2, y: (lb.y0 + lb.y1) / 2 };
  const start: ViewBox = {
    x0: (lb.x0 - mid.x) * scale,
    x1: (lb.x1 - mid.x) * scale,
    y0: -(lb.y1 - mid.y) * scale,
    y1: -(lb.y0 - mid.y) * scale,
  };
  const order = shuffled(n, rand);
  const inWord = Math.round(n * SHARE.word);
  const wordPoints = sampleMask(letters, inWord, rand, 1.5);
  const inner = start.x1 * 1.1;
  const outer = start.x1 * 2.6;
  order.forEach((i, k) => {
    if (k < inWord) {
      const pt = wordPoints[k];
      word.set([(pt.x - mid.x) * scale, -(pt.y - mid.y) * scale, (rand() - 0.5) * 0.02, 0], i * 4);
    } else {
      const r = inner + (outer - inner) * rand() ** 2.2;
      word.set([rand() * Math.PI * 2, r, gauss(rand) * 0.035 * (1 + r), 1], i * 4);
    }
  });

  // The farewell: the spirit reaching out to the sitter, whose hands meet in the middle of the view.
  const farewell = new Float32Array(n * 4);
  const tall = Math.min(0.95, aspect * 1.45);
  const feet = -0.36;
  const spiritX = 0.012 - HAND.x * tall;
  const figure = figureMask(600, 1);
  const inSpirit = Math.round(n * SHARE.spirit);
  const inWind = Math.round(n * SHARE.wind);
  const spiritPoints = sampleMask(figure, inSpirit, rand, 1.5);
  shuffled(n, rand).forEach((i, k) => {
    if (k < inSpirit) {
      const pt = spiritPoints[k];
      const fx = (pt.x - figure.cx) / figure.height;
      const fy = (figure.cy - pt.y) / figure.height;
      farewell.set([spiritX + fx * tall, feet + fy * tall, gauss(rand) * 0.012, 0], i * 4);
    } else if (k < inSpirit + inWind) {
      // The wind: lanes across the view, most of them about the figures.
      const lane = rand() < 0.65 ? feet + tall * (0.15 + 0.9 * rand()) : (rand() * 2 - 1) * 1.1;
      farewell.set([rand(), lane, -0.45 + 0.6 * rand(), 1], i * 4);
    } else {
      farewell.set([rand() * 2 - 1, rand(), rand(), 2], i * 4);
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(home), 3));
  geometry.setAttribute("aStart", new BufferAttribute(dust, 3));
  geometry.setAttribute("aWord", new BufferAttribute(word, 4));
  geometry.setAttribute("aEnd", new BufferAttribute(farewell, 4));
  geometry.setAttribute("aSeed", new BufferAttribute(new Float32Array(seed), 4));
  geometry.setAttribute("aInfo", new BufferAttribute(new Float32Array(info), 4));
  const material = new ShaderMaterial({
    uniforms: {
      ...shared,
      uFrom: { value: FORMATION.dust },
      uTo: { value: FORMATION.dust },
      uMorph: { value: 1 },
      uPath: { value: new Vector3() },
      uNear: { value: 0 },
      uGlow: { value: new Float32Array(MAX_GLYPHS) },
      uHole: { value: new Vector3() },
      uFeet: { value: feet },
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
  return { points, slots, start, sitter: { x: -spiritX, y: feet, height: tall } };
}
