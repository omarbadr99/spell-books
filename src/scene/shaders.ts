// GLSL for the scene. Every layer is drawn as glowing points (or soft quads) added
// on top of each other, every one is lit by the same candle, and everything that
// moves in the air moves with the same wind (see wind.ts).

import { BEND } from "./bend";
import { LAND_GLSL, ROLE } from "./land";

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
 * The board's points, in every picture they make.
 *
 * When the page opens they are loose dust in the dark (0). The dust flies
 * together into the word START, and what isn't START swirls round it in a
 * tilted disc, its near side passing close to the eye (1). When the séance
 * begins, START bursts and every point flies out past the eye and down into
 * its place on the board, the middle first (2). At the end the board breaks up
 * again into the farewell (3): the land of dust under the stars, the stream of
 * light flowing along its ridge, and the sitter and the spirit standing there
 * holding hands, laid out in land space (see land.ts). Points fly from one
 * picture to the next along a curve that swings out and toward the eye, each
 * setting off at its own moment.
 *
 * On the board a point lives in the wind: it leans as gusts pass and swings
 * back, and the loosest grains lift off the strokes and stream away downwind,
 * fading as they go, more of them the harder it blows. Two lights fall on it:
 * faint, cold moonlight from high beyond the board's far corner, and the
 * candle's warm light, both falling off with distance and catching most on the
 * stroke edges that face them. No two grains catch the light alike.
 */
export const BOARD_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFrom;    // the picture the points are leaving
uniform float uTo;      // the one they are making
uniform float uMorph;   // how far from one to the other, 0..1
uniform vec3 uPath;     // how wide they scatter on the way (x, half-heights of the view), how near the eye they fly (y, camera distances), and whether they set off from the board's middle outward (z = 1) or at random (0)
uniform float uNear;    // how near the planchette's glass is to START, 0..1
uniform vec2 uGrain;    // device pixels for a grain of size 1 in the farewell (x)
uniform float uAppear;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uGlow[64];
uniform vec3 uHole;
uniform vec3 uMoonPos;
uniform float uMoonPower;
uniform float uMoonRange;
attribute vec3 aStart;  // where it drifts as dust, in view units (see inView)
attribute vec4 aWord;   // its place in START (w = 0), or in the swirl round it (w = 1: angle, radius, height)
attribute vec4 aEnd;    // its place in the farewell, in land space, and what it is there (w: see ROLE in land.ts)
attribute vec4 aLook;   // how it shows there: see FarewellLayout in land.ts
attribute vec4 aSeed;
attribute vec4 aInfo;   // its glyph's slot (-1 for the candle), its kind, and which way its stroke's edge faces
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}
${NOISE}
${WIND}
${ROTATE}
${BEND}
${LAND_GLSL}

/** Where a point is in a picture and how it shows there; size is a speck's size before perspective. */
struct Look {
  vec3 p;
  vec3 color;
  float alpha;
  float size;
};

bool isDust;
bool isHaze;
float twinkle;

/** A fixed random number for each glyph, so no two letters catch the light quite alike. */
float glyphHash(float g) {
  return fract(sin(g * 12.9898 + 4.1) * 43758.5453);
}

/**
 * From view units to the world: x and y in half-heights of the view about its
 * middle, z in camera distances toward the eye. Whatever its depth, a point
 * shows at the same place on the screen.
 */
vec3 inView(vec3 v) {
  float z = v.z * uDistance;
  return vec3(uView.xy + v.xy * uView.w * (uDistance - z) / uDistance, z);
}

/** Each speck's own faint color, out in the dark. */
vec3 adrift() {
  return (aSeed.w < 0.5 ? mix(vec3(0.5, 0.6, 1.0), vec3(0.88, 0.9, 1.0), aSeed.w * 2.0)
    : mix(vec3(0.78, 0.62, 1.0), vec3(1.0, 0.82, 0.7), smoothstep(0.85, 1.0, aSeed.w))) * (0.45 + 0.75 * aSeed.z) * twinkle;
}

/** Loose dust, drifting. */
Look loose() {
  vec3 q = vec3(aStart.xy * 1.7, uTime * 0.05 + aSeed.w * 3.0);
  Look l;
  l.p = inView(aStart + vec3(0.05 * vec2(vnoise(q), vnoise(q + vec3(9.2, 4.1, 0.0))), 0.0));
  l.color = adrift();
  l.alpha = isHaze ? 0.0 : 0.16 + 0.42 * aSeed.z;
  l.size = 0.9 + aSeed.z * 1.4;
  return l;
}

