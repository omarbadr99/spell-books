// The air made visible. Dust hangs everywhere in the room, too faint to see
// until a spirit stirs it and it drifts near the candle; motes of heat rise off
// the flame and go wherever the wind takes them; and the planchette drags the
// air it passes through. Every speck is carried by the wind with a little lag,
// as light things are, and drawn as a short streak along its path.

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";
import { AIR_VERTEX, STREAK_FRAGMENT } from "./shaders";
import { shared } from "./uniforms";
import type { Air, Wind } from "./wind";

/** Something moving through the air: the planchette. */
export interface Stirrer {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Where the flame's motes come from, and how hard it is burning. */
export interface Source {
  x: number;
  y: number;
  /** 0..1: how lit the candle is. */
  level: number;
  /** 0..1: how hard it is flaring. */
  flare: number;
}

const DUST = 0;
const MOTE = 1;
const FREE = 2;
/** The planchette's reach into the air, in board units. */
const WAKE = 120;

export class AirParticles {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly bright: Float32Array;
  private readonly kind: Uint8Array;
  private readonly position: Float32Array;
  private readonly vel: Float32Array;
  private readonly info: Float32Array;
  private readonly air: Air = { x: 0, y: 0, gust: 0 };
  private box = { x0: 0, y0: -1100, x1: 1600, y1: 0 };
  private placed = false;
  private owed = 0;

  constructor(
    private readonly dust: number,
    motes: number,
    private readonly random: () => number = Math.random,
  ) {
    const n = dust + motes;
    [this.x, this.y, this.z, this.vx, this.vy, this.age, this.life, this.size, this.bright] = Array.from(
      { length: 9 },
      () => new Float32Array(n),
    );
    this.kind = new Uint8Array(n).fill(FREE);
    this.kind.fill(DUST, 0, dust);
    this.position = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 2);
    this.info = new Float32Array(n * 4);

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.position, 3));
    geometry.setAttribute("aVel", new BufferAttribute(this.vel, 2));
    geometry.setAttribute("aInfo", new BufferAttribute(this.info, 4));
    geometry.setDrawRange(0, 0);
    this.points = new Points(
      geometry,
      new ShaderMaterial({
        uniforms: { ...shared, uTrail: { value: 0.09 } },
        vertexShader: AIR_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  /** The region the dust fills: what the camera sees of the board's plane, in world space. */
  setBounds(x0: number, y0: number, x1: number, y1: number): void {
    this.box = { x0, y0, x1, y1 };
    if (this.placed) return;
    this.placed = true;
    for (let i = 0; i < this.dust; i++) {
      this.scatter(i);
      // Already part way through their lives, so they don't all fade at once.
      this.age[i] = this.random() * this.life[i];
    }
  }

  update(dt: number, wind: Wind, flame: Source | null, stirrer: Stirrer | null): void {
    const { x, y, vx, vy, age, life, kind, random, air, box } = this;
    if (flame && flame.level > 0.2) {
      this.owed += (22 + 70 * flame.flare) * flame.level * dt;
      for (let i = this.dust; i < kind.length && this.owed >= 1; i++) {
        if (kind[i] !== FREE) continue;
        this.owed -= 1;
        this.rise(i, flame, wind);
      }
      this.owed = Math.min(this.owed, 4);
    }

    let n = 0;
    const margin = 60;
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] === FREE) continue;
      age[i] += dt;
      if (age[i] >= life[i]) {
        if (kind[i] === DUST) this.scatter(i);
        else kind[i] = FREE;
        continue;
      }
      wind.at(x[i], y[i], air);
      let tx = air.x;
      let ty = air.y;
      let tau: number;
      if (kind[i] === MOTE) {
        // Heat rises off the flame, and cools as it goes.
        ty += 80 * Math.exp(-age[i] / 1.1);
        tau = 0.4;
      } else {
        // The smallest dust follows the air at once; the larger lags behind.
        tau = 0.25 + 0.6 * this.size[i];
        tx += (random() - 0.5) * 30;
        ty += (random() - 0.5) * 30;
      }
      if (stirrer) {
        const dx = x[i] - stirrer.x;
        const dy = y[i] - stirrer.y;
        const near = Math.exp(-(dx * dx + dy * dy) / (WAKE * WAKE)) * Math.min(1, Math.hypot(stirrer.vx, stirrer.vy) / 60);
        tx += (stirrer.vx * 0.9 - tx) * near;
        ty += (stirrer.vy * 0.9 - ty) * near;
      }
      const k = 1 - Math.exp(-dt / tau);
      vx[i] += (tx - vx[i]) * k;
      vy[i] += (ty - vy[i]) * k;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;

      if (kind[i] === DUST) {
        // Dust blown out of sight comes back in on the far side.
        const w = box.x1 - box.x0 + margin * 2;
        const h = box.y1 - box.y0 + margin * 2;
        if (x[i] < box.x0 - margin || x[i] > box.x1 + margin || y[i] < box.y0 - margin || y[i] > box.y1 + margin) {
          x[i] = box.x0 - margin + ((((x[i] - box.x0 + margin) % w) + w) % w);
          y[i] = box.y0 - margin + ((((y[i] - box.y0 + margin) % h) + h) % h);
          age[i] = 0;
        }
      }

      this.position.set([x[i], y[i], this.z[i]], n * 3);
      this.vel.set([vx[i], vy[i]], n * 2);
      const shown = kind[i] === DUST ? this.bright[i] * (0.25 + 0.75 * wind.presence) : this.bright[i];
      this.info.set([age[i] / life[i], kind[i], this.size[i], shown], n * 4);
      n++;
    }
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, n);
    for (const name of ["position", "aVel", "aInfo"]) geometry.getAttribute(name).needsUpdate = true;
  }

  /** A speck of dust somewhere in the room. */
  private scatter(i: number): void {
    const { box, random } = this;
    this.x[i] = box.x0 + random() * (box.x1 - box.x0);
    this.y[i] = box.y0 + random() * (box.y1 - box.y0);
    this.z[i] = (random() - 0.5) * 300;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.age[i] = 0;
    this.life[i] = 6 + random() * 10;
    this.size[i] = random() ** 2;
    this.bright[i] = 0.4 + 0.6 * random();
  }

  /** A mote of heat leaving the flame. */
  private rise(i: number, flame: Source, wind: Wind): void {
    const { random } = this;
    wind.at(flame.x, flame.y, this.air);
    this.kind[i] = MOTE;
    this.x[i] = flame.x + (random() - 0.5) * 6;
    this.y[i] = flame.y + random() * 6;
    this.z[i] = 26 + (random() - 0.5) * 20;
    this.vx[i] = this.air.x * 0.3 + (random() - 0.5) * 14;
    this.vy[i] = 35 + 40 * random();
    this.age[i] = 0;
    this.life[i] = 2 + random() * 2.5;
    this.size[i] = 0.2 + 0.7 * random();
    this.bright[i] = 0.55 + 0.45 * random();
  }
}
