// The board as the sitters see it: a Three.js scene of particles (the letters,
// numbers, words and candle, the sky and the air), with the planchette and the
// center ring laid over it as soft gradients. It owns everything about the
// picture: which glyph glows, the candle's light, the wind, how far the board
// has formed, and the opening that brings it all out of the dark.

import { AirParticles, type Stirrer } from "../scene/air";
import { buildBoard, candleGeometry, MAX_GLYPHS, type BoardParticles } from "../scene/board";
import { Flame } from "../scene/flame";
import { CandleLight } from "../scene/light";
import { Motes } from "../scene/motes";
import { Sky } from "../scene/sky";
import { Stage } from "../scene/stage";
import { Title } from "../scene/title";
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

/** The opening, in seconds from the start: when each part begins, and how long it takes. */
const OPENING = {
  sky: [0.1, 3.2],
  planchette: 0.6,
  dolly: [0, 6.6],
  gather: [0.9, 2.1],
  scatter: [3.5, 1.9],
  form: [3.4, 3.6],
  end: 7.4,
} as const;
/** How much further back than its place the camera starts. */
const DOLLY_FROM = 1.42;

const span = (t: number, [from, length]: readonly [number, number]) => Math.min(1, Math.max(0, (t - from) / length));
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

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

export class BoardView {
  layout!: BoardLayout;
  readonly light = new CandleLight();
  readonly wind = new Wind();
  /** How hard the wind is blowing over the board, 0..1: the sound of it follows this. */
  windLevel = 0;
  private readonly stage: Stage;
  private readonly sky: Sky;
  private readonly air: AirParticles;
  private readonly flame = new Flame();
  private readonly smoke = new Motes(160, false);
  private readonly embers = new Motes(80, true);
  private readonly boards = new Map<string, BoardParticles>();
  private board: BoardParticles | null = null;
  private title: Title | null = null;
  private readonly glow = new Float32Array(MAX_GLYPHS);
  private readonly litUntil = new Float64Array(MAX_GLYPHS);
  private hoverSlot = -1;
  private formStart = -1;
  private formSeconds = 1;
  private formed = 0;
  private range = 420;
  private time = 0;
  private emberDue = 0;
  private shudderUntil = 0;
  private box: DOMRect | null = null;
  private unitsScale = 0;
  private pos: Point = { x: 0, y: 0 };
  private angle = 0;
  private last: Point | null = null;
  /** The planchette moving through the air, in world space. */
  private readonly stirrer: Stirrer = { x: 0, y: 0, vx: 0, vy: 0 };
  private readonly breath: Air = { x: 0, y: 0, gust: 0 };
  /** The opening: how far into it we are, whether the sitters are hurrying it, and what to do once it's over. */
  private opening: { t: number; hurry: boolean; blown: boolean; done: () => void } | null = null;
  private skyShown = 1;
  private readonly units: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly planchette: HTMLElement;
  private readonly shade: HTMLElement;
  private readonly warm: SVGSVGElement;
  private readonly warmGradient: SVGLinearGradientElement;
  private readonly dwellRing: SVGCircleElement;

  constructor(
    canvas: HTMLCanvasElement,
    /** The board's box on the page: the particles line up with it, and the planchette is drawn in it. */
    readonly table: HTMLElement,
  ) {
    const roomy = innerWidth * innerHeight > 900_000;
    this.stage = new Stage(canvas);
    this.sky = new Sky(roomy ? 3600 : 2400);
    this.air = new AirParticles(roomy ? 1100 : 650, 420);
    this.stage.scene.add(this.sky.heavens, this.sky.nebula, this.air.points, this.flame.group, this.smoke.points, this.embers.points);
    this.air.points.renderOrder = 2;
    this.smoke.points.renderOrder = 4;
    this.embers.points.renderOrder = 7;

    this.units = document.createElement("div");
    this.units.id = "units";
    this.ring = document.createElement("div");
    this.ring.id = "center-ring";
    this.shade = document.createElement("div");
    this.shade.id = "planchette-shade";
    this.shade.innerHTML = shadeMarkup;
    this.planchette = document.createElement("div");
    this.planchette.id = "planchette";
    this.planchette.innerHTML = planchetteMarkup;
    this.units.append(this.ring, this.shade, this.planchette);
    table.append(this.units);
    this.warm = this.planchette.querySelector("svg.warm")!;
    this.warmGradient = this.planchette.querySelector("#pl-warm")!;
    this.dwellRing = this.planchette.querySelector(".dwell-ring")!;
  }

