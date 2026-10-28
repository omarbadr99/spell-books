// The board's curve. Instead of a flat sheet in front of the sitters it wraps
// around them: its sides come forward, its middle sinks back, and its top tips
// away, like the inside of a bowl seen from near its rim. Every point is also
// drawn a little in toward the middle of the view, so the whole board still
// fits the screen. The shaders bend the particles with the same sums (BEND,
// below) that the page uses to find where on the board the pointer is.

/** How the board curves: how far its sides come forward and its top tips back, as shares of the camera's distance, and how much it is drawn in toward the middle of the view. */
export const CURVE = { around: 0.42, back: 0.06, keep: 0.68 } as const;

/**
 * The board's middle and half its size, and the middle of the view, in world
 * units; the camera's distance; and how strongly the board curves, 1 in full
 * (a phone's narrow board curves less, so its letters stay big enough to read).
 */
export interface BendFrame {
  board: { x: number; y: number; hw: number; hh: number };
  view: { x: number; y: number };
  distance: number;
  strength: number;
}

/** Where a point on the flat board (world space, y up) sits once the board is curved. */
export function bend(x: number, y: number, z: number, frame: BendFrame): [number, number, number] {
  const { board, view, distance, strength } = frame;
  const u = Math.max(-1.6, Math.min(1.6, (x - board.x) / board.hw));
  const v = Math.max(-1.6, Math.min(1.6, (y - board.y) / board.hh));
  const depth = Math.min(0.6 * distance, distance * strength * (CURVE.around * (u * u - 1 / 3) - CURVE.back * v) + z);
  const keep = 1 - (CURVE.keep * depth) / distance;
  return [view.x + (x - view.x) * keep, view.y + (y - view.y) * keep, depth];
}

/** The same, in GLSL. */
export const BEND = /* glsl */ `
uniform vec4 uBoard;   // the board's middle (xy) and half its width and height (zw), in world units
uniform vec4 uView;    // the middle of what the camera sees of the board's plane (xy), and half its width and height (zw)
uniform float uCurve;  // how strongly the board curves, 1 in full

vec3 bend(vec3 p) {
  vec2 q = clamp((p.xy - uBoard.xy) / uBoard.zw, -1.6, 1.6);
  float depth = min(0.6 * uDistance, uDistance * uCurve * (${CURVE.around.toFixed(3)} * (q.x * q.x - 1.0 / 3.0) - ${CURVE.back.toFixed(3)} * q.y) + p.z);
  float keep = 1.0 - ${CURVE.keep.toFixed(3)} * depth / uDistance;
  return vec3(uView.xy + (p.xy - uView.xy) * keep, depth);
}
`;
