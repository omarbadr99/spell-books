// The title that greets the sitters: SPIRIT BOARD, gathered out of a whirl of
// dust in the dark, held for a moment, then carried off on a gust as the board
// itself forms.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector2 } from "three";
import type { BoardLayout } from "../board/layout";
import { BOARD_FONT } from "./board";
import { textMask } from "./masks";
import { coverage, sampleMask, seeded } from "./sampling";
import { POINT_FRAGMENT, TITLE_VERTEX } from "./shaders";
import { shared } from "./uniforms";

const TEXT = "SPIRIT BOARD";
const OVERSAMPLE = 2;

export class Title {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  /** `density` is points per square board unit of stroke, as for the board. */
  constructor(layout: BoardLayout, density: number) {
    const rand = seeded(1888);
    // Sized so the title spans most of the board's width, with its letters spread a fifth of an em apart.
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `700 100px ${BOARD_FONT}`;
    const span = layout.kind === "wide" ? 0.64 : 0.84;
    const px = (100 * layout.width * span) / (ctx.measureText(TEXT).width + 22 * (TEXT.length - 1));
    const mask = textMask(TEXT, px * OVERSAMPLE, BOARD_FONT, px * 0.22 * OVERSAMPLE);
    const middle = new Vector2(layout.width / 2, -layout.height * 0.42);
    const samples = sampleMask(mask, Math.round((coverage(mask) / OVERSAMPLE ** 2) * density * 1.3), rand, OVERSAMPLE);

    const home = new Float32Array(samples.length * 3);
    const start = new Float32Array(samples.length * 3);
    const seed = new Float32Array(samples.length * 4);
    samples.forEach((pt, i) => {
      const x = middle.x + (pt.x - mask.cx) / OVERSAMPLE;
      const y = middle.y - (pt.y - mask.cy) / OVERSAMPLE;
      home.set([x, y, (rand() - 0.5) * 8], i * 3);
      // Out in the dark, all around and well behind the title.
      const a = rand() * Math.PI * 2;
      const r = layout.width * (0.25 + 0.5 * Math.sqrt(rand()));
      start.set([middle.x + Math.cos(a) * r, middle.y + Math.sin(a) * r * 0.6, -300 - rand() * 900], i * 3);
      seed.set([rand(), rand(), rand(), rand()], i * 4);
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(home, 3));
    geometry.setAttribute("aStart", new BufferAttribute(start, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seed, 4));
    this.points = new Points(
      geometry,
      new ShaderMaterial({
        uniforms: { ...shared, uGather: { value: 0 }, uGone: { value: 0 }, uMiddle: { value: middle } },
        vertexShader: TITLE_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  /** How far it has gathered, and how far it has blown away, each 0..1. */
  set(gather: number, gone: number): void {
    const u = this.points.material.uniforms;
    u.uGather.value = gather;
    u.uGone.value = gone;
    this.points.visible = gather > 0 && gone < 1;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
