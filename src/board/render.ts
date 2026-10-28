// The board as the sitters see it: a Three.js scene of particles (the letters,
// numbers, words and candle, the stars, the dust and smoke flowing through space
// and the air of the room), with the planchette laid over it as soft gradients.
// It owns everything about the picture: which picture the points make and how
// they fly between them, the board's curve, which glyph glows, the candle's
// light, the wind and the camera's sway; and it knows where every point of the
// board shows on the screen, and which point is under the pointer.

import { Vector3 } from "three";
import { AirParticles, type Stirrer } from "../scene/air";
import { bend, type BendFrame } from "../scene/bend";
import { buildBoard, candleGeometry, FORMATION, MAX_GLYPHS, type BoardParticles, type Formation } from "../scene/board";
import { Flame } from "../scene/flame";
import { CandleLight } from "../scene/light";
import { Motes } from "../scene/motes";
import { fbm1 } from "../scene/noise";
import { Sky } from "../scene/sky";
import { Space } from "../scene/space";
import { Stage } from "../scene/stage";
import { Streams } from "../scene/streams";
import { shared } from "../scene/uniforms";
import { BREEZE, Wind, type Air } from "../scene/wind";
import type { BoardLayout, Point } from "./layout";

/** The planchette's window, in board units. */
const HOLE = 34;
/** A porcelain planchette, its point at the top and two lobes at the bottom; the window is at 0,0. */
const SHAPE =
  "M 0 -150 C 30 -110 98 -40 100 18 C 102 62 70 92 40 92 C 18 92 6 82 0 72 " +
  "C -6 82 -18 92 -40 92 C -70 92 -102 62 -100 18 C -98 -40 -30 -110 0 -150 Z";
const BOX = 'viewBox="-140 -175 280 300" width="280" height="300"';
/** How high the flame stands over the board, and the planchette's underside, for the shadow it casts. */
const FLAME_HEIGHT = 230;
const PLANCHETTE_HEIGHT = 14;

/** Seconds for the stars and the dust to fade in when the page opens. */
const APPEAR_SECONDS = 2.6;
/** How the points fly between pictures: how wide they scatter, how near the eye they come, and whether the board's middle goes first. */
const PATHS = {
  gather: [0.25, 0.08, 0],
  burst: [1.1, 0.95, 1],
  scatter: [0.7, 0.3, 0],
  regather: [0.45, 0.2, 0],
  settle: [0.3, 0.1, 1],
} as const satisfies Record<string, readonly [number, number, number]>;
type Path = keyof typeof PATHS;
/** How far the eye sways, in board units: following the hand, and drifting by itself. */
const SWAY = { x: 55, y: 36, idle: 14 };

const planchetteMarkup = `
  <svg class="porcelain" ${BOX} aria-hidden="true">
    <defs>
      <radialGradient id="pl-porcelain" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stop-color="#ffffff"/><stop offset="0.42" stop-color="#f1efeb"/>
        <stop offset="0.8" stop-color="#cdcac4"/><stop offset="1" stop-color="#a9a6a0"/>
      </radialGradient>
      <radialGradient id="pl-rim">
        <stop offset="0.78" stop-color="#55524d"/><stop offset="0.9" stop-color="#9c9993"/><stop offset="1" stop-color="#f4f2ee"/>
      </radialGradient>
      <mask id="pl-cut"><rect x="-140" y="-175" width="280" height="300" fill="#fff"/><circle r="${HOLE}" fill="#000"/></mask>
      <filter id="pl-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <clipPath id="pl-inside"><path d="${SHAPE}"/></clipPath>
    </defs>
    <g mask="url(#pl-cut)">
      <path d="${SHAPE}" fill="url(#pl-porcelain)"/>
      <g clip-path="url(#pl-inside)">
        <path d="${SHAPE}" fill="none" stroke="#6f6c66" stroke-opacity="0.45" stroke-width="16" filter="url(#pl-soft)"/>
        <ellipse cx="-34" cy="-52" rx="24" ry="44" fill="#fff" opacity="0.7" filter="url(#pl-soft)"/>
      </g>
      <circle r="${HOLE + 4}" fill="url(#pl-rim)"/>
    </g>
  </svg>
  <svg class="warm" ${BOX} aria-hidden="true">
    <defs>
      <linearGradient id="pl-warm" gradientUnits="userSpaceOnUse" x1="-120" y1="0" x2="120" y2="0">
        <stop class="pl-warm-stop" offset="0" stop-opacity="0.85"/><stop class="pl-warm-stop" offset="1" stop-opacity="0"/>
      </linearGradient>
      <mask id="pl-cut-warm"><rect x="-140" y="-175" width="280" height="300" fill="#fff"/><circle r="${HOLE}" fill="#000"/></mask>
    </defs>
    <path d="${SHAPE}" fill="url(#pl-warm)" mask="url(#pl-cut-warm)"/>
  </svg>
  <svg class="dwell" ${BOX} aria-hidden="true">
    <circle class="dwell-ring" r="${HOLE + 9}" pathLength="1" stroke-dasharray="0 1" transform="rotate(-90)"/>
    <circle class="send-ring" r="${HOLE + 17}" pathLength="1" stroke-dasharray="0 1" transform="rotate(-90)"/>
  </svg>`;

