// More dust on the farewell's land. The board's own points can't cover all of
// it, so these grains settle in around them as the land comes in, and show only
// then (see DUST_VERTEX).

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import { seeded } from "./sampling";
import { DUST_VERTEX, POINT_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";

/** The layer of dust for grains laid out in land space: x, y and f, and how brightly each is lit. */
export function dustLayer(grains: Float32Array): Points<BufferGeometry, ShaderMaterial> {
  const n = grains.length / 4;
  const positions = new Float32Array(n * 3);
  const light = new Float32Array(n);
  const seeds = new Float32Array(n * 4);
  const rand = seeded(77);
  for (let i = 0; i < n; i++) {
    positions.set(grains.subarray(i * 4, i * 4 + 3), i * 3);
    light[i] = grains[i * 4 + 3];
    seeds.set([rand(), rand(), rand(), rand()], i * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aLight", new BufferAttribute(light, 1));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
  const points = new Points(
    geometry,
    new ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: DUST_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  return points;
}
