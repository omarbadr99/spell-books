// The board as the sitters see it: a Three.js scene of particles (the letters,
// numbers, words and candle, the sky and the breeze), with the planchette and
// the center ring laid over it as soft gradients. It owns everything about the
// picture: which glyph glows, the candle's light, how far the board has formed.

import { buildBoard, candleGeometry, MAX_GLYPHS, type BoardParticles } from "../scene/board";
import { Flame } from "../scene/flame";
import { CandleLight } from "../scene/light";
import { Motes } from "../scene/motes";
import { Sky } from "../scene/sky";
import { Stage } from "../scene/stage";
import { shared } from "../scene/uniforms";
import type { BoardLayout, Point } from "./layout";

/** The planchette's window, in board units. */
const HOLE = 34;
/** A porcelain planchette, its point at the top and two lobes at the bottom; the window is at 0,0. */
const SHAPE =
  "M 0 -150 C 30 -110 98 -40 100 18 C 102 62 70 92 40 92 C 18 92 6 82 0 72 " +
  "C -6 82 -18 92 -40 92 C -70 92 -102 62 -100 18 C -98 -40 -30 -110 0 -150 Z";
const BOX = 'viewBox="-140 -175 280 300" width="280" height="300"';

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

export class BoardView {
  layout!: BoardLayout;
  readonly light = new CandleLight();
  private readonly stage: Stage;
  private readonly sky: Sky;
  private readonly flame = new Flame();
  private readonly smoke = new Motes(160, false);
  private readonly embers = new Motes(60, true);
  private readonly boards = new Map<string, BoardParticles>();
  private board: BoardParticles | null = null;
  private readonly glow = new Float32Array(MAX_GLYPHS);
  private readonly litUntil = new Float64Array(MAX_GLYPHS);
  private hoverSlot = -1;
  private formStart = -1;
  private formSeconds = 1;
  private formed = 0;
  private time = 0;
  private emberDue = 0;
  private shudderUntil = 0;
  private box: DOMRect | null = null;
  private pos: Point = { x: 0, y: 0 };
  private angle = 0;
  private readonly units: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly planchette: HTMLElement;
  private readonly warm: SVGSVGElement;
  private readonly warmGradient: SVGLinearGradientElement;
  private readonly dwellRing: SVGCircleElement;

