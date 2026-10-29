// The board's particles: every letter, number and word, and the candle, each
// sampled from its shape into a few hundred glowing points. The same points
// make every other picture too: loose dust when the page opens, the word START
// with the rest of the dust swirling round it, and the farewell, where they
// become the land, the stream of light and the two figures holding hands (see
// land.ts). Each point knows where it belongs in each of these, and which way
// its stroke's edge faces on the board, so the light can catch it from the side.
// Under the farewell's land, RESTART is written in grains of its own, the way
// START is.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector2, Vector3 } from "three";
import type { BoardLayout } from "../board/layout";
import { framing, layOutFarewell, type FarewellLayout } from "./land";
import { candleMask, textMask, type Drawn } from "./masks";
import { coverage, KIND, sampleMask, seeded, type Sample } from "./sampling";
import { BOARD_VERTEX, POINT_FRAGMENT, RESTART_VERTEX } from "./shaders";
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
  /** RESTART, under the farewell's land, and where it is written. */
  restart: { points: Points<BufferGeometry, ShaderMaterial>; box: ViewBox };
  /**
   * The farewell, laid out a little at a time: step it until it is done, then
   * hand what it returns to `settle`, which puts the points in their places.
   */
  farewell: Generator<void, FarewellLayout>;
  settle(layout: FarewellLayout): void;
}

/** The share of the points that make START; the rest swirl round it. */
const WORD_SHARE = 0.3;
/**
 * RESTART, below the farewell's land: how high it may be written and where its
 * middle is, in view units, and the share of the view's width it may take,
 * more than START's two thirds since it is a longer word.
 */
const RESTART = { tall: 0.28, y: -0.72, wide: 0.85 };

/**
 * A word in the board's lettering, laid out in view units with its middle at
 * (x, y): at most `tall` high, and no wider than `wide` of the view.
 */
function written(text: string, tall: number, aspect: number, x: number, y: number, wide = 0.65) {
  const mask = textMask(text, 240, BOARD_FONT, 240 * 0.14);
  const b = bounds(mask);
  const scale = Math.min(tall / (b.y1 - b.y0), (2 * wide * aspect) / (b.x1 - b.x0));
  const mid = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const box: ViewBox = {
    x0: x + (b.x0 - mid.x) * scale,
    x1: x + (b.x1 - mid.x) * scale,
    y0: y - (b.y1 - mid.y) * scale,
    y1: y - (b.y0 - mid.y) * scale,
  };
  return {
    mask,
    box,
    /** How much of the view its strokes cover, so two words can be written as thickly. */
    area: coverage(mask) * scale * scale,
    /** Where a point sampled from the mask goes. */
    at: (pt: Sample): [number, number] => [x + (pt.x - mid.x) * scale, y - (pt.y - mid.y) * scale],
  };
}

/** RESTART in grains, `thickness` of them for each unit of the view its strokes cover, each drifting in out of the dust about it. */
function restartWord(aspect: number, thickness: number, rand: () => number) {
  const word = written("RESTART", RESTART.tall, aspect, 0, RESTART.y, RESTART.wide);
  const points = sampleMask(word.mask, Math.round(word.area * thickness), rand, 1.5);
  const positions = new Float32Array(points.length * 3);
  const from = new Float32Array(points.length * 3);
  const seeds = new Float32Array(points.length * 4);
  const kinds = new Float32Array(points.length);
  const half = (word.box.x1 - word.box.x0) / 2;
  points.forEach((pt, i) => {
    const [x, y] = word.at(pt);
    positions.set([x, y, (rand() - 0.5) * 0.02], i * 3);
    from.set([x * 1.4 + gauss(rand) * half * 0.3, y - 0.1 + gauss(rand) * 0.12, 0.05 + 0.35 * rand()], i * 3);
    seeds.set([rand(), rand(), rand(), rand()], i * 4);
    kinds[i] = pt.kind;
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aFrom", new BufferAttribute(from, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
  geometry.setAttribute("aKind", new BufferAttribute(kinds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      ...shared,
      uGather: { value: 0 },
      uNear: { value: 0 },
      uBurst: { value: 0 },
      uMiddle: { value: new Vector2(0, RESTART.y) },
    },
    vertexShader: RESTART_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const layer = new Points(geometry, material);
  layer.frustumCulled = false;
  layer.renderOrder = 3;
  layer.visible = false;
  return { points: layer, box: word.box };
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
 * are laid out; and `grains` is how many more grains of dust the farewell's land
 * needs to cover the screen.
 */
export function buildBoard(layout: BoardLayout, density: number, aspect: number, grains: number): BoardParticles {
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
  const start = written("START", 0.3, aspect, 0, 0);
  const order = shuffled(n, rand);
  const inWord = Math.round(n * WORD_SHARE);
  const wordPoints = sampleMask(start.mask, inWord, rand, 1.5);
  const inner = start.box.x1 * 1.1;
  const outer = start.box.x1 * 2.6;
  order.forEach((i, k) => {
    if (k < inWord) {
      word.set([...start.at(wordPoints[k]), (rand() - 0.5) * 0.02, 0], i * 4);
    } else {
      const r = inner + (outer - inner) * rand() ** 2.2;
      word.set([rand() * Math.PI * 2, r, gauss(rand) * 0.035 * (1 + r), 1], i * 4);
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(home), 3));
  geometry.setAttribute("aStart", new BufferAttribute(dust, 3));
  geometry.setAttribute("aWord", new BufferAttribute(word, 4));
  // The farewell's places are filled in later, once they have been worked out (see settle).
  const end = new BufferAttribute(new Float32Array(n * 4), 4);
  const look = new BufferAttribute(new Float32Array(n * 4), 4);
  geometry.setAttribute("aEnd", end);
  geometry.setAttribute("aLook", look);
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
  return {
    points,
    slots,
    start: start.box,
    // As thickly as START is written.
    restart: restartWord(aspect, inWord / start.area, rand),
    farewell: layOutFarewell(n, grains, framing(aspect).aspect, seeded(layout.kind === "wide" ? 7 : 11)),
    settle(farewell: FarewellLayout) {
      end.copyArray(farewell.end);
      look.copyArray(farewell.look);
      end.needsUpdate = true;
      look.needsUpdate = true;
    },
  };
}