/** START, breathing and stirring as the glass comes near, and the dust swirling round it. */
Look startWord() {
  Look l;
  if (aWord.w < 0.5) {
    float breathe = 0.5 + 0.5 * sin(uTime * 1.6 - aWord.x * 2.5);
    vec3 v = aWord.xyz;
    v.xy += (0.002 + 0.012 * uNear) * vec2(sin(uTime * (9.0 + 6.0 * aSeed.y) + aSeed.z * 40.0), cos(uTime * (8.0 + 7.0 * aSeed.z) + aSeed.y * 40.0));
    l.p = inView(v);
    vec3 silver = mix(vec3(0.7, 0.76, 0.94), vec3(0.97, 0.98, 1.0), aSeed.w) * (0.6 + 0.6 * aSeed.z * aSeed.z);
    l.color = silver * twinkle * (0.85 + 0.3 * breathe + 0.9 * uNear);
    l.alpha = isHaze ? 0.04 + 0.04 * breathe + 0.1 * uNear : (isDust ? 0.45 : 0.85) * (0.6 + 0.2 * breathe + 0.3 * uNear);
    l.size = 0.9 + aSeed.z * 1.5;
    return l;
  }
  // A disc of dust, turning faster toward its middle, tipped so its near side passes below START and close to the eye.
  float r = aWord.y;
  float a = aWord.x + uTime * 0.09 / pow(r, 1.5);
  vec3 disc = vec3(cos(a) * r, aWord.z, sin(a) * r);
  disc.yz = rotate2(disc.yz, 0.36);
  vec3 q = vec3(disc.xz * 1.3, uTime * 0.06);
  disc.y += 0.05 * vnoise(q);
  l.p = vec3(uView.xy + disc.xy * uView.w, disc.z * uView.w);
  float near = clamp(l.p.z / uDistance, -1.0, 1.0);
  // Thickest along two arms that wind out from START.
  float arms = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(2.0 * (a - 3.2 * r)), 3.0);
  l.color = adrift() * (1.0 + 0.6 * max(near, 0.0));
  l.alpha = isHaze ? 0.0 : (0.2 + 0.6 * aSeed.z) * arms * (0.75 + 0.6 * max(near, 0.0));
  l.size = 0.85 + aSeed.z * 1.3;
  return l;
}