/** The planchette's shadow: its shape, softened, with light coming through the window. */
const shadeMarkup = `
  <svg ${BOX} aria-hidden="true">
    <defs>
      <filter id="pl-shade-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
      <mask id="pl-shade-cut"><rect x="-140" y="-175" width="280" height="300" fill="#fff"/><circle r="${HOLE}" fill="#000"/></mask>
    </defs>
    <g filter="url(#pl-shade-blur)"><path d="${SHAPE}" fill="#000" mask="url(#pl-shade-cut)"/></g>
  </svg>`;

/** A flight from one picture to another. */
interface Flight {
  from: Formation;
  to: Formation;
  t: number;
  seconds: number;
  hurry: boolean;
  done: () => void;
}

/** A layout's particles, and the shape of the view they were laid out for. */
type Built = BoardParticles & { aspect: number };

export class BoardView {
  layout!: BoardLayout;
  readonly light = new CandleLight();
  readonly wind = new Wind();
  /** How hard the wind is blowing over the board, 0..1: the sound of it follows this. */
  windLevel = 0;
  /** Whether to draw at a lower resolution when the device can't keep up. */
  adaptive = true;
  private readonly stage: Stage;
  private readonly sky: Sky;
  private readonly space: Space;
  private readonly streams: Streams;
  private readonly air: AirParticles;
  private readonly flame = new Flame();
  private readonly smoke = new Motes(160, false);
  private readonly embers = new Motes(80, true);
  private readonly boards = new Map<string, Built>();
  private board: Built | null = null;
  private readonly glow = new Float32Array(MAX_GLYPHS);
  private readonly litUntil = new Float64Array(MAX_GLYPHS);
  private hoverSlot = -1;
  /** The picture the points make, and the flight to the next one while they are on their way. */
  private shown: Formation = FORMATION.dust;
  private flight: Flight | null = null;
  private path: Path = "gather";
  private near = 0;
  private nearTarget = 0;
  private range = 420;
  private time = 0;
  private emberDue = 0;
  private shudderUntil = 0;
  private box: DOMRect | null = null;
  private pos: Point = { x: 0, y: 0 };
  private angle = 0;
  private planchetteShown = false;
  private last: Point | null = null;
  /** The planchette moving through the air, in world space. */
  private readonly stirrer: Stirrer = { x: 0, y: 0, vx: 0, vy: 0 };
  private readonly breath: Air = { x: 0, y: 0, gust: 0 };
  /** Where the viewer's hand is, from -1 to 1 across the screen. */
  private readonly hand = { x: 0, y: 0 };
  /** How long frames are taking, smoothed, and for how many frames in a row they've been too slow. */
  private frameTime = 1 / 60;
  private slowFrames = 0;
  private readonly planchette: HTMLElement;
  private readonly shade: HTMLElement;
  private readonly warm: SVGSVGElement;
  private readonly warmGradient: SVGLinearGradientElement;
  private readonly dwellRing: SVGCircleElement;
  private readonly sendRing: SVGCircleElement;

