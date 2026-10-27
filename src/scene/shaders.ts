// GLSL for the scene. Every layer is drawn as glowing points (or soft quads) added
// on top of each other, every one is lit by the same candle, and everything that
// moves in the air moves with the same wind (see wind.ts).

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

/** Smooth value noise in -1..1. */
const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z) * 2.0 - 1.0;
}
`;

/** The same wind the CPU blows: its mean, and the gusts rolling across the board. */
const WIND = /* glsl */ `
uniform vec4 uWind;     // direction (xy), mean speed in breezes (z), presence (w)
uniform vec2 uDrift;    // how far the air has carried its eddies
uniform vec4 uGustA[4]; // each gust: along, across, half length, half width
uniform vec4 uGustB[4]; // each gust: strength in breezes, speed

/** How hard the gusts were blowing at p, lag seconds ago. */
float gusting(vec2 p, float lag) {
  vec2 across = vec2(-uWind.y, uWind.x);
  float s = dot(p, uWind.xy);
  float l = dot(p, across);
  float g = 0.0;
  for (int i = 0; i < 4; i++) {
    float ds = (s - uGustA[i].x + uGustB[i].y * lag) / uGustA[i].z;
    float dl = (l - uGustA[i].y) / uGustA[i].w;
    g += uGustB[i].x * exp(-ds * ds - dl * dl);
  }
  return g;
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
 * to its home as the board forms, leans in the wind, and is lit by the candle:
 * more the nearer it is, and more where its stroke's edge faces the flame.
 */
export const BOARD_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uForm;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uGlow[64];
uniform vec3 uHole;
attribute vec3 aStart;
attribute vec4 aSeed;
attribute float aGlyph;
attribute float aKind;
attribute vec2 aNormal;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}
${NOISE}
${WIND}