/** On the board: curved round the sitters, in the wind and the light. */
Look onBoard() {
  float slot = aInfo.x;
  bool candle = slot < -0.5;
  vec3 p = bend(position);

  // The wind, reckoned where the point sits on the flat board, as the room's air is. Every point is held to
  // its place like a thread sewn into cloth: it leans with the air pushing on it, a moment late, and swings
  // back a little once a gust has gone by. Loose dust gives the most; the strokes themselves barely.
  float give = isDust ? 15.0 : (isHaze ? 2.2 : (aInfo.y > 0.5 ? 3.0 : 1.7));
  float now = gusting(position.xy, 0.12);
  float push = uWind.z * 0.3 + now - 0.4 * gusting(position.xy, 0.75);
  vec2 eddy = vec2(0.0);
  if (uWind.w + now > 0.002) {
    vec3 q = vec3((position.xy - uDrift) * 0.0045 + (isDust ? aSeed.yz * 3.0 : vec2(0.0)), uTime * 0.3);
    eddy = vec2(vnoise(q), vnoise(q + vec3(19.1, 7.3, 3.7)));
  }
  p.xy += give * (uWind.xy * push * 1.7 + eddy * (0.2 * uWind.w + 0.9 * now) * 1.5);
  // Gusts make everything shiver a little as they pass.
  p.xy += give * 0.16 * now * vec2(sin(uTime * 21.0 + aSeed.y * 40.0), cos(uTime * 17.0 + aSeed.z * 40.0));
  // And a shimmer that never stops.
  p.xy += 0.45 * vec2(sin(uTime * 2.3 + aSeed.x * 53.0), cos(uTime * 1.9 + aSeed.y * 47.0));

  // Shedding. Each grain has its own hold on the stroke; when the air blows harder than that, it lifts off,
  // streams away downwind in the eddies, fades, and comes back home unseen to go again. Stray dust goes in
  // a breeze; the strokes need a gust.
  float blow = uWind.w * (0.25 + 0.3 * uWind.z) + 1.1 * now;
  float hold = isDust ? -0.35 + 1.2 * aSeed.w : (isHaze ? 99.0 : 0.15 + 6.0 * aSeed.w);
  // The candle's wax holds on tighter than the letters' dust.
  if (candle) hold += 0.9;
  float shed = smoothstep(hold, hold + 0.45, blow);
  float u = fract(uTime * (0.14 + 0.2 * aSeed.y) + aSeed.z * 7.0);
  if (shed > 0.001) {
    vec3 qs = vec3(position.xy * 0.006, uTime * 0.25 + aSeed.x * 5.0);
    vec2 swirl = vec2(vnoise(qs), vnoise(qs + vec3(7.7, 2.9, 1.1)));
    p.xy += shed * (uWind.xy * (120.0 + 380.0 * aSeed.y) * pow(u, 1.2) + swirl * 70.0 * u + vec2(0.0, 36.0 * u));
    p.z += shed * 80.0 * u * (aSeed.x - 0.3);
  }
  float seen = mix(1.0, smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.6, 1.0, u)), shed);

  // The light.
  vec2 normal = aInfo.zw;
  float glow = candle ? 0.0 : uGlow[int(slot + 0.5)];
  float under = uHole.z * smoothstep(80.0, 20.0, distance(p.xy, uHole.xy));
  vec2 toFlame = uLightPos.xy - p.xy;
  float facing = dot(normal, toFlame / max(length(toFlame), 1.0));
  float light = candlelight(p) * (1.0 + 1.2 * max(facing, 0.0) - 0.5 * max(-facing, 0.0));
  vec3 toMoon = uMoonPos - p;
  float moonFacing = dot(normal, normalize(toMoon.xy));
  float moon = uMoonPower / (1.0 + dot(toMoon, toMoon) / (uMoonRange * uMoonRange));
  moon *= 1.0 + 0.7 * max(moonFacing, 0.0) - 0.35 * max(-moonFacing, 0.0);
  // Some grains glint, most are dull, and each letter is a little different.
  float grain = (0.4 + 1.2 * aSeed.z * aSeed.z) * (0.8 + 0.4 * glyphHash(slot));
  // Moonlight is cold: blue-grey to silver, with now and then a warmer speck.
  vec3 cold = mix(vec3(0.5, 0.6, 0.82), vec3(0.84, 0.87, 0.95), aSeed.w);
  if (fract(aSeed.y * 7.31) > 0.94) cold = vec3(0.86, 0.78, 0.68);
  float moonlit = moon * grain * twinkle;
  vec3 lit = cold * moonlit + uLightColor * light * (0.85 + 0.35 * grain);
  vec3 shine = mix(vec3(0.92, 0.94, 1.0), uLightColor * 1.25, clamp(light, 0.0, 0.9));
  // Grains caught by the wind glint as they leave.
  lit *= 1.0 + 0.7 * shed * (1.0 - u);

  // Dim grains are also thinner: where little light falls, the letters are barely there.
  float bright = moonlit + 1.3 * light;
  Look l;
  l.p = p;
  l.color = lit + shine * (glow * 1.2 + under * 0.3);
  l.alpha = seen * (isHaze
    ? 0.015 + 0.07 * clamp(bright, 0.0, 1.5) + glow * 0.08
    : (isDust ? 0.55 : (aInfo.y > 0.5 ? 0.8 : 0.95)) * clamp(0.24 + 1.15 * bright + glow, 0.14, 1.0));
  l.size = (0.9 + aSeed.z * 1.6) * (isDust ? 0.8 : 1.0) * (1.0 + glow * 0.35) * (1.0 - 0.3 * shed * u);
  return l;
}