  constructor(
    canvas: HTMLCanvasElement,
    /** The board's box on the page: the particles line up with it. */
    readonly table: HTMLElement,
    /** A layer over the whole window, where the planchette is drawn. */
    overlay: HTMLElement,
  ) {
    const roomy = innerWidth * innerHeight > 900_000;
    this.stage = new Stage(canvas);
    this.sky = new Sky(roomy ? 3600 : 2400);
    this.space = new Space(roomy);
    this.streams = new Streams(roomy);
    this.air = new AirParticles(roomy ? 1100 : 650, 420);
    this.stage.scene.add(this.sky.heavens, ...this.space.layers, this.streams.points, this.air.points, this.flame.group, this.smoke.points, this.embers.points);
    this.air.points.renderOrder = 2;
    this.smoke.points.renderOrder = 4;
    this.embers.points.renderOrder = 7;

    this.shade = document.createElement("div");
    this.shade.id = "planchette-shade";
    this.shade.innerHTML = shadeMarkup;
    this.planchette = document.createElement("div");
    this.planchette.id = "planchette";
    this.planchette.innerHTML = planchetteMarkup;
    overlay.append(this.shade, this.planchette);
    this.warm = this.planchette.querySelector("svg.warm")!;
    this.warmGradient = this.planchette.querySelector("#pl-warm")!;
    this.dwellRing = this.planchette.querySelector(".dwell-ring")!;
    this.sendRing = this.planchette.querySelector(".send-ring")!;
  }

  /** Builds the board for a layout. Each layout's particles are made once and kept. */
  setLayout(layout: BoardLayout): void {
    const changed = this.layout !== undefined && this.layout.kind !== layout.kind;
    this.layout = layout;
    this.table.style.aspectRatio = `${layout.width} / ${layout.height}`;
    this.fit(true);
    shared.uBoard.value.set(layout.width / 2, -layout.height / 2, layout.width / 2, layout.height / 2);
    shared.uCurve.value = layout.kind === "wide" ? 1 : 0.5;

    if (this.board) this.stage.scene.remove(this.board.points);
    let board = this.boards.get(layout.kind);
    if (!board) {
      const aspect = this.aspect;
      board = { ...buildBoard(layout, this.density(), aspect), aspect };
      board.points.material.uniforms.uGlow.value = this.glow;
      this.boards.set(layout.kind, board);
    }
    this.board = board;
    this.stage.scene.add(board.points);
    // A board for a turned phone comes together out of the dust; otherwise it makes the same picture the old one did.
    if (changed && this.shown === FORMATION.board && !this.flight) {
      this.shown = FORMATION.dust;
      void this.fly(FORMATION.board, 1.4, "settle");
    }

    this.sky.place(layout);
    const candle = candleGeometry(layout);
    const frame = this.frame();
    const light = new Vector3(...bend(candle.light.x, candle.light.y, candle.light.z, frame));
    this.flame.place(new Vector3(...bend(candle.x, -candle.wickTop, 26, frame)), light, candle.flame);
    this.light.base.copy(light);
    this.light.height = candle.flame;
    this.range = layout.kind === "wide" ? 470 : 360;
    this.wind.setBounds(-200, -layout.height - 200, layout.width + 200, 200);
    // The moon is high up beyond the board's far top corner, away from the candle.
    shared.uMoonPos.value.set(layout.width * 1.12, layout.height * 0.3, 700);
    shared.uMoonRange.value = layout.width * (layout.kind === "wide" ? 1.1 : 1.35);
  }

  /** Throws away the particles and samples the glyphs again, e.g. once the board's font has arrived. */
  resample(): void {
    for (const board of this.boards.values()) board.points.geometry.dispose();
    this.boards.clear();
    if (this.board) this.stage.scene.remove(this.board.points);
    this.board = null;
    this.setLayout(this.layout);
  }

  /** The view's width for its height. */
  private get aspect(): number {
    const { view } = this.stage;
    return (view.x1 - view.x0) / (view.y1 - view.y0);
  }

  /** Device pixels per board unit on the board's plane. */
  private get pixels(): number {
    return ((this.box?.width ?? 800) * Math.min(2, window.devicePixelRatio || 1)) / this.layout.width;
  }

  /** Points to spend per square board unit of stroke: more where the screen has the pixels to show them. */
  private density(): number {
    return Math.min(0.6, Math.max(0.16, 0.55 * this.pixels ** 1.4));
  }

  /**
   * Sends the points flying into another picture over `seconds`, along one of
   * the PATHS. Resolves once they have all arrived. A flight already under way
   * is cut short: the points set off from the picture they were heading for.
   */
  private fly(to: Formation, seconds: number, path: Path): Promise<void> {
    if (this.flight) {
      this.shown = this.flight.to;
      this.flight.done();
    }
    this.path = path;
    return new Promise((done) => (this.flight = { from: this.shown, to, t: 0, seconds, hurry: false, done }));
  }

