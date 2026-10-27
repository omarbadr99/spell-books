// The universe behind the board: stars that drift, twinkle and turn very slowly,
// and faint clouds of nebula dust drifting further back. It fades in star by
// star when the page opens.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector3 } from "three";
import type { BoardLayout } from "../board/layout";
import { seeded } from "./sampling";
import { POINT_FRAGMENT, STARS_VERTEX } from "./shaders";
import { shared } from "./uniforms";

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

const bezier = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number) => {
  const u = 1 - t;
  return a
    .clone()
    .multiplyScalar(u * u * u)
    .addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t)
    .addScaledVector(d, t * t * t);
};

export class Sky {
  /** Turns slowly about the middle of the board, carrying the stars. */
  readonly heavens = new Group();
  readonly nebula: Points<BufferGeometry, ShaderMaterial>;
  /** 0 before the sky has appeared, 1 once every star is out. */
  private readonly shown = { value: 0 };
  private readonly nebulaCount: number;

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
    const starfield = new Points(this.geometry(positions, seeds), this.material(1));
    starfield.frustumCulled = false;
    starfield.renderOrder = 0;
    this.heavens.add(starfield);

    this.nebulaCount = Math.round(stars * 0.9);
    this.nebula = new Points(this.geometry(new Float32Array(this.nebulaCount * 3), new Float32Array(this.nebulaCount * 4)), this.material(0.4));
    this.nebula.frustumCulled = false;
    this.nebula.renderOrder = 1;
  }

  /** Lays the nebula's clouds out behind a layout: long drifts of dust at several depths. */
  place(layout: BoardLayout): void {
    this.heavens.position.set(layout.width / 2, -layout.height / 2, 0);
    const at = (u: number, v: number, z: number) => new Vector3(u * layout.width, -v * layout.height, z);
    const drifts = [
      [at(-0.6, 0.12, -700), at(0.2, -0.15, -650), at(0.7, 0.45, -800), at(1.6, 0.25, -700)],
      [at(-0.5, 1.15, -500), at(0.3, 0.75, -450), at(0.8, 1.25, -600), at(1.5, 0.95, -500)],
      [at(1.6, -0.2, -900), at(1.0, 0.25, -850), at(0.4, -0.1, -900), at(-0.6, 0.35, -950)],
      [at(-0.5, 0.65, -1100), at(0.4, 0.4, -1000), at(1.0, 0.85, -1100), at(1.7, 0.55, -1200)],
      [at(-0.4, -0.25, -1300), at(0.5, 0.1, -1250), at(0.9, -0.3, -1300), at(1.6, -0.1, -1350)],
      [at(0.2, 1.4, -800), at(0.6, 1.0, -760), at(1.1, 1.3, -800), at(1.8, 1.1, -850)],
    ];
    const rand = seeded(77);
    const geometry = this.nebula.geometry;
    const positions = geometry.getAttribute("position").array as Float32Array;
    const seeds = geometry.getAttribute("aSeed").array as Float32Array;
    for (let i = 0; i < this.nebulaCount; i++) {
      const [a, b, c, d] = drifts[i % drifts.length];
      const t = rand();
      // Thickest in the middle of each drift, thinning toward its ends.
      const spread = 120 * (0.35 + Math.sin(Math.PI * t));
      const p = bezier(a, b, c, d, t);
      positions.set([p.x + gauss(rand) * spread, p.y + gauss(rand) * spread * 0.6, p.z + gauss(rand) * 60], i * 3);
      seeds.set([rand(), rand(), rand(), rand() ** 2 * 0.6], i * 4);
    }
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("aSeed").needsUpdate = true;
  }

  /** `shown` is how far the sky has faded in, 0..1. */
  update(time: number, shown: number): void {
    this.heavens.rotation.z = time * 0.0035;
    this.shown.value = shown;
  }

  private geometry(positions: Float32Array, seeds: Float32Array): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    return geometry;
  }

  private material(bright: number): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: { ...shared, uBright: { value: bright }, uSky: this.shown },
      vertexShader: STARS_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }
}