/** The farewell: the sitter and the spirit holding hands, the streams of light, and the dust of the land. */
Look inLand() {
  Look l;
  vec3 q = aEnd.xyz;
  float role = aEnd.w;
  l.color = vec3(1.0);
  if (role < ${ROLE.spirit.toFixed(1)} - 0.5) {
    // The sitter: solid and bright all through, a little dimmer toward their edges and their feet, and
    // haloed faintly by the haze among their grains.
    q.xy += 0.0015 * vec2(sin(uTime * 1.7 + aSeed.x * 40.0), cos(uTime * 1.3 + aSeed.y * 40.0));
    l.p = fromLand(q);
    l.color *= (0.82 + 0.18 * smoothstep(0.0, 0.35, aLook.x)) * (0.88 + 0.12 * aLook.y);
    l.alpha = isHaze ? 0.035 : 1.0;
    l.size = 2.4 + 1.0 * aSeed.z;
    return l;
  }
  if (role < ${ROLE.spray.toFixed(1)} - 0.5) {
    // The spirit: thinner and greyer, fading toward its feet. Some of its grains drift off downwind, fade,
    // and come back to go again.
    float u = fract(uTime * (0.08 + 0.12 * aSeed.y) + aSeed.z * 7.0);
    float blown = step(0.85, aSeed.w);
    q += blown * vec3(0.3 + 0.4 * aSeed.y, 0.08, -0.1) * pow(u, 1.3);
    q.xy += 0.003 * vec2(sin(uTime * 2.1 + aSeed.x * 40.0), cos(uTime * 1.7 + aSeed.y * 40.0));
    l.p = fromLand(q);
    float seen = mix(1.0, smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.4, 1.0, u)), blown);
    float flicker = 0.86 + 0.14 * sin(uTime * (1.5 + 2.0 * aSeed.y) + aSeed.z * 30.0);
    l.color = vec3(0.88, 0.9, 0.93);
    l.alpha = (isHaze ? 0.02 : 0.72) * seen * flicker * (0.3 + 0.7 * smoothstep(0.0, 0.4, aLook.y));
    l.size = 2.2 + 1.0 * aSeed.z;
    return l;
  }
  if (role < ${ROLE.stream.toFixed(1)} - 0.5) {
    // Spray: grains blowing off the spirit and about their hands, drifting downwind and fading.
    float u = fract(uTime * (0.1 + 0.15 * aSeed.y) + aLook.x * 5.0);
    vec3 n = vec3(q.xy * 3.0, uTime * 0.2 + aSeed.x * 5.0);
    q += vec3(0.7, 0.16, -0.1) * u * (0.4 + aSeed.z) + 0.05 * vec3(vnoise(n), vnoise(n + vec3(7.7, 2.9, 1.1)), 0.0);
    l.p = fromLand(q);
    l.alpha = isHaze ? 0.0 : 0.55 * smoothstep(0.0, 0.15, u) * (1.0 - smoothstep(0.55, 1.0, u));
    l.size = 1.3 + 0.7 * aSeed.z;
    return l;
  }
  if (role < ${ROLE.ground.toFixed(1)} - 0.5) {
    // The streams: each grain runs a short way along its line and fades in and out as it goes, so the
    // whole stream flows.
    float run = aLook.z;
    float u = fract(uTime * (0.22 + 0.2 * aSeed.y) / run + aSeed.x);
    float along = (u - 0.5) * run;
    q.xz += vec2(cos(aLook.x), sin(aLook.x)) * along;
    q.y += aLook.y * along + 0.012 * sin(uTime * 3.0 + aSeed.z * 40.0);
    l.p = fromLand(q);
    l.alpha = isHaze ? 0.0 : aLook.w * sqrt(sin(3.14159 * u)) * landFade(q);
    l.size = 1.8 + 1.0 * aSeed.z;
    return l;
  }
  // The dust of the land, lying still and glinting now and then.
  l.p = fromLand(q);
  l.alpha = isHaze ? 0.0 : min(1.0, aLook.x * 0.8) * landFade(q) * (0.8 + 0.2 * twinkle);
  l.size = 1.7 + 0.9 * aSeed.z;
  return l;
}

/** The farewell, with its grains sized for the screen (see uGrain). */
Look farewell() {
  Look l = inLand();
  l.size *= uGrain.x / uDot;
  return l;
}

/**
 * When a point arrives in the farewell, 0..1: the far land first and then the
 * nearer, the streams from upstream down, then the spirit, and last the
 * sitter, from their feet up.
 */
float arrival() {
  float role = aEnd.w;
  if (role > ${ROLE.ground.toFixed(1)} - 0.5) return 0.5 * (1.0 - clamp((aEnd.z - 2.4) / 10.0, 0.0, 1.0)) + 0.12 * aSeed.x;
  if (role > ${ROLE.stream.toFixed(1)} - 0.5) return 0.25 + 0.4 * smoothstep(-8.0, 8.0, aEnd.x) + 0.1 * aSeed.x;
  if (role > ${ROLE.spirit.toFixed(1)} - 0.5) return 0.55 + 0.3 * aSeed.x;
  return 0.62 + 0.3 * aLook.y + 0.08 * aSeed.x;
}