  /** As the page opens, the dust flies together into START. */
  gather(calm: boolean): Promise<void> {
    return this.fly(FORMATION.start, calm ? 0.01 : 4.6, "gather");
  }

  /** START bursts, and every point flies out past the eye and down into its place on the board. */
  open(calm: boolean): Promise<void> {
    return this.fly(FORMATION.board, calm ? 0.01 : 3.8, "burst");
  }

  /** The board breaks up into the farewell: the spirit reaching out, the wind and the ground. */
  farewell(calm: boolean): Promise<void> {
    return this.fly(FORMATION.farewell, calm ? 0.01 : 4.4, "scatter");
  }

  /** And back together into START, for another séance. */
  again(calm: boolean): Promise<void> {
    return this.fly(FORMATION.start, calm ? 0.01 : 3.6, "regather");
  }

  /** The sitters are in a hurry: the points fly the rest of the way quickly. */
  hurry(): void {
    if (this.flight) this.flight.hurry = true;
  }

  /** Whether the board is anything but settled and ready to spell on. */
  get forming(): boolean {
    return this.flight !== null || this.shown !== FORMATION.board;
  }

  /** How close the planchette's glass is to START, 0..1: START stirs and brightens as it comes. */
  nearStart(amount: number): void {
    this.nearTarget = amount;
  }

  /** Where START is on the page, in CSS pixels. */
  startBox(): { left: number; top: number; right: number; bottom: number } {
    const box = this.board?.start ?? { x0: -0.5, y0: -0.15, x1: 0.5, y1: 0.15 };
    const a = this.fromView(box.x0, box.y1);
    const b = this.fromView(box.x1, box.y0);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  /** Where the sitter stands in the farewell, on the page: the middle of their feet, and their height, in CSS pixels. */
  sitterBox(): { x: number; y: number; height: number } {
    const sitter = this.board?.sitter ?? { x: 0.3, y: -0.6, height: 1 };
    const feet = this.fromView(sitter.x, sitter.y);
    const head = this.fromView(sitter.x, sitter.y + sitter.height);
    return { x: feet.x, y: feet.y, height: feet.y - head.y };
  }

  /** A point on the board's plane given in view units (half-heights of the view about its middle, y up), on the page. */
  private fromView(x: number, y: number): Point {
    const { view } = this.stage;
    const half = (view.y1 - view.y0) / 2;
    return this.stage.project((view.x0 + view.x1) / 2 + x * half, (view.y0 + view.y1) / 2 + y * half, 0);
  }

  /** Where the viewer's hand is on the screen: the eye drifts a little toward it. */
  look(clientX: number, clientY: number): void {
    this.hand.x = Math.max(-1, Math.min(1, (clientX / innerWidth) * 2 - 1));
    this.hand.y = Math.max(-1, Math.min(1, (clientY / innerHeight) * 2 - 1));
  }

  /** How the board is curved, for the view as it is now. */
  private frame(): BendFrame {
    const { view, distance } = this.stage;
    const { width, height } = this.layout;
    return {
      board: { x: width / 2, y: -height / 2, hw: width / 2, hh: height / 2 },
      view: { x: (view.x0 + view.x1) / 2, y: (view.y0 + view.y1) / 2 },
      distance,
      strength: shared.uCurve.value,
    };
  }

  /** Where a point on the board (in board units) shows on the page, in CSS pixels. */
  toScreen(p: Point, frame = this.frame()): Point {
    const [x, y, z] = bend(p.x, -p.y, 0, frame);
    return this.stage.project(x, y, z);
  }

  /** The point on the board, in board units, that shows under a place on the page. */
  toBoard(clientX: number, clientY: number): Point {
    const frame = this.frame();
    const box = this.box ?? this.table.getBoundingClientRect();
    const k = box.width / this.layout.width;
    // Where it would be on a flat board, and from there a few steps of Newton's method.
    let u = (clientX - box.left) / k;
    let v = (clientY - box.top) / k;
    for (let i = 0; i < 6; i++) {
      const s = this.toScreen({ x: u, y: v }, frame);
      const ex = clientX - s.x;
      const ey = clientY - s.y;
      if (Math.abs(ex) + Math.abs(ey) < 0.2) break;
      const su = this.toScreen({ x: u + 4, y: v }, frame);
      const sv = this.toScreen({ x: u, y: v + 4 }, frame);
      const a = (su.x - s.x) / 4;
      const b = (sv.x - s.x) / 4;
      const c = (su.y - s.y) / 4;
      const d = (sv.y - s.y) / 4;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-6) break;
      u += (d * ex - b * ey) / det;
      v += (a * ey - c * ex) / det;
    }
    return { x: u, y: v };
  }

