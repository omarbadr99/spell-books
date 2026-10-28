// Uniforms every layer of the scene shares: the clock, how big a point is, the
// candle's light and the wind. Materials hold these same objects, so setting one
// value here reaches every shader.

import { Color, Vector2, Vector3, Vector4 } from "three";
import { MAX_GUSTS } from "./wind";

export const shared = {
  uTime: { value: 0 },
  /** 0 before the page has opened, 1 once everything has faded in. */
  uAppear: { value: 0 },
  /** Device pixels per world unit at a distance of one unit: sizes things that scale with the board. */
  uFocal: { value: 1 },
  /** How far the camera stands from the board's plane. */
  uDistance: { value: 1 },
  /** The middle of what the camera sees of the board's plane (xy), and half its width and height (zw). */
  uView: { value: new Vector4(0, 0, 1, 1) },
  /** The board's middle (xy) and half its width and height (zw), in world units. */
  uBoard: { value: new Vector4(0, 0, 1, 1) },
  /** How strongly the board curves round the sitters, 1 in full. */
  uCurve: { value: 1 },
  /** How far the farewell's land has come in, 0..1: the dark clears and the stars turn white for it. */
  uLand: { value: 0 },
  /** How the farewell is framed for the view's shape (see framing in land.ts). */
  uFrame: { value: new Vector2(1, 0) },
  /**
   * Device pixels for a grain of size 1 in the farewell: for the board's points (x) and the extra dust (y),
   * so the land looks as thick on every screen whatever its size and resolution.
   */
  uGrain: { value: new Vector2(1, 1) },
  /** Device pixels for a dot of size 1 on the board's plane: sizes the specks themselves. */
  uDot: { value: 1 },
  uLightPos: { value: new Vector3() },
  uLightColor: { value: new Color("#ef8e34") },
  uLightPower: { value: 0 },
  /** Board units at which the light has fallen to half. */
  uLightRange: { value: 420 },
  /** Faint moonlight from high beyond the board's far corner: where it comes from, how strong, how far it carries. */
  uMoonPos: { value: new Vector3() },
  uMoonPower: { value: 1 },
  uMoonRange: { value: 1800 },
  /** The wind's direction (xy), its mean speed in breezes (z) and how present the spirit is (w). */
  uWind: { value: new Vector4(1, 0, 0, 0) },
  /** How far the air has carried its eddies. */
  uDrift: { value: new Vector2() },
  /** Each gust's place and size, then its strength and speed (see Wind.pack). */
  uGustA: { value: new Float32Array(MAX_GUSTS * 4).map((_, i) => (i % 4 < 2 ? 0 : 1)) },
  uGustB: { value: new Float32Array(MAX_GUSTS * 4) },
};
