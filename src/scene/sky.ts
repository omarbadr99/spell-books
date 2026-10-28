// The stars behind everything, drifting, twinkling and turning very slowly.
// They come out one by one as the page opens, the brightest first. The dust
// flowing between them is in space.ts.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial } from "three";
import type { BoardLayout } from "../board/layout";
import { seeded } from "./sampling";
import { POINT_FRAGMENT, STARS_VERTEX } from "./shaders";
import { shared } from "./uniforms";

export class Sky {
  /** Turns slowly about the middle of the board, carrying the stars. */
  readonly heavens = new Group();

  constructor(stars: number) {
    const rand = seeded(42);
    const positions = new Float32Array(stars * 3);
    const seeds = new Float32Array(stars * 4);
    for (let i = 0; i < stars; i++) {
      const z = -350 - rand() ** 0.7 * 3900;
      // Further stars spread wider, so the sky fills the view at every depth.
      const reach = 1.0 + (-z / 4200) * 1.6;
      positions.set([(rand() - 0.5) * 3600 * reach, (rand() - 0.5) * 2600 * reach, z], i * 3);
      seeds.set([rand(), rand(), rand(), rand() ** 2.2], i * 4);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    const starfield = new Points(
      geometry,
      new ShaderMaterial({
        uniforms: { ...shared, uBright: { value: 1 } },
        vertexShader: STARS_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    starfield.frustumCulled = false;
    starfield.renderOrder = 0;
    this.heavens.add(starfield);
  }

  place(layout: BoardLayout): void {
    this.heavens.position.set(layout.width / 2, -layout.height / 2, 0);
  }

  update(time: number): void {
    this.heavens.rotation.z = time * 0.0035;
  }
}
