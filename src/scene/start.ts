// START, written over the board's middle in the same glowing points as the
// board itself. The sitters bring the planchette to it to begin the séance.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector2 } from "three";
import type { BoardLayout } from "../board/layout";
import { BOARD_FONT, gauss, OVERSAMPLE } from "./board";
import { textMask } from "./masks";
import { coverage, sampleMask, seeded } from "./sampling";
import { POINT_FRAGMENT, START_VERTEX } from "./shaders";
import { shared } from "./uniforms";

export class StartWord {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  constructor(layout: BoardLayout, density: number) {
    const rand = seeded(7);
    const { x, y, size } = layout.start;
    const mask = textMask("START", size * OVERSAMPLE, BOARD_FONT, size * 0.14 * OVERSAMPLE);
    const samples = sampleMask(mask, Math.round((coverage(mask) / OVERSAMPLE ** 2) * density * 0.85), rand, OVERSAMPLE);
    const home: number[] = [];
    const start: number[] = [];
    const seed: number[] = [];
    const kind: number[] = [];
    for (const pt of samples) {
      home.push(x + (pt.x - mask.cx) / OVERSAMPLE, -(y + (pt.y - mask.cy) / OVERSAMPLE), (rand() - 0.5) * 6);
      // Before it gathers, the dust of it drifts all about the middle of the board.
      const far = size * 3 * (0.3 + 0.7 * Math.sqrt(rand()));
      const a = rand() * Math.PI * 2;
      start.push(Math.cos(a) * far, Math.sin(a) * far * 0.6, gauss(rand) * size * 2);
      seed.push(rand(), rand(), rand(), rand());
      kind.push(pt.kind);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(home), 3));
    geometry.setAttribute("aStart", new BufferAttribute(new Float32Array(start), 3));
    geometry.setAttribute("aSeed", new BufferAttribute(new Float32Array(seed), 4));
    geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(kind), 1));
    const material = new ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uAppear: shared.uAppear,
        uFocal: shared.uFocal,
        uDistance: shared.uDistance,
        uDot: shared.uDot,
        uGather: { value: 0 },
        uNear: { value: 0 },
        uGone: { value: 0 },
        uMiddle: { value: new Vector2(x, -y) },
      },
      vertexShader: START_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** How far the word has gathered, how near the glass is, and how far it has blown away, each 0..1. */
  set(gather: number, near: number, gone: number): void {
    const { uniforms } = this.points.material;
    uniforms.uGather.value = gather;
    uniforms.uNear.value = near;
    uniforms.uGone.value = gone;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
