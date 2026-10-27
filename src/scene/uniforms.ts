// Uniforms every layer of the scene shares: the clock, how big a point is, and
// the candle's light. Materials hold these same objects, so setting one value
// here reaches every shader.

import { Color, Vector3 } from "three";

export const shared = {
  uTime: { value: 0 },
  /** Device pixels per world unit at a distance of one unit: sizes things that scale with the board. */
  uFocal: { value: 1 },
  /** How far the camera stands from the board's plane. */
  uDistance: { value: 1 },
  /** Device pixels for a dot of size 1 on the board's plane: sizes the specks themselves. */
  uDot: { value: 1 },
  uLightPos: { value: new Vector3() },
  uLightColor: { value: new Color("#ef8e34") },
  uLightPower: { value: 0 },
  /** Board units at which the light has fallen to half. */
  uLightRange: { value: 420 },
};
