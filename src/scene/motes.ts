// Loose motes moved on the CPU: smoke curling up when the candle goes out, and
// embers rising from the flame while it burns, both carried off by the wind.
// Only a few hundred at most.

import { AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from "three";
import { MOTE_VERTEX, POINT_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";
import type { Air, Wind } from "./wind";

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds it lives; it may start late, with a negative age. */
  life: number;
  age?: number;
  size: number;
  /** How much it grows by the end of its life. */
  grow?: number;
  color: [number, number, number];
  alpha: number;
  /** How quickly it takes up the wind's speed, in seconds: heavier things are slower. */
  drag?: number;
  /** How hard heat lifts it as it leaves the flame, in board units a second. */
  lift?: number;
}

export class Motes {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly live: (Mote & { age: number })[] = [];
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly air: Air = { x: 0, y: 0, gust: 0 };

  constructor(
    private readonly capacity: number,
    additive: boolean,
  ) {
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.position, 3));
    geometry.setAttribute("aColor", new BufferAttribute(this.color, 4));
    geometry.setAttribute("aSize", new BufferAttribute(this.size, 1));
    geometry.setDrawRange(0, 0);
    this.points = new Points(
      geometry,
      new ShaderMaterial({
        uniforms: { uFocal: shared.uFocal },
        vertexShader: MOTE_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  emit(mote: Mote): void {
    if (this.live.length >= this.capacity) this.live.shift();
    this.live.push({ ...mote, age: mote.age ?? 0 });
  }

  /** Moves every mote on, as the wind and its own heat carry it. */
  update(dt: number, wind: Wind): void {
    let n = 0;
    const { air } = this;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i];
      m.age += dt;
      if (m.age >= m.life) {
        this.live.splice(i, 1);
        continue;
      }
      if (m.age < 0) continue;
      wind.at(m.x, m.y, air);
      const k = 1 - Math.exp(-dt / (m.drag ?? 0.6));
      m.vx += (air.x - m.vx) * k;
      m.vy += (air.y + (m.lift ?? 0) * Math.exp(-m.age / 1.2) - m.vy) * k;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const u = m.age / m.life;
      this.position.set([m.x, m.y, 30], n * 3);
      // In softly, out slowly.
      this.color.set([...m.color, m.alpha * Math.min(1, u * 6) * (1 - u)], n * 4);
      this.size[n] = m.size * (1 + (m.grow ?? 0) * u);
      n++;
    }
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, n);
    for (const name of ["position", "aColor", "aSize"]) geometry.getAttribute(name).needsUpdate = true;
  }
}