  /** Builds the board for a layout. Each layout's particles are made once and kept. */
  setLayout(layout: BoardLayout): void {
    this.layout = layout;
    this.table.style.aspectRatio = `${layout.width} / ${layout.height}`;
    Object.assign(this.units.style, { width: `${layout.width}px`, height: `${layout.height}px` });
    const center = layout.elements.find((el) => el.id === "CENTER")!;
    Object.assign(this.ring.style, {
      left: `${center.x - center.rx}px`,
      top: `${center.y - center.rx}px`,
      width: `${center.rx * 2}px`,
      height: `${center.rx * 2}px`,
    });
    this.fit(true);

    if (this.board) this.stage.scene.remove(this.board.points);
    let board = this.boards.get(layout.kind);
    if (!board) {
      board = buildBoard(layout, this.density());
      board.points.material.uniforms.uGlow.value = this.glow;
      this.boards.set(layout.kind, board);
    }
    this.board = board;
    this.stage.scene.add(board.points);
    this.sky.place(layout);
    this.flame.place(layout);
    const candle = candleGeometry(layout);
    this.light.base.copy(candle.light);
    this.light.height = candle.flame;
    this.range = layout.kind === "wide" ? 470 : 360;
    this.wind.setBounds(-200, -layout.height - 200, layout.width + 200, 200);
  }