Look formation(float which) {
  if (which < 0.5) return loose();
  if (which < 1.5) return startWord();
  if (which < 2.5) return onBoard();
  return farewell();
}

void main() {
  isDust = aInfo.y > 1.5 && aInfo.y < 2.5;
  isHaze = aInfo.y > 2.5;
  twinkle = 0.82 + 0.18 * sin(uTime * (1.1 + aSeed.y * 2.4) + aSeed.z * 41.0);

  Look l = formation(uTo);
  if (uFrom != uTo) {
    // On the way: each point sets off at its own moment and flies along a curve that swings out
    // from the middle of the view and toward the eye, and glints as it lands.
    Look a = formation(uFrom);
    float order = mix(aSeed.x, length((position.xy - uBoard.xy) / uBoard.zw) * 0.68 + 0.1 * aSeed.y, uPath.z);
    if (uTo > 2.5) order = arrival();
    float f = (uMorph - order * 0.5) / 0.5;
    float k = clamp(f, 0.0, 1.0);
    float e = k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(2.0 - 2.0 * k, 3.0) * 0.5;
    vec3 mid = (a.p + l.p) * 0.5;
    vec2 away = mid.xy - uView.xy;
    away /= max(length(away), 1.0);
    vec3 q = vec3(position.xy * 0.003, aSeed.w * 5.0 + uTime * 0.1);
    vec2 swirl = vec2(vnoise(q), vnoise(q + vec3(4.3, 7.1, 2.2)));
    vec3 c = mid + vec3((away * (0.4 + 0.6 * aSeed.y) + swirl * 0.6) * uPath.x * uView.w, (0.15 + 0.85 * aSeed.z) * uPath.y * uDistance);
    c.z = min(c.z, 0.55 * uDistance);
    float flight = sin(3.14159 * e);
    float landing = exp(-pow((f - 1.0) / 0.06, 2.0));
    l.p = mix(mix(a.p, c, e), mix(c, l.p, e), e);
    l.color = mix(a.color, l.color, e) + vec3(0.75, 0.8, 1.0) * (0.25 * flight + 0.8 * landing);
    l.alpha = mix(a.alpha, l.alpha, e) + (isHaze ? 0.0 : 0.15 * flight);
    l.size = mix(a.size, l.size, e);
  }

  vec4 mv = modelViewMatrix * vec4(l.p, 1.0);
  // Specks are sized in screen pixels, so they stay specks on any screen; haze scales with the board.
  float px = isHaze ? (16.0 + aSeed.z * 16.0) * uFocal / -mv.z : l.size * uDot * uDistance / -mv.z;
  vColor = l.color;
  vAlpha = l.alpha * uAppear;
  vSoft = isHaze ? 1.0 : 0.0;
  gl_PointSize = clamp(px, 1.0, 90.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * More dust on the land, shown only in the farewell (the board's own points
 * can't cover it all). As the land comes in, each grain settles into place out
 * of the dark at its own moment, the far land first.
 */
export const DUST_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uDistance;
uniform vec2 uGrain;    // device pixels for a grain of size 1 (y)
uniform float uLand;
uniform vec4 uView;
attribute vec4 aSeed;
attribute float aLight;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${LAND_GLSL}

void main() {
  vec3 q = position;
  float at = 0.1 + 0.5 * (1.0 - clamp((q.z - 2.4) / 10.0, 0.0, 1.0)) + 0.25 * aSeed.x;
  float settled = smoothstep(at, at + 0.15, uLand);
  q.y -= 0.12 * (1.0 - settled);
  float twinkle = 0.82 + 0.18 * sin(uTime * (1.1 + aSeed.y * 2.4) + aSeed.z * 41.0);
  vColor = vec3(1.0);
  vAlpha = min(1.0, aLight * 0.8) * landFade(q) * twinkle * settled;
  vSoft = 0.0;
  vec4 mv = modelViewMatrix * vec4(fromLand(q), 1.0);
  gl_PointSize = clamp((2.0 + 1.0 * aSeed.z) * uGrain.y * uDistance / -mv.z, 1.0, 7.0);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * RESTART, under the farewell's land, written the way START is: the same
 * silvery grains, breathing, and stirring and brightening as the planchette's
 * glass comes near. It gathers out of the dust once the land has formed, each
 * grain at its own moment, and bursts apart, out and toward the eye, when it is
 * pressed and the board flies back together.
 */
export const RESTART_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform vec4 uView;
uniform float uGather;  // how far it has gathered, 0..1
uniform float uNear;    // how near the planchette's glass is, 0..1
uniform float uBurst;   // how far it has burst apart, 0..1
uniform vec2 uMiddle;   // the middle of the word, in view units
attribute vec3 aFrom;   // where each grain drifts in from, in view units (see inView)
attribute vec4 aSeed;
attribute float aKind;  // what it is part of (KIND in sampling.ts)
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

/** From view units to the world: x and y in half-heights of the view about its middle, z in camera distances toward the eye. */
vec3 inView(vec3 v) {
  float z = v.z * uDistance;
  return vec3(uView.xy + v.xy * uView.w * (uDistance - z) / uDistance, z);
}

void main() {
  bool isDust = aKind > 1.5 && aKind < 2.5;
  bool isHaze = aKind > 2.5;
  float twinkle = 0.82 + 0.18 * sin(uTime * (1.1 + aSeed.y * 2.4) + aSeed.z * 41.0);
  float breathe = 0.5 + 0.5 * sin(uTime * 1.6 - position.x * 2.5);
  vec3 v = position;
  v.xy += (0.002 + 0.012 * uNear) * vec2(sin(uTime * (9.0 + 6.0 * aSeed.y) + aSeed.z * 40.0), cos(uTime * (8.0 + 7.0 * aSeed.z) + aSeed.y * 40.0));
  // Gathering: each grain sets off at its own moment and glides in, slowing as it arrives.
  float k = clamp((uGather - 0.45 * aSeed.x) / 0.55, 0.0, 1.0);
  v = mix(aFrom, v, 1.0 - pow(1.0 - k, 3.0));
  // Bursting: out from the middle of the word, rising a little, and toward the eye.
  float b = clamp((uBurst - 0.25 * aSeed.y) / 0.75, 0.0, 1.0);
  vec2 away = position.xy - uMiddle;
  away /= max(length(away), 0.001);
  v.xy += (away * (0.25 + 0.9 * aSeed.z) + vec2(0.0, 0.25 * b)) * b;
  v.z += (0.15 + 0.5 * aSeed.w) * b;

  vec3 silver = mix(vec3(0.7, 0.76, 0.94), vec3(0.97, 0.98, 1.0), aSeed.w) * (0.6 + 0.6 * aSeed.z * aSeed.z);
  // A little brighter than START, to hold its own under the lit land.
  vColor = silver * twinkle * (0.85 + 0.3 * breathe + 0.9 * uNear) * (1.3 + 0.8 * b);
  float shown = smoothstep(0.0, 0.25, k) * (1.0 - b);
  vAlpha = shown * (isHaze ? 0.04 + 0.04 * breathe + 0.1 * uNear : (isDust ? 0.45 : 0.85) * (0.6 + 0.2 * breathe + 0.3 * uNear));
  vSoft = isHaze ? 1.0 : 0.0;
  vec4 mv = modelViewMatrix * vec4(inView(v), 1.0);
  float px = isHaze ? (16.0 + aSeed.z * 16.0) * uFocal / -mv.z : (0.9 + aSeed.z * 1.5) * uDot * uDistance / -mv.z;
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
uniform float uLand;
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
  // In the farewell the stars are plain white points, and the land hides those low in the sky.
  float low = smoothstep(0.62, 0.42, gl_Position.y / gl_Position.w);
  vColor = mix(vColor, vec3(0.9) * (0.6 + 0.4 * twinkle), uLand);
  vAlpha *= 1.0 - uLand * (0.35 + 0.65 * low);
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
uniform float uLand;    // how far the farewell's land has come in: the dark clears for it
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
  vAlpha = uOpacity * edges * cloud * (0.25 + 0.75 * aSeed.w) * uAppear * (1.0 - 0.95 * uLand);
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
 * Streams of smoke flowing through the dark behind the board, at the top and
 * bottom of the view and far back across the middle. Each is a long ribbon of
 * specks that winds and twists as it goes, so it shows edge-on as a thin bright
 * thread and face-on as a faint veil; it gathers in clumps along its length and
 * frays into wisps at its edges. One stream passes close to the eye, out of focus.
 */
export const STREAM_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFlow;    // how far the streams have flowed
uniform float uFocal;
uniform float uDistance;
uniform float uDot;
uniform float uAppear;
uniform vec4 uView;     // the middle of what the camera sees of the board's plane, and half its width and height
uniform float uAloft;   // 1 until the board has formed
uniform float uLand;    // how far the farewell's land has come in
attribute vec4 aSeed;
attribute vec4 aLane;   // the stream's height in the view (-1..1), depth (a share of the camera's distance), how far it winds, and its phase
attribute vec4 aShape;  // how wide it is, how often it twists, how fast it flows, and how bright it is
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
${CANDLELIGHT}
${NOISE}

void main() {
  // position: how far along the stream (x), across it (y) and through it (z) the speck rides.
  float ph = aLane.w;
  float t = uTime;
  float z = aLane.y * uDistance;
  float wide = (uDistance - z) / uDistance;
  float s = fract(position.x + uFlow * aShape.z);
  float x = uView.x + (s - 0.5) * 2.5 * uView.z * wide;
  float bend = aLane.z * uView.w * wide;
  float y = uView.y + aLane.x * uView.w * wide
    + bend * (0.6 * sin(6.283 * s * 1.3 + ph + t * 0.05) + 0.4 * sin(6.283 * s * 2.9 + ph * 1.7 - t * 0.07));
  z += 0.4 * bend * sin(6.283 * s * 1.1 + ph * 2.3 + t * 0.04);

  // The ribbon's cross-section, twisting as it goes and swelling and narrowing.
  float twist = 6.283 * aShape.y * s + t * 0.1 + ph;
  float width = aShape.x * uView.w * wide * (0.5 + 0.5 * sin(6.283 * s * 1.7 + ph * 3.1 + t * 0.06));
  vec2 turn = vec2(cos(twist), sin(twist));
  vec3 p = vec3(x, y, z);
  p.yz += (turn * position.y + vec2(-turn.y, turn.x) * position.z * 0.4) * width;
  // It folds over on itself, and draws out into fine strands along the way it flows.
  vec3 q = vec3(s * 5.0 + ph, position.y * 1.4, t * 0.05);
  p.yz += vec2(vnoise(q), vnoise(q + vec3(5.2, 1.3, 7.7))) * width * (0.35 + 0.6 * abs(position.y));
  vec3 q2 = vec3(s * 14.0 + ph, position.y * 7.0 + position.z * 2.0, t * 0.06);
  p.yz += vec2(vnoise(q2), vnoise(q2 + vec3(2.1, 8.4, 3.3))) * width * 0.22;

  float ends = smoothstep(0.0, 0.15, s) * smoothstep(1.0, 0.85, s);
  float clump = smoothstep(-0.35, 0.65, vnoise(vec3(s * 6.0 + ph, t * 0.03, ph * 3.0)));
  float core = exp(-position.y * position.y * 1.2);
  float twinkle = 0.65 + 0.35 * sin(t * (0.6 + 1.6 * aSeed.y) + aSeed.z * 50.0);
  vec3 c = aSeed.w < 0.7 ? mix(vec3(0.62, 0.68, 0.9), vec3(0.88, 0.9, 0.97), aSeed.z) : vec3(0.68, 0.6, 0.94);
  float light = candlelight(p);
  vColor = mix(c, uLightColor * 1.3, clamp(light * 1.4, 0.0, 0.8)) * twinkle * (1.0 + light);
  // The stream across the middle shows most while the glyphs float through it.
  float middle = 1.0 - smoothstep(0.2, 0.5, abs(aLane.x));
  vAlpha = aShape.w * ends * (0.2 + 0.8 * clump) * (0.35 + 0.65 * core) * (0.3 + 0.7 * aSeed.x) * (1.0 + 1.6 * middle * uAloft) * uAppear * (1.0 - uLand);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  bool blur = aLane.y > 0.0;
  vSoft = blur ? 1.0 : 0.0;
  float px = blur
    ? (5.0 + 9.0 * aSeed.z) * uFocal / -mv.z
    : (0.8 + 1.3 * aSeed.z * aSeed.z + (aSeed.y > 0.97 ? 1.5 : 0.0)) * uDot * sqrt(uDistance / -mv.z);
  gl_PointSize = clamp(px, 1.0, 120.0);
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