  constructor(
    canvas: HTMLCanvasElement,
    /** The board's box on the page: the particles line up with it, and the planchette is drawn in it. */
    readonly table: HTMLElement,
  ) {
    this.stage = new Stage(canvas);
    this.sky = new Sky(innerWidth * innerHeight > 900_000 ? 3600 : 2400);
    this.stage.scene.add(this.sky.heavens, this.sky.nebula.points, this.sky.breeze.points, this.flame.group, this.smoke.points, this.embers.points);
    this.smoke.points.renderOrder = 4;
    this.embers.points.renderOrder = 7;

    this.units = document.createElement("div");
    this.units.id = "units";
    this.ring = document.createElement("div");
    this.ring.id = "center-ring";
    this.planchette = document.createElement("div");
    this.planchette.id = "planchette";
    this.planchette.innerHTML = planchetteMarkup;
    this.units.append(this.ring, this.planchette);
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
    this.light.position.copy(candleGeometry(layout).light);
    shared.uLightRange.value = layout.kind === "wide" ? 470 : 360;
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

  /** The board gathers out of the dark over `seconds`. */
  form(seconds: number): void {
    this.formSeconds = seconds;
    this.formStart = performance.now();
    this.formed = 0;
  }

  get forming(): boolean {
    return this.formStart >= 0;
  }

  /** Lines the scene up with the board's box, if the page has moved it. */
  fit(force = false): void {
    const box = this.table.getBoundingClientRect();
    if (!force && this.box && box.left === this.box.left && box.top === this.box.top && box.width === this.box.width) {
      this.stage.fit(box, this.layout);
      return;
    }
    this.box = box;
    this.units.style.transform = `scale(${box.width / this.layout.width})`;
    this.stage.fit(box, this.layout);
  }

  tick(now: number, dt: number): void {
    if (!this.board) return;
    this.time += dt;
    this.fit();
    this.light.update(dt);

    for (let i = 0; i < MAX_GLYPHS; i++) {
      const target = (i === this.hoverSlot ? 0.35 : 0) + (now < this.litUntil[i] ? 0.55 : 0);
      const tau = this.glow[i] > target ? 0.45 : 0.08;
      this.glow[i] += (target - this.glow[i]) * (1 - Math.exp(-dt / tau));
    }
    if (this.formStart >= 0) {
      this.formed = Math.min(1, (now - this.formStart) / (this.formSeconds * 1000));
      if (this.formed >= 1) this.formStart = -1;
    }

    const { light } = this;
    const candle = candleGeometry(this.layout);
    shared.uTime.value = this.time;
    shared.uFocal.value = this.stage.focal;
    shared.uDistance.value = this.stage.distance;
    shared.uDot.value = Math.min(1.6, Math.max(1, this.stage.pixels * 1.1));
    shared.uLightPos.value.copy(light.position).setX(light.position.x + light.lean * candle.flame * 0.35);
    shared.uLightColor.value.copy(light.color);
    shared.uLightPower.value = light.power;
    const uniforms = this.board.points.material.uniforms;
    uniforms.uForm.value = this.formed;
    uniforms.uBreeze.value = light.breeze;
    (uniforms.uHole.value as { set(x: number, y: number, z: number): void }).set(this.pos.x, -this.pos.y, 1);

    this.sky.update(this.time, light.breeze);
    this.flame.update(light);
    // Embers rise from the flame while it burns and drift off on the breeze.
    if (light.level > 0.6 && this.time > this.emberDue) {
      this.emberDue = this.time + 0.15 + Math.random() * 0.5;
      this.embers.emit({
        x: candle.x + (Math.random() - 0.5) * 8,
        y: -candle.wickTop + candle.flame * (0.6 + Math.random() * 0.3),
        vx: (Math.random() - 0.5) * 20,
        vy: 50 + Math.random() * 80,
        life: 1.2 + Math.random() * 1.4,
        size: 3 + Math.random() * 3,
        color: [light.color.r * 1.4, light.color.g * 1.3, light.color.b * 1.2],
        alpha: 0.9,
      });
    }
    this.smoke.update(dt, 30 * light.breeze + 6);
    this.embers.update(dt, 60 * light.breeze);
    this.lightPlanchette(candle.light);
    const shake = Math.max(0, this.shudderUntil - now) / 750;
    this.stage.render(shake * 9 * Math.sin(now * 0.09), shake * 6 * Math.cos(now * 0.13));
  }

  /** The whole board shudders, as when it wakes for a new sitter. */
  shudder(): void {
    this.shudderUntil = performance.now() + 750;
  }

  /** The side of the planchette facing the candle catches its light. */
  private lightPlanchette(flame: { x: number; y: number }): void {
    const dx = flame.x - this.pos.x;
    const dy = -flame.y - this.pos.y;
    const range = shared.uLightRange.value * 1.1;
    const strength = Math.min(0.95, this.light.power / (1 + (dx * dx + dy * dy) / (range * range)));
    this.warm.style.opacity = strength < 0.01 ? "0" : strength.toFixed(3);
    if (strength < 0.01) return;
    const toward = (Math.atan2(dy, dx) * 180) / Math.PI - this.angle;
    this.warmGradient.setAttribute("gradientTransform", `rotate(${(toward + 180).toFixed(1)})`);
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

  /** Lights the candle (with its breeze), or snuffs it with a curl of smoke. */
  setCandle(lit: boolean): void {
    if (!lit && this.light.lit && this.layout) {
      const candle = candleGeometry(this.layout);
      for (let i = 0; i < 46; i++) {
        this.smoke.emit({
          x: candle.x + (Math.random() - 0.5) * 6,
          y: -candle.wickTop + Math.random() * 10,
          vx: (Math.random() - 0.5) * 12,
          vy: 35 + Math.random() * 45,
          life: 2 + Math.random() * 1.8,
          age: -Math.random() * 0.9,
          size: 12 + Math.random() * 12,
          grow: 2.6,
          color: [0.6, 0.6, 0.64],
          alpha: 0.32,
        });
      }
    }
    this.light.set(lit);
  }

  setLightColor(hex: string): void {
    this.light.setColor(hex);
    for (const stop of this.planchette.querySelectorAll(".pl-warm-stop")) stop.setAttribute("stop-color", hex);
  }

  toBoard(clientX: number, clientY: number): Point {
    const box = this.box ?? this.table.getBoundingClientRect();
    const k = box.width / this.layout.width;
    return { x: (clientX - box.left) / k, y: (clientY - box.top) / k };
  }

  toScreen(p: Point): Point {
    const box = this.box ?? this.table.getBoundingClientRect();
    const k = box.width / this.layout.width;
    return { x: box.left + p.x * k, y: box.top + p.y * k };
  }
}
