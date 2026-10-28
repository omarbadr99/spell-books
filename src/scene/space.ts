// The space the board floats in, flowing. Three layers of dust at different
// depths ride one slow current, each at its own pace: a far stream that
// gathers into faint clouds, a nearer drift, and a few motes so close to the eye
// that they are out of focus. Seen through a camera that sways with the
// viewer's hand, the layers slide past one another, and the dark has depth.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from "three";
import { fbm1 } from "./noise";
import { seeded } from "./sampling";
import { FLOW_VERTEX, POINT_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";

interface Layer {
  /** Depths it spans, in world z: negative is behind the board, positive between it and the eye. */
  near: number;
  far: number;
  /** How many specks, on a roomy screen. */
  count: number;
  /** How fast the current carries it, as a share of the current's speed. */
  pace: number;
  eddies: number;
  scale: number;
  speck: number;
  blur: number;
  opacity: number;
  clouds: number;
}

const LAYERS: Layer[] = [
  // A far stream, gathering into clouds.
  { near: -900, far: -3400, count: 5200, pace: 1, eddies: 240, scale: 0.0011, speck: 1.7, blur: 0, opacity: 0.85, clouds: 1 },
  // A nearer drift.
  { near: -120, far: -900, count: 1500, pace: 1.6, eddies: 90, scale: 0.0023, speck: 2, blur: 0, opacity: 0.75, clouds: 0.5 },
  // A few motes between the eye and the board, out of focus.
  { near: 0.62, far: 0.2, count: 70, pace: 2.4, eddies: 50, scale: 0.003, speck: 9, blur: 1, opacity: 0.14, clouds: 0 },
];

/** The current: mostly drifting the way the room's breeze blows, wandering slowly. */
const SPEED = 22;

export class Space {
  readonly layers: Points<BufferGeometry, ShaderMaterial>[];
  private readonly current = new Vector3();
  private time = 0;

  constructor(roomy: boolean) {
    const rand = seeded(2024);
    this.layers = LAYERS.map((layer, i) => {
      const count = Math.round(layer.count * (roomy ? 1 : 0.6));
      const positions = new Float32Array(count * 3);
      const seeds = new Float32Array(count * 4);
      for (let n = 0; n < count; n++) {
        positions.set([rand(), rand(), rand()], n * 3);
        seeds.set([rand(), rand(), rand(), rand()], n * 4);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
      const points = new Points(
        geometry,
        new ShaderMaterial({
          uniforms: {
            ...shared,
            uMin: { value: new Vector3() },
            uSize: { value: new Vector3(1, 1, 1) },
            uCurrent: { value: new Vector3() },
            uEddies: { value: layer.eddies },
            uScale: { value: layer.scale },
            uSpeck: { value: layer.speck },
            uBlur: { value: layer.blur },
            uOpacity: { value: layer.opacity },
            uClouds: { value: layer.clouds },
          },
          vertexShader: FLOW_VERTEX,
          fragmentShader: POINT_FRAGMENT,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      points.frustumCulled = false;
      // Far behind everything else, or in front of everything for the motes near the eye.
      points.renderOrder = layer.blur ? 9 : i + 1;
      return points;
    });
  }

  /**
   * Fits each layer's box to what the camera can see at its depths. `view` is
   * what it sees of the board's plane, `distance` how far back it stands.
   */
  place(view: { x0: number; y0: number; x1: number; y1: number }, distance: number): void {
    const cx = (view.x0 + view.x1) / 2;
    const cy = (view.y0 + view.y1) / 2;
    const halfW = (view.x1 - view.x0) / 2;
    const halfH = (view.y1 - view.y0) / 2;
    LAYERS.forEach((layer, i) => {
      // The near layer's depths are given as fractions of the way to the eye.
      const near = layer.blur ? layer.near * distance : layer.near;
      const far = layer.blur ? layer.far * distance : layer.far;
      // How much wider the view is at the layer's depth (its far end; the middle, for the motes near the eye),
      // with room for the camera's sway and for the camera standing back as the board first appears.
      const depth = layer.blur ? (near + far) / 2 : far;
      const widen = ((distance - depth) / distance) * (layer.blur ? 1.25 : 1.5) + 0.15;
      const u = this.layers[i].material.uniforms;
      (u.uMin.value as Vector3).set(cx - halfW * widen, cy - halfH * widen, far);
      (u.uSize.value as Vector3).set(halfW * widen * 2, halfH * widen * 2, near - far);
    });
  }

  /** Moves the current on. `breeze` (0..1+) is how hard the room's wind is blowing. */
  update(dt: number, breeze: number): void {
    this.time += dt;
    const heading = 0.15 + 0.5 * fbm1(this.time * 0.02 + 11);
    const speed = SPEED * (1 + 0.3 * fbm1(this.time * 0.07 + 2) + 0.8 * breeze);
    this.current.x += Math.cos(heading) * speed * dt;
    this.current.y += Math.sin(heading) * speed * 0.6 * dt;
    this.current.z += speed * 0.25 * dt;
    LAYERS.forEach((layer, i) => {
      (this.layers[i].material.uniforms.uCurrent.value as Vector3).copy(this.current).multiplyScalar(layer.pace);
    });
  }
}