  /** Throws away the particles and samples the glyphs again, e.g. once the board's font has arrived. */
  resample(): void {
    for (const board of this.boards.values()) board.points.geometry.dispose();
    this.boards.clear();
    if (this.board) this.stage.scene.remove(this.board.points);
    this.board = null;
    this.setLayout(this.layout);
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
   * The opening. Out of the dark the stars come out and the camera drifts in;
   * the planchette appears; SPIRIT BOARD gathers out of a whirl of dust, holds,
   * and is torn away by a gust that carries the board in after it, the candle
   * last. Resolves once it is over. With `calm`, everything is simply there.
   */
  open(calm: boolean): Promise<void> {
    if (calm) {
      this.skyShown = 1;
      this.showPlanchette();
      this.form(0.01);
      return Promise.resolve();
    }
    this.skyShown = 0;
    this.formed = 0;
    this.title = new Title(this.layout, this.density());
    this.stage.scene.add(this.title.points);
    return new Promise((done) => (this.opening = { t: 0, hurry: false, blown: false, done }));
  }

  /** The sitters are in a hurry: the opening plays out quickly. */
  hurry(): void {
    if (this.opening) this.opening.hurry = true;
  }

  /** The board gathers out of the dark over `seconds`. */
  form(seconds: number): void {
    this.formSeconds = seconds;
    this.formStart = performance.now();
    this.formed = 0;
  }

  get forming(): boolean {
    return this.formStart >= 0 || this.opening !== null;
  }

  /** Lines the scene and the planchette's layer up with the board's box, if the page has moved it. */
  fit(force = false): void {
    const box = this.table.getBoundingClientRect();
    const moved = force || !this.box || box.left !== this.box.left || box.top !== this.box.top || box.width !== this.box.width;
    if (moved) this.box = box;
    if (this.stage.fit(box, this.layout)) {
      // The dust fills whatever the camera can see.
      const { view } = this.stage;
      this.air.setBounds(view.x0 - 100, view.y0 - 100, view.x1 + 100, view.y1 + 100);
    }
    // While the camera stands back, the planchette's layer shrinks with the board, about the middle of the screen.
    const s = 1 / this.stage.dolly;
    if (!moved && s === this.unitsScale) return;
    this.unitsScale = s;
    const k = box.width / this.layout.width;
    const cx = innerWidth / 2 - box.left;
    const cy = innerHeight / 2 - box.top;
    this.units.style.transform = `translate(${(cx * (1 - s)).toFixed(2)}px, ${(cy * (1 - s)).toFixed(2)}px) scale(${k * s})`;
  }

  tick(now: number, dt: number): void {
    if (!this.board) return;
    this.time += dt;
    this.play(dt);
    this.fit();
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
    if (this.formStart >= 0) {
      this.formed = Math.min(1, (now - this.formStart) / (this.formSeconds * 1000));
      if (this.formed >= 1) this.formStart = -1;
    }

    shared.uTime.value = this.time;
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
    uniforms.uForm.value = this.formed;
    (uniforms.uHole.value as { set(x: number, y: number, z: number): void }).set(this.pos.x, -this.pos.y, 1);

    this.sky.update(this.time, this.skyShown);
    this.flame.update(light);
    this.stir(dt);
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
    this.lightPlanchette();
    const shake = Math.max(0, this.shudderUntil - now) / 750;
    this.stage.render(shake * 9 * Math.sin(now * 0.09), shake * 6 * Math.cos(now * 0.13));
  }

  /** Moves the opening on: the sky, the camera, the title and the board forming. */
  private play(dt: number): void {
    const opening = this.opening;
    if (!opening) return;
    const t = (opening.t += dt * (opening.hurry ? 6 : 1));
    this.skyShown = easeInOut(span(t, OPENING.sky));
    this.stage.dolly = 1 + (DOLLY_FROM - 1) * (1 - easeInOut(span(t, OPENING.dolly)));
    if (t >= OPENING.planchette) this.showPlanchette();
    this.title?.set(span(t, OPENING.gather), span(t, OPENING.scatter));
    if (this.formStart < 0) this.formed = span(t, OPENING.form);
    if (!opening.blown && t >= OPENING.scatter[0]) {
      // The gust that tears the title away and carries the board in.
      opening.blown = true;
      this.wind.blast(-150, -this.layout.height * 0.45, 2.4);
    }
    if (t < OPENING.end) return;
    this.stage.dolly = 1;
    this.skyShown = 1;
    if (this.title) {
      this.stage.scene.remove(this.title.points);
      this.title.dispose();
      this.title = null;
    }
    this.opening = null;
    opening.done();
  }

  /** Follows the planchette through the air, so it can stir the dust as it goes. */
  private stir(dt: number): void {
    const { pos, stirrer } = this;
    if (this.last && dt > 0) {
      const k = 1 - Math.exp(-dt / 0.08);
      stirrer.vx += ((pos.x - this.last.x) / dt - stirrer.vx) * k;
      stirrer.vy += (-(pos.y - this.last.y) / dt - stirrer.vy) * k;
    }
    this.last = { ...pos };
    stirrer.x = pos.x;
    stirrer.y = -pos.y;
  }

  /** The whole board shudders, as when it wakes for a new sitter. */
  shudder(): void {
    this.shudderUntil = performance.now() + 750;
  }

  /** While a spirit speaks the candle flares and the wind gets up. */
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
   * The side of the planchette facing the candle catches its light, and it
   * throws a soft shadow across the board, away from the flame.
   */
  private lightPlanchette(): void {
    const flame = this.light.position;
    const dx = flame.x - this.pos.x;
    const dy = -flame.y - this.pos.y;
    const range = shared.uLightRange.value * 1.1;
    const strength = Math.min(0.95, this.light.power / (1 + (dx * dx + dy * dy) / (range * range)));
    const warmth = Math.min(0.75, strength * 0.7);
    this.warm.style.opacity = warmth < 0.01 ? "0" : warmth.toFixed(3);
    const dark = Math.min(0.7, strength * 1.1);
    this.shade.style.opacity = dark < 0.01 ? "0" : dark.toFixed(3);
    if (strength < 0.01) return;
    const toward = (Math.atan2(dy, dx) * 180) / Math.PI - this.angle;
    this.warmGradient.setAttribute("gradientTransform", `rotate(${(toward + 180).toFixed(1)})`);
    const reach = PLANCHETTE_HEIGHT / (FLAME_HEIGHT - PLANCHETTE_HEIGHT);
    const s = this.layout.planchetteScale * (1 + reach);
    this.shade.style.transform = `translate(${(this.pos.x - dx * reach).toFixed(1)}px, ${(this.pos.y - dy * reach).toFixed(1)}px) rotate(${this.angle.toFixed(2)}deg) scale(${s.toFixed(3)})`;
  }

  drawPlanchette(pos: Point, angle: number): void {
    this.pos = pos;
    this.angle = angle;
    const s = this.layout.planchetteScale;
    this.planchette.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px) rotate(${angle.toFixed(2)}deg) scale(${s})`;
  }

  /** The planchette appears before anything else. */
  showPlanchette(): void {
    this.planchette.classList.add("here");
  }

  /** Progress of the ring around the window as the glass rests on a glyph, 0..1. */
  setDwell(progress: number): void {
    this.dwellRing.setAttribute("stroke-dasharray", `${progress.toFixed(3)} 1`);
    // An empty dash with round caps would still leave a dot.
    this.dwellRing.style.visibility = progress > 0.001 ? "visible" : "hidden";
  }

  /** The center ring calls the planchette home while something is spelled. */
  beckon(on: boolean): void {
    this.ring.classList.toggle("beckon", on);
  }

  hover(id: string | null): void {
    this.hoverSlot = id ? (this.board?.slots.get(id) ?? -1) : -1;
  }

  /** Lights a glyph from within for a moment. */
  flash(id: string, ms = 900): void {
    if (id === "CENTER") {
      this.ring.classList.remove("flash");
      void this.ring.offsetWidth;
      this.ring.classList.add("flash");
      return;
    }
    const slot = this.board?.slots.get(id);
    if (slot === undefined) return;
    this.glow[slot] = 1.3;
    this.litUntil[slot] = performance.now() + ms;
  }

  /** Lights the candle, which brings the breeze of a presence, or snuffs it with a curl of smoke. */
  setCandle(lit: boolean): void {
    if (!lit && this.light.lit && this.layout) {
      const candle = candleGeometry(this.layout);
      for (let i = 0; i < 46; i++) {
        this.smoke.emit({
          x: candle.x + (Math.random() - 0.5) * 6,
          y: -candle.wickTop + Math.random() * 10,
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

  toBoard(clientX: number, clientY: number): Point {
    const { box, k, s, cx, cy } = this.mapping();
    return { x: (cx + (clientX - box.left - cx) / s) / k, y: (cy + (clientY - box.top - cy) / s) / k };
  }

  toScreen(p: Point): Point {
    const { box, k, s, cx, cy } = this.mapping();
    return { x: box.left + cx + (p.x * k - cx) * s, y: box.top + cy + (p.y * k - cy) * s };
  }

  /** How board units map to the page: the box's scale, and the camera's dolly about the middle of the screen. */
  private mapping() {
    const box = this.box ?? this.table.getBoundingClientRect();
    return {
      box,
      k: box.width / this.layout.width,
      s: 1 / this.stage.dolly,
      cx: innerWidth / 2 - box.left,
      cy: innerHeight / 2 - box.top,
    };
  }
}