  /** Lines the scene up with the board's box, if the page has moved it. */
  fit(force = false): void {
    const box = this.table.getBoundingClientRect();
    const moved = force || !this.box || box.left !== this.box.left || box.top !== this.box.top || box.width !== this.box.width;
    if (moved) this.box = box;
    if (!this.stage.fit(box, this.layout)) return;
    // The dust fills whatever the camera can see, and the stream of space beyond it.
    const { view } = this.stage;
    this.air.setBounds(view.x0 - 100, view.y0 - 100, view.x1 + 100, view.y1 + 100);
    this.space.place(view, this.stage.distance);
    shared.uView.value.set((view.x0 + view.x1) / 2, (view.y0 + view.y1) / 2, (view.x1 - view.x0) / 2, (view.y1 - view.y0) / 2);
    shared.uDistance.value = this.stage.distance;
  }

  tick(now: number, dt: number): void {
    if (!this.board) return;
    this.time += dt;
    this.keepUp(dt);
    this.play(dt);
    this.sway(dt);
    this.fit();
    // START and the farewell are laid out for the view's shape; a much wider or narrower view lays them out again.
    if (Math.abs(this.aspect / this.board.aspect - 1) > 0.15) this.resample();
    const { light, wind, breath } = this;
    const candle = candleGeometry(this.layout);

    wind.update(dt);
    light.update(dt, wind.at(candle.x, -candle.wickTop + candle.flame * 0.5, breath));
    wind.at(this.layout.width / 2, -this.layout.height / 2, breath);
    this.windLevel = Math.min(1, Math.hypot(breath.x, breath.y) / (BREEZE * 3.2));

    for (let i = 0; i < MAX_GLYPHS; i++) {
      const target = (i === this.hoverSlot ? 0.35 : 0) + (now < this.litUntil[i] ? 0.55 : 0);
      const tau = this.glow[i] > target ? 0.45 : 0.08;
      this.glow[i] += (target - this.glow[i]) * (1 - Math.exp(-dt / tau));
    }
    this.near += (this.nearTarget - this.near) * (1 - Math.exp(-dt / 0.18));
    const settled = this.flight === null;
    const onBoard = settled && this.shown === FORMATION.board;

    shared.uTime.value = this.time;
    shared.uAppear.value = Math.min(1, this.time / APPEAR_SECONDS);
    shared.uFocal.value = this.stage.focal;
    shared.uDistance.value = this.stage.distance;
    shared.uDot.value = Math.min(1.6, Math.max(1, this.stage.pixels * 1.1));
    shared.uLightPos.value.copy(light.position);
    shared.uLightColor.value.copy(light.glow);
    shared.uLightPower.value = light.power;
    // As the flame flares its light reaches further across the board.
    shared.uLightRange.value = this.range * (1 + 0.45 * light.flare);
    shared.uWind.value.set(wind.dirX, wind.dirY, wind.speed / BREEZE, wind.presence);
    shared.uDrift.value.set(wind.driftX, wind.driftY);
    wind.pack(shared.uGustA.value, shared.uGustB.value);
    const uniforms = this.board.points.material.uniforms;
    const flight = this.flight;
    uniforms.uFrom.value = flight ? flight.from : this.shown;
    uniforms.uTo.value = flight ? flight.to : this.shown;
    uniforms.uMorph.value = flight ? Math.min(1, flight.t / flight.seconds) : 1;
    const [wide, nearEye, middleOut] = PATHS[this.path];
    (uniforms.uPath.value as Vector3).set(wide, nearEye, middleOut);
    uniforms.uNear.value = this.near;
    const hole = bend(this.pos.x, -this.pos.y, 0, this.frame());
    (uniforms.uHole.value as Vector3).set(hole[0], hole[1], onBoard && this.planchetteShown ? 1 : 0);

    this.sky.update(this.time);
    const breeze = wind.presence * (0.4 + 0.6 * wind.stir);
    this.space.update(dt, breeze);
    this.streams.update(dt, breeze, onBoard ? 0 : 1);
    this.flame.update(light);
    this.stir(dt, hole);
    // Motes of heat leave the tip of the flame, wherever the wind has bent it.
    const tip = light.tip;
    this.air.update(dt, wind, light.level > 0.01 ? { ...tip, level: light.level, flare: light.flare } : null, this.stirrer);
    // Now and then an ember, more of them as the flame flares.
    if (light.level > 0.6 && this.time > this.emberDue) {
      this.emberDue = this.time + (0.15 + Math.random() * 0.5) / (1 + 2.5 * light.flare);
      this.embers.emit({
        x: tip.x + (Math.random() - 0.5) * 8,
        y: tip.y,
        vx: (Math.random() - 0.5) * 20,
        vy: 50 + Math.random() * 80,
        life: 1.2 + Math.random() * 1.4,
        size: 3 + Math.random() * 3,
        color: [light.glow.r * 1.4, light.glow.g * 1.3, light.glow.b * 1.2],
        alpha: 0.9,
        drag: 0.8,
        lift: 70,
      });
    }
    this.smoke.update(dt, wind);
    this.embers.update(dt, wind);
    const shake = Math.max(0, this.shudderUntil - now) / 750;
    this.stage.render(shake * 9 * Math.sin(now * 0.09), shake * 6 * Math.cos(now * 0.13));
    this.placePlanchette();
  }

