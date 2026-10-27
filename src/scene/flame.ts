// The flame and the light it throws into the air: soft gradients rather than
// particles. Both flicker with the candle's light; the flame leans and flutters
// in the wind and swells while a spirit speaks.

import { AdditiveBlending, Group, Mesh, PlaneGeometry, ShaderMaterial } from "three";
import type { BoardLayout } from "../board/layout";
import { candleGeometry } from "./board";
import type { CandleLight } from "./light";
import { FLAME_FRAGMENT, FLAME_ROOM, GLOW_FRAGMENT, QUAD_VERTEX } from "./shaders";
import { shared } from "./uniforms";

function quad(fragmentShader: string, uniforms: Record<string, { value: unknown }>): Mesh<PlaneGeometry, ShaderMaterial> {
  return new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: { uTime: shared.uTime, uColor: shared.uLightColor, uLevel: { value: 0 }, ...uniforms },
      vertexShader: QUAD_VERTEX,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
}

export class Flame {
  readonly group = new Group();
  private readonly flame = quad(FLAME_FRAGMENT, { uLean: { value: 0 }, uFlutter: { value: 0 }, uFlare: { value: 0 } });
  private readonly glow = quad(GLOW_FRAGMENT, {});
  private height = 1;

  constructor() {
    // The flame stands on its base, at the tip of the wick.
    this.flame.geometry.translate(0, 0.5, 0);
    this.flame.renderOrder = 6;
    this.glow.renderOrder = 5;
    this.group.add(this.glow, this.flame);
  }

  place(layout: BoardLayout): void {
    const candle = candleGeometry(layout);
    this.height = candle.flame;
    this.flame.position.set(candle.x, -candle.wickTop, 26);
    this.glow.position.copy(candle.light);
  }

  update(light: CandleLight): void {
    const { level, flare } = light;
    const flicker = level > 0.001 ? light.power / (level * (1 + 0.95 * flare)) : 1;
    const u = this.flame.material.uniforms;
    u.uLevel.value = Math.min(1, level * 1.4);
    u.uLean.value = light.lean;
    u.uFlutter.value = light.flutter;
    u.uFlare.value = flare;
    // Taller as it flares, shorter as the wind presses it down.
    const tall = (0.82 + 0.25 * flicker) * (1 + 0.6 * flare) * (1 - 0.18 * Math.min(1, Math.abs(light.lean)));
    this.flame.scale.set(this.height * 0.55 * FLAME_ROOM * (1 + 0.15 * flare), this.height * tall * Math.sqrt(level), 1);
    this.glow.position.set(light.position.x, light.position.y, this.glow.position.z);
    this.glow.scale.setScalar(this.height * 9 * (1 + 0.5 * flare));
    this.glow.material.uniforms.uLevel.value = light.power * 0.55;
    this.group.visible = level > 0.002;
  }
}