void main() {
  // Forming: each point sets off a little after the last, swirls on its way in,
  // and flares as it lands.
  float k = clamp((uForm - aSeed.x * 0.5) / 0.44, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec3 p = mix(aStart, position, e);
  float flight = sin(3.14159 * e);
  p += flight * 45.0 * vec3(sin(uTime * 1.3 + aSeed.y * 6.283), cos(uTime * 1.1 + aSeed.z * 6.283), sin(uTime * 0.9 + aSeed.w * 6.283));
  float landing = exp(-pow((uForm - aSeed.x * 0.5 - 0.44) / 0.03, 2.0));

  // The wind. Every point is held to its place like a thread sewn into cloth: it
  // leans with the air pushing on it, a moment late, and swings back a little once
  // a gust has gone by. Loose dust gives the most; the strokes themselves barely.
  bool dust = aKind > 1.5 && aKind < 2.5;
  bool haze = aKind > 2.5;
  float give = dust ? 15.0 : (haze ? 2.2 : (aKind > 0.5 ? 3.0 : 1.7));
  float now = gusting(p.xy, 0.12);
  float push = uWind.z * 0.3 + now - 0.4 * gusting(p.xy, 0.75);
  vec3 q = vec3((p.xy - uDrift) * 0.0045 + (dust ? aSeed.yz * 3.0 : vec2(0.0)), uTime * 0.3);
  vec2 eddy = vec2(vnoise(q), vnoise(q + vec3(19.1, 7.3, 3.7)));
  p.xy += give * (uWind.xy * push * 1.7 + eddy * (0.2 * uWind.w + 0.9 * now) * 1.5);
  // Gusts make everything shiver a little as they pass.
  p.xy += give * 0.16 * now * vec2(sin(uTime * 21.0 + aSeed.y * 40.0), cos(uTime * 17.0 + aSeed.z * 40.0));
  // And a shimmer that never stops.
  p.xy += 0.45 * vec2(sin(uTime * 2.3 + aSeed.x * 53.0), cos(uTime * 1.9 + aSeed.y * 47.0));

  float glow = aGlyph > -0.5 ? uGlow[int(aGlyph + 0.5)] : 0.0;
  float under = uHole.z * smoothstep(80.0, 20.0, distance(p.xy, uHole.xy));
  // Edges turned toward the flame catch its light; edges turned away fall into shadow.
  vec2 toLight = uLightPos.xy - p.xy;
  float facing = dot(aNormal, toLight / max(length(toLight), 1.0));
  float light = candlelight(p) * (1.0 + 1.2 * max(facing, 0.0) - 0.5 * max(-facing, 0.0));
  float twinkle = 0.8 + 0.2 * sin(uTime * (1.1 + aSeed.y * 2.4) + aSeed.z * 41.0);
  vec3 silver = vec3(0.94, 0.95, 1.0) * twinkle;
  vec3 warm = uLightColor * 1.1;
  vColor = mix(silver, warm, clamp(light * 1.3, 0.0, 0.94)) * (1.0 + light * 0.8 + glow * 1.5 + under * 0.5 + landing * 1.4);

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

/**
 * The title that opens the séance: gathered out of a slow whirl of dust, held a
 * moment, then torn away downwind, each speck in its own eddy.
 */
export const TITLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uGather;
uniform float uGone;
uniform vec2 uMiddle;
attribute vec3 aStart;
attribute vec4 aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${NOISE}
${WIND}

void main() {
  float k = clamp((uGather - aSeed.x * 0.45) / 0.55, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec3 p = mix(aStart, position, e);
  // It whirls in about the title's middle, turning less the nearer it is to home.
  float turn = (1.0 - e) * (2.4 + aSeed.y * 1.5);
  vec2 r = p.xy - uMiddle;
  p.xy = uMiddle + vec2(r.x * cos(turn) - r.y * sin(turn), r.x * sin(turn) + r.y * cos(turn));

  // Torn away: the first specks go at once, the rest a moment later.
  float g = clamp((uGone - aSeed.z * 0.4) / 0.6, 0.0, 1.0);
  vec3 q = vec3(position.xy * 0.005, uTime * 0.4 + aSeed.w * 3.0);
  vec2 eddy = vec2(vnoise(q), vnoise(q + vec3(13.7, 3.1, 0.0)));
  p.xy += uWind.xy * g * g * (650.0 + 900.0 * aSeed.w) + eddy * g * 190.0;
  p.z += g * g * 260.0 * (aSeed.y - 0.5);

  float twinkle = 0.75 + 0.25 * sin(uTime * (1.3 + aSeed.y * 2.0) + aSeed.z * 37.0);
  vColor = vec3(0.92, 0.94, 1.0) * twinkle * (1.0 + 0.8 * exp(-pow((uGather - aSeed.x * 0.45 - 0.55) / 0.04, 2.0)));
  vAlpha = (0.25 + 0.7 * e) * smoothstep(0.0, 0.25, k) * (1.0 - g) * (aSeed.y > 0.94 ? 0.12 : 0.9);
  vSoft = aSeed.y > 0.94 ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float px = aSeed.y > 0.94 ? (14.0 + aSeed.z * 12.0) * uFocal / -mv.z : (0.9 + aSeed.z * 1.5) * uDot * uDistance / -mv.z;
  gl_PointSize = clamp(px, 1.0, 60.0);
  gl_Position = projectionMatrix * mv;
}
`;

/** Stars and the dust of far nebulae: drifting and twinkling, turning slowly with the whole sky. */
export const STARS_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uBright;
uniform float uSky;
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
  // The sky fades in star by star, the brightest first.
  float shown = smoothstep((1.0 - aSeed.w) * 0.7, (1.0 - aSeed.w) * 0.7 + 0.3, uSky);
  vAlpha = (0.15 + 0.85 * aSeed.w * aSeed.w) * (0.45 + 0.55 * twinkle) * uBright * shown;
  vSoft = 0.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((0.8 + aSeed.w * 2.4) * uDot * sqrt(uDistance / -mv.z), 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * The air made visible: dust and the motes rising off the flame, each carried
 * by the wind on the CPU and drawn as a short streak along its path. Dust is
 * all but invisible in the dark and glints as it drifts near the candle.
 */
export const AIR_VERTEX = /* glsl */ `
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uTrail;
attribute vec2 aVel;
attribute vec4 aInfo; // age as a share of its life, kind (0 dust, 1 flame mote), size, brightness
varying vec3 vColor;
varying float vAlpha;
varying vec2 vDir;
varying vec2 vSpan;
${CANDLELIGHT}

void main() {
  float u = aInfo.x;
  bool mote = aInfo.y > 0.5;
  float light = candlelight(position);
  float fade = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.7, 1.0, u));
  if (mote) {
    // Hot as it leaves the flame, cooling to a grey wisp as it drifts off.
    float heat = exp(-u * 3.5);
    vColor = mix(vec3(0.62, 0.62, 0.66) * (0.5 + light), mix(uLightColor * 1.4, vec3(1.0, 0.95, 0.85), 0.35), heat);
    vAlpha = fade * (0.12 + 0.75 * heat) * aInfo.w;
  } else {
    vColor = mix(vec3(0.75, 0.78, 0.88), uLightColor * 1.3, clamp(light * 1.6, 0.0, 0.9));
    vAlpha = fade * aInfo.w * (0.1 + 0.9 * smoothstep(0.08, 0.9, light));
  }

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float thick = (0.7 + aInfo.z) * uDot * uDistance / -mv.z;
  float speed = length(aVel);
  float len = speed * uTrail * uFocal / -mv.z;
  float half_ = len * 0.5 + thick;
  vDir = speed > 0.001 ? aVel / speed : vec2(1.0, 0.0);
  vSpan = vec2(len * 0.5, thick) / half_;
  gl_PointSize = clamp(half_ * 2.0, 1.0, 64.0);
  // A streak trails behind where the speck is now.
  gl_Position = projectionMatrix * (mv - vec4(aVel * uTrail * 0.5, 0.0, 0.0));
}
`;

/** A short streak inside a point: a soft line along vDir, brightest at its head. */
export const STREAK_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying vec2 vDir;
varying vec2 vSpan;

void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.0;
  q.y = -q.y;
  float t = clamp(dot(q, vDir), -vSpan.x, vSpan.x);
  float d = length(q - vDir * t) / max(vSpan.y, 0.001);
  if (d > 1.0) discard;
  float head = vSpan.x > 0.001 ? (t + vSpan.x) / (2.0 * vSpan.x) : 1.0;
  gl_FragColor = vec4(vColor, (1.0 - d) * (1.0 - d) * mix(0.2, 1.0, head) * vAlpha);
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

/** How much wider than the flame its quad is, so a leaning flame has room. */
export const FLAME_ROOM = 3.2;

/**
 * The flame: white at its heart, the candle's color at its edges, blue at its
 * root. Noise rises through it so it licks upward; the wind bends it over and
 * makes it flutter; while a spirit speaks it burns taller and whiter.
 */
export const FLAME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uLean;
uniform float uFlutter;
uniform float uFlare;
uniform vec3 uColor;
varying vec2 vUv;
${NOISE}

void main() {
  float y = vUv.y;
  float lick = vnoise(vec3(vUv.x * 3.0, y * 2.6 - uTime * 3.4, uTime * 0.8)) * (0.06 + 0.22 * uFlutter);
  float bend = (uLean * 1.1 + lick) * y * y;
  float x = (vUv.x - 0.5) * 2.0 * ${FLAME_ROOM.toFixed(1)} - bend * 1.8;
  float w = (1.55 * pow(max(y, 0.0), 0.42) * pow(max(1.0 - y, 0.0), 0.95) + 0.02) * (1.0 - 0.3 * min(abs(uLean), 1.0) * y);
  float d = abs(x) / w;
  float body = smoothstep(1.0, 0.45, d) * smoothstep(0.0, 0.06, y);
  float core = smoothstep(0.6, 0.0, d) * smoothstep(0.02, 0.2, y) * smoothstep(0.72, 0.28, y);
  vec3 color = mix(uColor * 1.3, vec3(1.0, 0.97, 0.88), clamp(core + 0.3 * uFlare, 0.0, 1.0));
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
