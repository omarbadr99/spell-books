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

/** Turns a vector in the plane by `a` radians. */
const ROTATE = /* glsl */ `
vec2 rotate2(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}
`;

/**
 * The letters, numbers, words and the candle.
 *
 * Before the board forms, every point drifts in a slow whirl of dust in the
 * dark. Then each swirls in to its place, the middle of the board first and
 * the candle last, and flares as it lands.
 *
 * Once home it lives in the wind: it leans as gusts pass and swings back, and
 * the loosest grains lift off the strokes and stream away downwind, fading as
 * they go, more of them the harder it blows.
 *
 * Two lights fall on it: faint, cold moonlight from high beyond the board's
 * far corner, and the candle's warm light, both falling off with distance and
 * catching most on the stroke edges that face them. No two grains catch the
 * light alike.
 */
export const BOARD_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uForm;
uniform float uAppear;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uGlow[64];
uniform vec3 uHole;
uniform vec3 uWhirl;      // the whirl's middle (xy) and how far it reaches (z)
uniform vec3 uMoonPos;
uniform float uMoonPower;
uniform float uMoonRange;
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
${ROTATE}

/** A fixed random number for each glyph, so no two letters catch the light quite alike. */
float glyphHash(float g) {
  return fract(sin(g * 12.9898 + 4.1) * 43758.5453);
}

