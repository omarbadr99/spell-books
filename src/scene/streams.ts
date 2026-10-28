// Streams of smoke flowing through the dark behind the board (see STREAM_VERTEX).
// Each is a ribbon of specks laid along its length; the shader winds, twists and
// frays it as it goes, and the whole lot flows on slowly, faster in a wind.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector4 } from "three";
import { gauss } from "./board";
import { seeded } from "./sampling";
import { POINT_FRAGMENT, STREAM_VERTEX } from "./shaders";
import { shared } from "./uniforms";

interface Lane {
  /** Its height in the view, from -1 at the bottom to 1 at the top. */
  y: number;
  /** Its depth, as a share of the camera's distance: negative behind the board, positive toward the eye. */
  z: number;
  /** How far it winds up and down, and how wide it is, as shares of half the view's height. */
  bend: number;
  width: number;
  /** How many times it twists along its length, and how many lengths it flows a second. */
  twist: number;
  speed: number;
  bright: number;
  /** How many specks, on a roomy screen. */
  count: number;
}

const LANES: Lane[] = [
  // Along the top of the view, one nearer and one further back.
  { y: 0.84, z: -0.25, bend: 0.12, width: 0.26, twist: 0.9, speed: 0.016, bright: 1.7, count: 3600 },
  { y: 0.64, z: -0.75, bend: 0.16, width: 0.34, twist: 0.7, speed: 0.011, bright: 1.3, count: 3000 },
  // Along the bottom.
  { y: -0.82, z: -0.22, bend: 0.12, width: 0.26, twist: 1, speed: 0.018, bright: 1.7, count: 3600 },
  { y: -0.6, z: -0.7, bend: 0.18, width: 0.36, twist: 0.8, speed: 0.012, bright: 1.3, count: 3000 },
  // Far back, winding across the middle.
  { y: 0.05, z: -1.4, bend: 0.4, width: 0.38, twist: 0.6, speed: 0.008, bright: 0.7, count: 1800 },
  // Close to the eye, out of focus.
  { y: -0.7, z: 0.3, bend: 0.2, width: 0.3, twist: 0.5, speed: 0.02, bright: 0.12, count: 90 },
];

export class Streams {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private flow = 0;

  constructor(roomy: boolean) {
    const rand = seeded(77);
    const position: number[] = [];
    const seed: number[] = [];
    const lane: number[] = [];
    const shape: number[] = [];
    LANES.forEach((l, i) => {
      const phase = i * 2.39 + rand() * 6.28;
      const count = Math.round(l.count * (roomy ? 1 : 0.6));
      for (let n = 0; n < count; n++) {
        position.push(rand(), gauss(rand) * 0.5, gauss(rand));
        seed.push(rand(), rand(), rand(), rand());
        lane.push(l.y, l.z, l.bend, phase);
        shape.push(l.width, l.twist, l.speed, l.bright);
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
    geometry.setAttribute("aSeed", new BufferAttribute(new Float32Array(seed), 4));
    geometry.setAttribute("aLane", new BufferAttribute(new Float32Array(lane), 4));
    geometry.setAttribute("aShape", new BufferAttribute(new Float32Array(shape), 4));
    this.points = new Points(
      geometry,
      new ShaderMaterial({
        uniforms: { ...shared, uFlow: { value: 0 }, uView: { value: new Vector4() }, uAloft: { value: 1 } },
        vertexShader: STREAM_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
  }

  /** Fits the streams to what the camera sees of the board's plane. */
  place(view: { x0: number; y0: number; x1: number; y1: number }): void {
    (this.points.material.uniforms.uView.value as Vector4).set(
      (view.x0 + view.x1) / 2,
      (view.y0 + view.y1) / 2,
      (view.x1 - view.x0) / 2,
      (view.y1 - view.y0) / 2,
    );
  }

  /** Flows on. `breeze` (0..1+) is how hard the room's wind is blowing; `aloft`, 1 while the glyphs float. */
  update(dt: number, breeze: number, aloft: number): void {
    this.flow += dt * (1 + 1.6 * breeze);
    const { uniforms } = this.points.material;
    uniforms.uFlow.value = this.flow;
    uniforms.uAloft.value = aloft;
  }
}
