// GLSL for the scene. Every layer is drawn as glowing points (or soft quads) added
// on top of each other, and every one is lit by the same candle.

/** The candle's light, falling off with the square of the distance. */
const CANDLELIGHT = /* glsl */ `
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform float uLightPower;
uniform float uLightRange;

float candlelight(vec3 p) {
  vec3 d = uLightPos - p;
  return uLightPower / (1.0 + dot(d, d) / (uLightRange * uLightRange));
}
`;

/** A round point: crisp for specks, a soft falloff for haze. */
export const POINT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a = vSoft > 0.5 ? (1.0 - r) * (1.0 - r) : smoothstep(1.0, 0.1, r);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

/**
 * The letters, numbers, words and the candle. Each point flies in from its start
 * to its home as the board forms, sways in the breeze, and takes the candle's
 * color the nearer it is to the flame.
 */
export const BOARD_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uForm;
uniform float uBreeze;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uGlow[64];
uniform vec3 uHole;
attribute vec3 aStart;
attribute vec4 aSeed;
attribute float aGlyph;
attribute float aKind;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}

void main() {
  // Forming: each point sets off a little after the last and swirls on its way in.
  float k = clamp((uForm - aSeed.x * 0.55) / 0.45, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec3 p = mix(aStart, position, e);
  float flight = sin(3.14159 * e);
  p += flight * 45.0 * vec3(sin(uTime * 1.3 + aSeed.y * 6.283), cos(uTime * 1.1 + aSeed.z * 6.283), sin(uTime * 0.9 + aSeed.w * 6.283));

  // The breeze: a slow wave across the board. Dust drifts most, the strokes barely.
  bool dust = aKind > 1.5 && aKind < 2.5;
  bool haze = aKind > 2.5;
  float loose = dust ? 1.0 : (haze ? 0.5 : 0.16);
  float wave = sin(uTime * 0.85 - p.x * 0.0045 + p.y * 0.002);
  p.x += uBreeze * loose * (16.0 * wave + 5.0 * sin(uTime * 1.9 + aSeed.y * 6.283));
  p.y += uBreeze * loose * 8.0 * cos(uTime * 0.7 - p.x * 0.005 + aSeed.z * 6.283);
  // And a shimmer that never stops.
  p.xy += 0.45 * vec2(sin(uTime * 2.3 + aSeed.x * 53.0), cos(uTime * 1.9 + aSeed.y * 47.0));

  float glow = aGlyph > -0.5 ? uGlow[int(aGlyph + 0.5)] : 0.0;
  float under = uHole.z * smoothstep(80.0, 20.0, distance(p.xy, uHole.xy));
  float light = candlelight(p);
  float twinkle = 0.8 + 0.2 * sin(uTime * (1.1 + aSeed.y * 2.4) + aSeed.z * 41.0);
  vec3 silver = vec3(0.94, 0.95, 1.0) * twinkle;
  vec3 warm = uLightColor * 1.1;
  vColor = mix(silver, warm, clamp(light * 1.3, 0.0, 0.94)) * (1.0 + light * 0.8 + glow * 1.5 + under * 0.5);

  float alpha = dust ? 0.5 : (haze ? 0.065 + glow * 0.08 : (aKind > 0.5 ? 0.78 : 0.95));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Specks are sized in screen pixels, so they stay specks on any screen; haze scales with the board.
  float px = haze
    ? (16.0 + aSeed.z * 16.0) * uFocal / -mv.z
    : (0.9 + aSeed.z * 1.6) * (dust ? 0.8 : 1.0) * uDot * uDistance / -mv.z;
  px *= 1.0 + glow * 0.35;
  // Nothing shows until the board starts to form.
  vAlpha = alpha * mix(0.35, 1.0, e) * smoothstep(0.0, 0.12, uForm);
  vSoft = haze ? 1.0 : 0.0;
  gl_PointSize = clamp(px, 1.0, 90.0);
  gl_Position = projectionMatrix * mv;
}
`;

/** Stars: far away, drifting and twinkling, turning slowly with the whole sky. */
export const STARS_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
attribute vec4 aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}

void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.035 + aSeed.x * 6.283) * 26.0;
  p.y += cos(uTime * 0.028 + aSeed.y * 6.283) * 18.0;
  float twinkle = 0.5 + 0.5 * sin(uTime * (0.5 + aSeed.z * 1.8) + aSeed.x * 61.0);
  float light = candlelight((modelMatrix * vec4(p, 1.0)).xyz) * 0.5;
  vColor = mix(vec3(0.78, 0.82, 0.95), uLightColor, clamp(light, 0.0, 0.8)) * (0.6 + 0.4 * twinkle + light);
  vAlpha = (0.15 + 0.85 * aSeed.w * aSeed.w) * (0.45 + 0.55 * twinkle);
  vSoft = 0.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((0.8 + aSeed.w * 2.4) * uDot * sqrt(uDistance / -mv.z), 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Points flowing along curved bands: faint drifts of nebula in the background,
 * or, near the candle, the breeze that comes with a presence. The bands are cubic
 * curves passed in as uniforms; each point knows its band and how far along it is.
 */
export const STREAM_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uSpeed;
uniform float uWidth;
uniform float uOpacity;
uniform float uWarmth;
uniform vec3 uA[6];
uniform vec3 uB[6];
uniform vec3 uC[6];
uniform vec3 uD[6];
attribute vec4 aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}

void main() {
  int band = int(aSeed.y + 0.5);
  float t = fract(aSeed.x + uTime * uSpeed * (0.6 + 0.8 * aSeed.w));
  float u = 1.0 - t;
  vec3 a = uA[band];
  vec3 b = uB[band];
  vec3 c = uC[band];
  vec3 d = uD[band];
  vec3 p = u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
  vec3 tangent = normalize(3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c));
  vec3 normal = vec3(-tangent.y, tangent.x, 0.0);
  float width = uWidth * (0.35 + sin(3.14159 * t));
  p += normal * aSeed.z * width + vec3(0.0, 0.0, aSeed.z * 50.0);
  p += normal * sin(uTime * 0.6 + t * 14.0 + aSeed.w * 6.283) * uWidth * 0.3;

  float light = candlelight(p);
  vec3 silver = vec3(0.82, 0.85, 0.94);
  float warm = clamp(uWarmth * (1.0 - smoothstep(0.1, 0.65, t)) + light, 0.0, 0.95);
  vColor = mix(silver, uLightColor * 1.25, warm) * (0.8 + light);
  vAlpha = uOpacity * sin(3.14159 * t) * (0.35 + 0.65 * aSeed.w);
  vSoft = 0.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((0.8 + aSeed.w * 1.7) * uDot * uDistance / -mv.z, 1.0, 8.0);
  gl_Position = projectionMatrix * mv;
}
`;

/** Loose motes simulated on the CPU: smoke when the candle goes out, embers while it burns. */
export const MOTE_VERTEX = /* glsl */ `
uniform float uFocal;
attribute vec4 aColor;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  vColor = aColor.rgb;
  vAlpha = aColor.a;
  vSoft = 1.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uFocal / -mv.z, 1.0, 120.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The flame: white at its heart, the candle's color at its edges, blue at its root, leaning with the breeze. */
export const FLAME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uLean;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  float y = vUv.y;
  float sway = (uLean * 0.55 + 0.05 * sin(uTime * 9.0) + 0.035 * sin(uTime * 15.0 + 1.7)) * y * y;
  float x = (vUv.x - 0.5) * 2.0 - sway;
  float w = 1.55 * pow(max(y, 0.0), 0.42) * pow(max(1.0 - y, 0.0), 0.95) + 0.02;
  float d = abs(x) / w;
  float body = smoothstep(1.0, 0.45, d) * smoothstep(0.0, 0.06, y);
  float core = smoothstep(0.6, 0.0, d) * smoothstep(0.02, 0.2, y) * smoothstep(0.72, 0.28, y);
  vec3 color = mix(uColor * 1.3, vec3(1.0, 0.97, 0.88), core);
  color = mix(color, vec3(0.45, 0.55, 1.0), smoothstep(0.16, 0.0, y) * (1.0 - core) * 0.6);
  gl_FragColor = vec4(color, clamp(body * 0.85 + core * 0.6, 0.0, 1.0) * uLevel);
}
`;

/** The light the flame throws into the air around it. */
export const GLOW_FRAGMENT = /* glsl */ `
uniform float uLevel;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 4.5) * 0.5 + exp(-r * r * 26.0) * 0.5;
  gl_FragColor = vec4(uColor, a * uLevel * smoothstep(1.0, 0.85, r));
}
`;