  /** Moves the flight between pictures on. */
  private play(dt: number): void {
    const flight = this.flight;
    if (!flight) return;
    flight.t += dt * (flight.hurry ? 4 : 1);
    if (flight.t < flight.seconds) return;
    this.shown = flight.to;
    this.flight = null;
    flight.done();
  }

  /**
   * A device that can't keep up gets a lighter picture: after a few seconds of
   * slow frames the scene is drawn at a lower resolution, a step at a time.
   */
  private keepUp(dt: number): void {
    this.frameTime += (dt - this.frameTime) * 0.05;
    if (!this.adaptive || this.time < 5 || this.flight || this.frameTime < 1 / 28) {
      this.slowFrames = 0;
      return;
    }
    if (++this.slowFrames < 120) return;
    this.slowFrames = 0;
    if (this.stage.lighten()) this.frameTime = 1 / 40;
  }

  /**
   * The eye drifts toward the viewer's hand, and wanders a little by itself, so
   * the dark has depth; further while there is no board to spell on.
   */
  private sway(dt: number): void {
    const t = this.time;
    const far = this.shown === FORMATION.board && !this.flight ? 1 : 1.6;
    const tx = far * (this.hand.x * SWAY.x + SWAY.idle * fbm1(t * 0.09 + 5));
    const ty = far * (-this.hand.y * SWAY.y + SWAY.idle * 0.7 * fbm1(t * 0.07 + 9));
    const k = 1 - Math.exp(-dt / 0.9);
    const { eye } = this.stage;
    eye.x += (tx - eye.x) * k;
    eye.y += (ty - eye.y) * k;
  }

  /** Follows the planchette through the air, so it can stir the dust as it goes. */
  private stir(dt: number, at: [number, number, number]): void {
    const { stirrer } = this;
    if (this.last && dt > 0) {
      const k = 1 - Math.exp(-dt / 0.08);
      stirrer.vx += ((at[0] - this.last.x) / dt - stirrer.vx) * k;
      stirrer.vy += ((at[1] - this.last.y) / dt - stirrer.vy) * k;
    }
    this.last = { x: at[0], y: at[1] };
    stirrer.x = at[0];
    stirrer.y = at[1];
  }

  /** The whole board shudders, as when it wakes for a new sitter. */
  shudder(): void {
    this.shudderUntil = performance.now() + 750;
  }

  /** While the spirit speaks the candle flares and the wind gets up. */
  speak(on: boolean): void {
    this.light.setFlare(on);
    this.wind.setStir(on);
  }

  /** The spirit goes: a last gust sweeps over the candle and across the board. */
  depart(): void {
    const candle = candleGeometry(this.layout);
    this.wind.blast(candle.x, -candle.wickTop + candle.flame * 0.5, 3.4);
  }

