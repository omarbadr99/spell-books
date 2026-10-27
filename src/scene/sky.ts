// The universe behind the board: stars that drift, twinkle and turn very slowly,
// faint drifts of nebula, and the breeze that streams from the candle while a
// spirit is present. Streams are points flowing along curved bands.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector3 } from "three";
import type { BoardLayout } from "../board/layout";
import { candleGeometry } from "./board";
import { seeded } from "./sampling";
import { POINT_FRAGMENT, STARS_VERTEX, STREAM_VERTEX } from "./shaders";
import { shared } from "./uniforms";

const BANDS = 6;

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function material(vertexShader: string, uniforms: Record<string, { value: unknown }> = {}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...shared, ...uniforms },
    vertexShader,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function pointsOf(count: number, seeds: Float32Array, positions = new Float32Array(count * 3)) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
  return geometry;
}

/** A cubic curve, in world space. */
export type Band = [Vector3, Vector3, Vector3, Vector3];

/** Points flowing along up to six bands. */
export class Streams {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  constructor(count: number, seed: number, options: { speed: number; width: number; opacity: number; warmth: number }) {
    const rand = seeded(seed);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds.set([rand(), Math.floor(rand() * BANDS), Math.max(-2.5, Math.min(2.5, gauss(rand))), rand()], i * 4);
    }
    const blank = () => Array.from({ length: BANDS }, () => new Vector3());
    this.points = new Points(
      pointsOf(count, seeds),
      material(STREAM_VERTEX, {
        uSpeed: { value: options.speed },
        uWidth: { value: options.width },
        uOpacity: { value: options.opacity },
        uWarmth: { value: options.warmth },
        uA: { value: blank() },
        uB: { value: blank() },
        uC: { value: blank() },
        uD: { value: blank() },
      }),
    );
    this.points.frustumCulled = false;
  }

  setBands(bands: Band[]): void {
    const u = this.points.material.uniforms;
    for (let i = 0; i < BANDS; i++) {
      const [a, b, c, d] = bands[i % bands.length];
      (u.uA.value as Vector3[])[i].copy(a);
      (u.uB.value as Vector3[])[i].copy(b);
      (u.uC.value as Vector3[])[i].copy(c);
      (u.uD.value as Vector3[])[i].copy(d);
    }
  }

  set opacity(value: number) {
    this.points.material.uniforms.uOpacity.value = value;
  }
}

/** Where a point sits, given as fractions of the board (0,0 top left, 1,1 bottom right), in world space. */
const across = (layout: BoardLayout, u: number, v: number, z: number) => new Vector3(u * layout.width, -v * layout.height, z);

export class Sky {
  /** Turns slowly about the middle of the board, carrying the stars. */
  readonly heavens = new Group();
  readonly nebula: Streams;
  readonly breeze: Streams;

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
    const starfield = new Points(pointsOf(stars, seeds, positions), material(STARS_VERTEX));
    starfield.frustumCulled = false;
    starfield.renderOrder = 0;
    this.heavens.add(starfield);

    this.nebula = new Streams(Math.round(stars * 0.9), 77, { speed: 0.004, width: 120, opacity: 0.32, warmth: 0 });
    this.nebula.points.renderOrder = 1;
    this.breeze = new Streams(3000, 91, { speed: 0.045, width: 13, opacity: 0, warmth: 1 });
    this.breeze.points.renderOrder = 2;
  }

  place(layout: BoardLayout): void {
    this.heavens.position.set(layout.width / 2, -layout.height / 2, 0);
    const at = (u: number, v: number, z: number) => across(layout, u, v, z);
    this.nebula.setBands([
      [at(-0.6, 0.12, -700), at(0.2, -0.15, -650), at(0.7, 0.45, -800), at(1.6, 0.25, -700)],
      [at(-0.5, 1.15, -500), at(0.3, 0.75, -450), at(0.8, 1.25, -600), at(1.5, 0.95, -500)],
      [at(1.6, -0.2, -900), at(1.0, 0.25, -850), at(0.4, -0.1, -900), at(-0.6, 0.35, -950)],
      [at(-0.5, 0.65, -1100), at(0.4, 0.4, -1000), at(1.0, 0.85, -1100), at(1.7, 0.55, -1200)],
      [at(-0.4, -0.25, -1300), at(0.5, 0.1, -1250), at(0.9, -0.3, -1300), at(1.6, -0.1, -1350)],
      [at(0.2, 1.4, -800), at(0.6, 1.0, -760), at(1.1, 1.3, -800), at(1.8, 1.1, -850)],
    ]);

    // The breeze leaves the flame in ribbons that wave out across the whole board.
    const rand = seeded(layout.kind === "wide" ? 5 : 6);
    const flame = candleGeometry(layout).light;
    const { width: w, height: h } = layout;
    const bands: Band[] = [];
    for (let i = 0; i < 6; i++) {
      // Where across the board's height this ribbon ends up, top to bottom.
      const level = -h * (0.08 + (i / 5) * 0.84) + (rand() - 0.5) * h * 0.08;
      const swing = (rand() < 0.5 ? -1 : 1) * h * (0.12 + rand() * 0.12);
      bands.push([
        new Vector3(flame.x + (rand() - 0.5) * 16, flame.y + 20 + rand() * 30, 20),
        new Vector3(flame.x + w * (0.22 + rand() * 0.1), (flame.y + level) / 2 + swing, -30 + rand() * 60),
        new Vector3(w * (0.6 + rand() * 0.2), level - swing, -90 + rand() * 120),
        new Vector3(w * (1.25 + rand() * 0.3), level + swing * 0.5, -160 + rand() * 160),
      ]);
    }
    this.breeze.setBands(bands);
  }

  update(time: number, breeze: number): void {
    this.heavens.rotation.z = time * 0.0035;
    this.breeze.opacity = 0.85 * breeze;
    this.breeze.points.visible = breeze > 0.001;
  }
}