void main() {
  bool dust = aKind > 1.5 && aKind < 2.5;
  bool haze = aKind > 2.5;

  // Waiting in the whirl, turning a little faster toward its middle.
  vec2 out_ = aStart.xy - uWhirl.xy;
  float reach = clamp(length(out_) / uWhirl.z, 0.0, 1.0);
  vec3 start = vec3(uWhirl.xy + rotate2(out_, uTime * (0.025 + 0.05 * (1.0 - reach))), aStart.z);
  float k = clamp((uForm - aSeed.x * 0.5) / 0.44, 0.0, 1.0);
  if (k < 1.0) {
    vec3 qw = vec3(aStart.xy * 0.003, uTime * 0.12);
    start.xy += 26.0 * vec2(vnoise(qw), vnoise(qw + vec3(9.2, 4.1, 0.0)));
  }

  // Forming.
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec3 p = mix(start, position, e);
  p.xy = uWhirl.xy + rotate2(p.xy - uWhirl.xy, (1.0 - e) * smoothstep(0.0, 0.12, k) * (1.3 + aSeed.y));
  p += sin(3.14159 * e) * 40.0 * vec3(sin(uTime * 1.3 + aSeed.y * 6.283), cos(uTime * 1.1 + aSeed.z * 6.283), sin(uTime * 0.9 + aSeed.w * 6.283));
  float landing = exp(-pow((uForm - aSeed.x * 0.5 - 0.44) / 0.03, 2.0));

  // The wind. Every point is held to its place like a thread sewn into cloth: it
  // leans with the air pushing on it, a moment late, and swings back a little once
  // a gust has gone by. Loose dust gives the most; the strokes themselves barely.
  float give = dust ? 15.0 : (haze ? 2.2 : (aKind > 0.5 ? 3.0 : 1.7));
  float now = gusting(p.xy, 0.12);
  float push = uWind.z * 0.3 + now - 0.4 * gusting(p.xy, 0.75);
  vec2 eddy = vec2(0.0);
  if (uWind.w + now > 0.002) {
    vec3 q = vec3((p.xy - uDrift) * 0.0045 + (dust ? aSeed.yz * 3.0 : vec2(0.0)), uTime * 0.3);
    eddy = vec2(vnoise(q), vnoise(q + vec3(19.1, 7.3, 3.7)));
  }
  p.xy += e * give * (uWind.xy * push * 1.7 + eddy * (0.2 * uWind.w + 0.9 * now) * 1.5);
  // Gusts make everything shiver a little as they pass.
  p.xy += e * give * 0.16 * now * vec2(sin(uTime * 21.0 + aSeed.y * 40.0), cos(uTime * 17.0 + aSeed.z * 40.0));
  // And a shimmer that never stops.
  p.xy += 0.45 * vec2(sin(uTime * 2.3 + aSeed.x * 53.0), cos(uTime * 1.9 + aSeed.y * 47.0));

  // Shedding. Each grain has its own hold on the stroke; when the air blows harder
  // than that, it lifts off, streams away downwind in the eddies, fades, and comes
  // back home unseen to go again. Stray dust goes in a breeze; the strokes need a gust.
  float blow = uWind.w * (0.25 + 0.3 * uWind.z) + 1.1 * now;
  float hold = dust ? -0.35 + 1.2 * aSeed.w : (haze ? 99.0 : 0.15 + 6.0 * aSeed.w);
  // The candle's wax holds on tighter than the letters' dust.
  if (aGlyph < -0.5) hold += 0.9;
  float shed = e * smoothstep(hold, hold + 0.45, blow);
  float u = fract(uTime * (0.14 + 0.2 * aSeed.y) + aSeed.z * 7.0);
  if (shed > 0.001) {
    vec3 qs = vec3(position.xy * 0.006, uTime * 0.25 + aSeed.x * 5.0);
    vec2 swirl = vec2(vnoise(qs), vnoise(qs + vec3(7.7, 2.9, 1.1)));
    p.xy += shed * (uWind.xy * (120.0 + 380.0 * aSeed.y) * pow(u, 1.2) + swirl * 70.0 * u + vec2(0.0, 36.0 * u));
    p.z += shed * 80.0 * u * (aSeed.x - 0.3);
  }
  float seen = mix(1.0, smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.6, 1.0, u)), shed);

  // The light.
  float glow = aGlyph > -0.5 ? uGlow[int(aGlyph + 0.5)] : 0.0;
  float under = uHole.z * smoothstep(80.0, 20.0, distance(p.xy, uHole.xy));
  vec2 toFlame = uLightPos.xy - p.xy;
  float facing = dot(aNormal, toFlame / max(length(toFlame), 1.0));
  float light = candlelight(p) * (1.0 + 1.2 * max(facing, 0.0) - 0.5 * max(-facing, 0.0));
  vec3 toMoon = uMoonPos - p;
  float moonFacing = dot(aNormal, normalize(toMoon.xy));
  float moon = uMoonPower / (1.0 + dot(toMoon, toMoon) / (uMoonRange * uMoonRange));
  moon *= 1.0 + 0.7 * max(moonFacing, 0.0) - 0.35 * max(-moonFacing, 0.0);
  // Some grains glint, most are dull, and each letter is a little different.
  float grain = (0.4 + 1.2 * aSeed.z * aSeed.z) * (0.8 + 0.4 * glyphHash(aGlyph));
  float twinkle = 0.82 + 0.18 * sin(uTime * (1.1 + aSeed.y * 2.4) + aSeed.z * 41.0);
  // Moonlight is cold: blue-grey to silver, with now and then a warmer speck.
  vec3 cold = mix(vec3(0.5, 0.6, 0.82), vec3(0.84, 0.87, 0.95), aSeed.w);
  if (fract(aSeed.y * 7.31) > 0.94) cold = vec3(0.86, 0.78, 0.68);
  float moonlit = moon * grain * twinkle;
  vec3 lit = cold * moonlit + uLightColor * light * (0.85 + 0.35 * grain);
  vec3 shine = mix(vec3(0.92, 0.94, 1.0), uLightColor * 1.25, clamp(light, 0.0, 0.9));
  // Out in the dark before the board forms, each speck has its own faint color.
  vec3 adrift = (aSeed.w < 0.5 ? mix(vec3(0.5, 0.6, 1.0), vec3(0.88, 0.9, 1.0), aSeed.w * 2.0)
    : mix(vec3(0.78, 0.62, 1.0), vec3(1.0, 0.82, 0.7), smoothstep(0.85, 1.0, aSeed.w))) * (0.45 + 0.75 * aSeed.z) * twinkle;
  // Grains caught by the wind glint as they leave.
  lit *= 1.0 + 0.7 * shed * (1.0 - u);
  vColor = mix(adrift, lit, e) + shine * (glow * 1.2 + landing * 1.1 + under * 0.3);

  // Dim grains are also thinner: where little light falls, the letters are barely there.
  float bright = moonlit + 1.3 * light;
  float alpha = haze
    ? 0.015 + 0.07 * clamp(bright, 0.0, 1.5) + glow * 0.08
    : (dust ? 0.55 : (aKind > 0.5 ? 0.8 : 0.95)) * clamp(0.24 + 1.15 * bright + glow, 0.14, 1.0);
  // Out in the whirl, brightest toward its middle.
  float waiting = (0.3 + 0.6 * aSeed.z) * (1.35 - 0.7 * reach) * (haze ? 0.25 : 1.0);
  alpha = mix(waiting, alpha, e) * seen * uAppear;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Specks are sized in screen pixels, so they stay specks on any screen; haze scales with the board.
  float px = haze
    ? (16.0 + aSeed.z * 16.0) * uFocal / -mv.z
    : (0.9 + aSeed.z * 1.6) * (dust ? 0.8 : 1.0) * uDot * uDistance / -mv.z;
  px *= (1.0 + glow * 0.35) * (1.0 - 0.3 * shed * u);
  vAlpha = alpha;
  vSoft = haze ? 1.0 : 0.0;
  gl_PointSize = clamp(px, 1.0, 90.0);
  gl_Position = projectionMatrix * mv;
}
`;

/** Stars: drifting and twinkling, turning slowly with the whole sky. */
export const STARS_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uBright;
uniform float uAppear;
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
  float shown = smoothstep((1.0 - aSeed.w) * 0.7, (1.0 - aSeed.w) * 0.7 + 0.3, uAppear);
  vAlpha = (0.15 + 0.85 * aSeed.w * aSeed.w) * (0.45 + 0.55 * twinkle) * uBright * shown;
  vSoft = 0.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((0.8 + aSeed.w * 2.4) * uDot * sqrt(uDistance / -mv.z), 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dust flowing through space at one depth. Each speck rides the current and
 * wraps around its box, so the stream never ends; a still field of eddies bends
 * the stream as it passes through, and the far layers gather into faint clouds.
 * The nearest layer, between the eye and the board, is out of focus.
 */
export const FLOW_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uAppear;
uniform vec3 uMin;
uniform vec3 uSize;
uniform vec3 uCurrent;  // how far the current has carried this layer so far
uniform float uEddies;  // how far the eddies push, in board units
uniform float uScale;   // how small the eddies are
uniform float uSpeck;   // a speck's size: device pixels for sharp layers, board units for the blurred one
uniform float uBlur;    // 1 for the out-of-focus layer
uniform float uOpacity;
uniform float uClouds;  // how much the layer gathers into clouds
attribute vec4 aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}
${NOISE}

void main() {
  // position holds where in its box each speck started, as fractions of the box.
  vec3 f = fract(position + uCurrent * (0.65 + 0.7 * aSeed.x) / uSize);
  vec3 p = uMin + f * uSize;
  // Fade at the box's edges, so nothing pops as it wraps around.
  float edges = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.08, f.y)
    * smoothstep(1.0, 0.92, f.y) * smoothstep(0.0, 0.1, f.z) * smoothstep(1.0, 0.9, f.z);
  vec3 q = p * uScale + vec3(0.0, 0.0, uTime * 0.02);
  p.xy += uEddies * vec2(vnoise(q), vnoise(q + vec3(17.1, 3.3, 9.7)));
  float cloud = 1.0;
  if (uClouds > 0.0) cloud = mix(1.0, smoothstep(-0.25, 0.55, vnoise(p * uScale * 0.45 + vec3(3.0, 1.0, uTime * 0.01))), uClouds);

  // Mostly cold blues and silvers, some violet, now and then teal or a warm one.
  float hue = aSeed.y;
  vec3 c = hue < 0.55 ? mix(vec3(0.62, 0.7, 0.95), vec3(0.85, 0.88, 0.96), aSeed.z)
    : (hue < 0.83 ? vec3(0.64, 0.56, 0.93) : (hue < 0.95 ? vec3(0.5, 0.76, 0.88) : vec3(0.95, 0.78, 0.6)));
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.4 + aSeed.z * 1.6) + aSeed.w * 50.0);
  float light = candlelight(p);
  vColor = mix(c, uLightColor * 1.3, clamp(light * 1.5, 0.0, 0.85)) * (0.55 + 0.45 * twinkle) * (1.0 + light);
  vAlpha = uOpacity * edges * cloud * (0.25 + 0.75 * aSeed.w) * uAppear;
  vSoft = uBlur;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float px = uBlur > 0.5
    ? uSpeck * (0.5 + aSeed.z) * uFocal / -mv.z
    : uSpeck * (0.6 + 1.2 * aSeed.z * aSeed.z) * uDot * sqrt(uDistance / -mv.z);
  gl_PointSize = clamp(px, 1.0, 140.0);
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
  float bend = (uLean * 0.8 + lick) * y * y;
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