  /**
   * Draws the planchette where it is on the board, as the camera sees it now:
   * the side facing the candle catches its light, and it throws a soft shadow
   * across the board, away from the flame.
   */
  private placePlanchette(): void {
    const frame = this.frame();
    const at = this.toScreen(this.pos, frame);
    // Nearer parts of the board are drawn bigger, and so, a little, is the planchette.
    const across = this.toScreen({ x: this.pos.x + 8, y: this.pos.y }, frame);
    const flat = (this.box?.width ?? 800) / this.layout.width;
    const k = flat * Math.sqrt(Math.hypot(across.x - at.x, across.y - at.y) / 8 / flat);
    const s = this.layout.planchetteScale * k;
    this.planchette.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) rotate(${this.angle.toFixed(2)}deg) scale(${s.toFixed(4)})`;

    // The candle's flame, on the flat board, as the light reaches it.
    const candle = candleGeometry(this.layout);
    const dx = candle.light.x + this.light.lean * this.light.height * 0.12 - this.pos.x;
    const dy = -candle.light.y - this.pos.y;
    const range = shared.uLightRange.value * 1.1;
    const strength = this.planchetteShown ? Math.min(0.95, this.light.power / (1 + (dx * dx + dy * dy) / (range * range))) : 0;
    const warmth = Math.min(0.75, strength * 0.7);
    this.warm.style.opacity = warmth < 0.01 ? "0" : warmth.toFixed(3);
    const dark = Math.min(0.7, strength * 1.1);
    this.shade.style.opacity = dark < 0.01 ? "0" : dark.toFixed(3);
    if (strength < 0.01) return;
    const toward = (Math.atan2(dy, dx) * 180) / Math.PI - this.angle;
    this.warmGradient.setAttribute("gradientTransform", `rotate(${(toward + 180).toFixed(1)})`);
    const reach = PLANCHETTE_HEIGHT / (FLAME_HEIGHT - PLANCHETTE_HEIGHT);
    const under = this.toScreen({ x: this.pos.x - dx * reach, y: this.pos.y - dy * reach }, frame);
    this.shade.style.transform = `translate(${under.x.toFixed(1)}px, ${under.y.toFixed(1)}px) rotate(${this.angle.toFixed(2)}deg) scale(${(s * (1 + reach)).toFixed(4)})`;
  }

  drawPlanchette(pos: Point, angle: number): void {
    this.pos = pos;
    this.angle = angle;
  }

  /** The planchette shows, or hides (e.g. while the pointer is over the page's own buttons). */
  showPlanchette(on: boolean): void {
    this.planchetteShown = on;
    this.planchette.classList.toggle("here", on);
  }

  /** Progress of the ring round the window as the glass rests on a glyph, 0..1. */
  setDwell(progress: number): void {
    ring(this.dwellRing, progress);
  }

  /** Progress of the outer ring as the glass rests to send, 0..1. */
  setSend(progress: number): void {
    ring(this.sendRing, progress);
  }

  hover(id: string | null): void {
    this.hoverSlot = id ? (this.board?.slots.get(id) ?? -1) : -1;
  }

  /** Lights a glyph from within for a moment. */
  flash(id: string, ms = 900): void {
    const slot = this.board?.slots.get(id);
    if (slot === undefined) return;
    this.glow[slot] = 1.3;
    this.litUntil[slot] = performance.now() + ms;
  }

  /** Lights the candle, which brings the breeze of a presence, or snuffs it with a curl of smoke. */
  setCandle(lit: boolean): void {
    if (!lit && this.light.lit && this.layout) {
      const flame = this.light.position;
      for (let i = 0; i < 46; i++) {
        this.smoke.emit({
          x: flame.x + (Math.random() - 0.5) * 6,
          y: flame.y + this.light.height * 0.3 + Math.random() * 10,
          vx: (Math.random() - 0.5) * 12,
          vy: 20 + Math.random() * 30,
          life: 2.2 + Math.random() * 2,
          age: -Math.random() * 0.9,
          size: 12 + Math.random() * 12,
          grow: 2.6,
          color: [0.6, 0.6, 0.64],
          alpha: 0.32,
          drag: 0.5,
          lift: 45,
        });
      }
    }
    this.light.set(lit);
    this.wind.setPresence(lit);
  }

  setLightColor(hex: string): void {
    this.light.setColor(hex);
    for (const stop of this.planchette.querySelectorAll(".pl-warm-stop")) stop.setAttribute("stop-color", hex);
  }
}

/** Fills a ring round the planchette's window to `progress`. */
function ring(circle: SVGCircleElement, progress: number): void {
  circle.setAttribute("stroke-dasharray", `${progress.toFixed(3)} 1`);
  // An empty dash with round caps would still leave a dot.
  circle.style.visibility = progress > 0.001 ? "visible" : "hidden";
}
