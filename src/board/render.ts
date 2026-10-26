// Draws the board and the planchette as SVG, and owns every visual state that
// lives on the board itself (glows, the spirit's name, the dwell ring). The look
// is black card and silver: stippled night sky, silver lettering with a grain of
// glitter, a filigree frame and a black glass planchette.
//
// The planchette has an SVG of its own laid over the board's, so the board can
// stay still (and cached, candlelight and all) while the planchette moves.

import type { BoardElement, BoardLayout, Point } from "./layout";
import { paintBoard } from "./stipple";

const NS = "http://www.w3.org/2000/svg";
const LENS_R = 40;
const LENS_ZOOM = 1.6;
const FONT = "Kalnia, 'Playfair Display', Georgia, serif";
/** A shield of black glass, its window near the top and its point toward the sitters. */
const PLANCHETTE =
  "M 0 -70 C 52 -70 100 -62 107 -16 C 113 30 80 100 6 172 Q 0 178 -6 172 " +
  "C -80 100 -113 30 -107 -16 C -100 -62 -52 -70 0 -70 Z";

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const diamond = (x: number, y: number, w: number, h = w * 1.3) =>
  `M ${x} ${y - h} L ${x + w} ${y} L ${x} ${y + h} L ${x - w} ${y} Z`;

/** A frame line `inset` from the edge whose corners curve inward around a notch of radius r. */
function notchedRect(width: number, height: number, inset: number, corner: number, r: number): string {
  const a = Math.sqrt(r * r - (inset - corner) ** 2);
  const arc = (x: number, y: number) => `A ${r} ${r} 0 0 0 ${x.toFixed(1)} ${y.toFixed(1)}`;
  return [
    `M ${corner + a} ${inset} H ${width - corner - a}`,
    arc(width - inset, corner + a),
    `V ${height - corner - a}`,
    arc(width - corner - a, height - inset),
    `H ${corner + a}`,
    arc(inset, height - corner - a),
    `V ${corner + a}`,
    arc(corner + a, inset),
    "Z",
  ].join(" ");
}

/** Filigree for the top left corner; the other corners are mirror images. */
const CORNER = [
  "M 82 62 C 100 50 128 47 150 52 C 166 56 172 68 164 74 C 157 79 149 72 154 66",
  "M 62 82 C 50 100 47 128 52 150 C 56 166 68 172 74 164 C 79 157 72 149 66 154",
].join(" ");
const CORNER_DOTS = "M 89.4 44.2 A 66 66 0 0 1 44.2 89.4";
/** Filigree for the middle of the left side, centred on y = 0. */
const SIDE = [
  "M 58 -12 C 66 -28 66 -52 54 -64 C 47 -71 40 -64 44 -57",
  "M 58 12 C 66 28 66 52 54 64 C 47 71 40 64 44 57",
].join(" ");

/** Specks of light and shadow that give the silver its grain. Seeded, so it never changes. */
function glitter(pattern: SVGPatternElement, size: number): void {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 34; i++) {
    svg("circle", { cx: (rand() * size).toFixed(1), cy: (rand() * size).toFixed(1), r: (0.5 + rand() * 0.7).toFixed(2), fill: "#16161b", "fill-opacity": (0.18 + rand() * 0.24).toFixed(2) }, pattern);
  }
  for (let i = 0; i < 44; i++) {
    svg("circle", { cx: (rand() * size).toFixed(1), cy: (rand() * size).toFixed(1), r: (0.4 + rand() * 0.7).toFixed(2), fill: "#fff", "fill-opacity": (0.5 + rand() * 0.5).toFixed(2) }, pattern);
  }
}

export class BoardView {
  layout!: BoardLayout;
  private glyphs = new Map<string, SVGElement>();
  private glows = new Map<string, SVGElement>();
  private litTimers = new Map<string, number>();
  private hovered: string | null = null;
  private planchette!: SVGGElement;
  private lensClip!: SVGCircleElement;
  private lensZoom!: SVGGElement;
  private lensTop!: SVGGElement;
  private dwellRing!: SVGCircleElement;
  private nameplate!: SVGGElement;
  private nameText!: SVGTextElement;
  private surfaces = new Map<string, string>();
  private placed = "";

  constructor(
    readonly root: SVGSVGElement,
    private readonly hand: SVGSVGElement,
  ) {}

  /** Draws the board; `devicePixels` is how many screen pixels wide it will show, for the surface's detail. */
  render(layout: BoardLayout, devicePixels: number): void {
    this.layout = layout;
    this.glyphs.clear();
    this.glows.clear();
    this.hovered = null;
    const { width, height } = layout;
    for (const layer of [this.root, this.hand]) {
      layer.replaceChildren();
      layer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
    this.placed = "";

    // Paint the surface at about the screen's resolution, so the dots stay crisp.
    let surface = this.surfaces.get(layout.kind);
    if (!surface) {
      surface = paintBoard(layout, Math.min(1.6, Math.max(0.6, devicePixels / width)));
      this.surfaces.set(layout.kind, surface);
    }

    const defs = svg("defs", {}, this.root);
    defs.innerHTML = `
      <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fbfbfd"/><stop offset=".4" stop-color="#d4d4da"/><stop offset=".52" stop-color="#9c9ca6"/>
        <stop offset=".64" stop-color="#d9d9df"/><stop offset="1" stop-color="#f1f1f5"/>
      </linearGradient>
      <linearGradient id="silver-bright" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff"/><stop offset=".52" stop-color="#d8d8e0"/><stop offset="1" stop-color="#fff"/>
      </linearGradient>
      <linearGradient id="silver-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="${height}">
        <stop offset="0" stop-color="#e9e9ee"/><stop offset=".3" stop-color="#8f8f98"/><stop offset=".5" stop-color="#dcdce2"/>
        <stop offset=".7" stop-color="#8a8a93"/><stop offset="1" stop-color="#e4e4ea"/>
      </linearGradient>
      <pattern id="glitter" width="34" height="34" patternUnits="userSpaceOnUse"></pattern>
      <radialGradient id="glow"><stop class="glow-stop" offset="0" stop-opacity=".9"/><stop class="glow-stop" offset=".45" stop-opacity=".4"/><stop class="glow-stop" offset="1" stop-opacity="0"/></radialGradient>`;
    glitter(defs.querySelector("#glitter")!, 34);

    svg("image", { href: surface, x: 0, y: 0, width, height, preserveAspectRatio: "none" }, this.root);
    this.drawFrame();

    // Glows sit under the glyphs so a lit letter seems to shine from within the board.
    const glowLayer = svg("g", { class: "glyph-glows" }, this.root);
    const glyphLayer = svg("g", { class: "glyphs" }, this.root);
    for (const el of layout.elements) {
      const r = Math.max(el.rx, el.ry);
      this.glows.set(
        el.id,
        svg("ellipse", { class: "glyph-glow", cx: el.x, cy: el.y, rx: el.kind === "word" ? el.rx * 1.15 : r * 1.3, ry: el.kind === "word" ? el.ry * 1.25 : r * 1.3, fill: "url(#glow)" }, glowLayer),
      );
      this.glyphs.set(el.id, this.drawGlyph(el, glyphLayer));
    }

    // Where a spirit's name appears once it gives it, beneath the moon.
    const { nameplate } = layout;
    this.nameplate = svg("g", { class: "nameplate" }, this.root);
    this.nameText = svg("text", {
      x: nameplate.x, y: nameplate.y, "text-anchor": "middle", "dominant-baseline": "central",
      "font-family": FONT, "font-weight": 700, "font-size": nameplate.h * 0.7, "letter-spacing": 6, fill: "url(#silver)",
    }, this.nameplate);

    this.buildPlanchette();
  }

  private drawFrame(): void {
    const { width, height, kind } = this.layout;
    const frame = svg("g", { class: "frame", fill: "none", stroke: "url(#silver-line)", "stroke-linecap": "round" }, this.root);
    // The board's bevelled edge catching a little light.
    svg("rect", { x: 2, y: 2, width: width - 4, height: height - 4, rx: width * 0.024, ry: height * 0.032, stroke: "#fff", "stroke-opacity": 0.09, "stroke-width": 3 }, frame);
    svg("path", { d: notchedRect(width, height, 26, 26, 40), "stroke-width": 2.6 }, frame);
    svg("path", { d: notchedRect(width, height, 38, 26, 52), "stroke-width": 1.1, opacity: 0.75 }, frame);

    const scale = kind === "tall" ? 0.85 : 1;
    const corners: [number, number, number, number][] = [[0, 0, 1, 1], [width, 0, -1, 1], [0, height, 1, -1], [width, height, -1, -1]];
    for (const [x, y, sx, sy] of corners) {
      const g = svg("g", { transform: `translate(${x} ${y}) scale(${sx * scale} ${sy * scale})` }, frame);
      svg("path", { d: CORNER, "stroke-width": 2.2 }, g);
      svg("path", { d: CORNER_DOTS, "stroke-width": 3, "stroke-dasharray": "0 7.5" }, g);
      svg("path", { d: diamond(70, 70, 6), fill: "url(#silver-line)", stroke: "none" }, g);
    }
    for (const [x, sx] of [[0, 1], [width, -1]]) {
      const g = svg("g", { transform: `translate(${x} ${height / 2}) scale(${sx * scale} ${scale})` }, frame);
      svg("path", { d: SIDE, "stroke-width": 2.2 }, g);
      svg("path", { d: diamond(60, 0, 6), fill: "url(#silver-line)", stroke: "none" }, g);
    }
  }

  private drawGlyph(el: BoardElement, parent: Element): SVGElement {
    const g = svg("g", { class: `glyph ${el.kind}`, "data-id": el.id }, parent);
    if (el.id === "CENTER") {
      // Two dotted rings where the planchette rests, and is brought back to send.
      svg("circle", { cx: el.x, cy: el.y, r: el.rx * 0.9, class: "ring", fill: "none", "stroke-width": 2.8, "stroke-linecap": "round", "stroke-dasharray": "0 8.6" }, g);
      svg("circle", { cx: el.x, cy: el.y, r: el.rx * 0.68, class: "ring", fill: "none", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-dasharray": "0 6.4", opacity: 0.6 }, g);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        svg("path", { d: diamond(el.x + dx * el.rx * 1.12, el.y + dy * el.rx * 1.12, 3.4), class: "ring-mark" }, g);
      }
      return g;
    }
    const attrs: Attrs = {
      x: el.x, y: el.y, "text-anchor": "middle", "dominant-baseline": "central", "font-family": FONT, "font-weight": 700,
      "font-size": el.size,
    };
    if (el.rotate) attrs.transform = `rotate(${el.rotate.toFixed(2)} ${el.x.toFixed(1)} ${el.y.toFixed(1)})`;
    if (el.kind === "word") attrs["letter-spacing"] = 5;
    // Silver, then a grain of glitter over it.
    svg("text", { ...attrs, class: "metal" }, g).textContent = el.label;
    svg("text", { ...attrs, class: "grain" }, g).textContent = el.label;
    return g;
  }

  private buildPlanchette(): void {
    const s = this.layout.planchetteScale;
    const defs = svg("defs", {}, this.hand);
    defs.innerHTML = `
      <linearGradient id="glass-body" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2a2a31" stop-opacity=".86"/><stop offset=".55" stop-color="#0c0c0f" stop-opacity=".8"/>
        <stop offset="1" stop-color="#050506" stop-opacity=".88"/>
      </linearGradient>
      <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="glass" cx=".34" cy=".28" r=".85">
        <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".3" stop-color="#fff" stop-opacity=".05"/>
        <stop offset=".8" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
      </radialGradient>
      <clipPath id="lens-clip"><circle r="${LENS_R}"/></clipPath>
      <clipPath id="planchette-tip"><path d="${PLANCHETTE}" transform="translate(0 5) scale(0.9)"/></clipPath>`;
    this.lensClip = defs.querySelector("#lens-clip circle")!;

    this.planchette = svg("g", { class: "planchette" }, this.hand);
    svg("ellipse", { cx: 16, cy: 66, rx: 132, ry: 150, fill: "url(#shadow)" }, this.planchette);
    svg("path", { d: PLANCHETTE, class: "edge", fill: "url(#glass-body)", "stroke-width": 3.2 }, this.planchette);
    svg("path", { d: PLANCHETTE, class: "edge", transform: "translate(0 5) scale(0.9)", fill: "none", "stroke-width": 1.3, opacity: 0.8 }, this.planchette);
    // A sheen along the upper left of the glass.
    svg("path", { d: "M -92 -26 C -88 -54 -56 -62 -26 -63", fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.16 }, this.planchette);

    // Filigree: a ring of dots round the window, scrolls below it and a net toward the tip.
    const lace = svg("g", { class: "lace", fill: "none", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.9 }, this.planchette);
    svg("circle", { r: LENS_R + 11, "stroke-width": 2.8, "stroke-dasharray": "0 7.4" }, lace);
    svg("path", {
      d: [
        "M 0 60 L 0 116",
        "M 0 60 C 18 58 46 62 56 82 C 64 98 50 112 38 104 C 30 98 34 88 42 90",
        "M 0 60 C -18 58 -46 62 -56 82 C -64 98 -50 112 -38 104 C -30 98 -34 88 -42 90",
        "M 0 96 C 10 104 30 108 34 124 C 37 136 26 144 19 137 C 15 132 18 126 23 127",
        "M 0 96 C -10 104 -30 108 -34 124 C -37 136 -26 144 -19 137 C -15 132 -18 126 -23 127",
      ].join(" "),
    }, lace);
    const net = svg("g", { "clip-path": "url(#planchette-tip)", "stroke-width": 1.1, opacity: 0.75 }, lace);
    let lines = "";
    for (let i = -5; i <= 5; i++) lines += `M ${i * 11 - 40} 136 l 60 60 M ${i * 11 + 40} 136 l -60 60 `;
    svg("path", { d: lines }, net);
    svg("path", { d: diamond(0, 126, 5) + diamond(0, -58, 3.4), class: "lace-fill", stroke: "none" }, lace);

    // The window shows the board beneath, magnified, in the same light. It doesn't turn with the body.
    const { width, height } = this.layout;
    const lens = svg("g", { "clip-path": "url(#lens-clip)" }, this.hand);
    svg("rect", { x: 0, y: 0, width, height, fill: "#060607" }, lens);
    this.lensZoom = svg("g", {}, lens);
    for (const node of this.root.querySelectorAll(":scope > image, :scope > .frame, :scope > .glyphs")) {
      this.lensZoom.appendChild(node.cloneNode(true));
    }
    svg("rect", { x: 0, y: 0, width, height, class: "lens-shade" }, lens);
    svg("rect", { x: 0, y: 0, width, height, class: "lens-tint" }, lens);

    this.lensTop = svg("g", { class: "lens-top" }, this.hand);
    svg("circle", { r: LENS_R, fill: "url(#glass)" }, this.lensTop);
    svg("circle", { r: LENS_R + 1.5, fill: "none", stroke: "#f0f0f4", "stroke-width": 3 }, this.lensTop);
    svg("circle", { r: LENS_R + 5.5, class: "dwell-track", fill: "none", "stroke-width": 3 }, this.lensTop);
    this.dwellRing = svg("circle", {
      r: LENS_R + 5.5, class: "dwell-ring", fill: "none", "stroke-width": 3.6, "stroke-linecap": "round",
      pathLength: 1, "stroke-dasharray": "0 1", transform: "rotate(-90)",
    }, this.lensTop);
    this.lensTop.setAttribute("transform", `scale(${s})`);
  }

  drawPlanchette(pos: Point, angle: number): void {
    const s = this.layout.planchetteScale;
    const placed = `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) rotate(${angle.toFixed(2)}) scale(${s})`;
    // Nothing to redraw while it sits still.
    if (placed === this.placed) return;
    this.placed = placed;
    this.planchette.setAttribute("transform", placed);
    this.lensClip.setAttribute("cx", pos.x.toFixed(1));
    this.lensClip.setAttribute("cy", pos.y.toFixed(1));
    this.lensClip.setAttribute("r", String(LENS_R * s));
    this.lensZoom.setAttribute(
      "transform",
      `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) scale(${LENS_ZOOM}) translate(${(-pos.x).toFixed(1)} ${(-pos.y).toFixed(1)})`,
    );
    this.lensTop.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) scale(${s})`);
  }

  /** Progress of the dwell ring around the glass, 0..1. */
  setDwell(progress: number): void {
    this.dwellRing.setAttribute("stroke-dasharray", `${progress.toFixed(3)} 1`);
  }

  /** The center rings call the planchette home while something is spelled. */
  beckon(on: boolean): void {
    this.glyphs.get("CENTER")?.classList.toggle("beckon", on);
    this.glows.get("CENTER")?.classList.toggle("beckon", on);
  }

  hover(id: string | null): void {
    if (id === this.hovered) return;
    if (this.hovered) this.glyphs.get(this.hovered)?.classList.remove("hover");
    this.hovered = id;
    if (id) this.glyphs.get(id)?.classList.add("hover");
  }

  /** Lights a glyph from within for a moment. */
  flash(id: string, ms = 900): void {
    const glyph = this.glyphs.get(id);
    const glow = this.glows.get(id);
    if (!glyph || !glow) return;
    glyph.classList.add("lit");
    glow.classList.add("on");
    clearTimeout(this.litTimers.get(id));
    this.litTimers.set(
      id,
      window.setTimeout(() => {
        glyph.classList.remove("lit");
        glow.classList.remove("on");
      }, ms),
    );
  }

  engraveName(name: string | null): void {
    this.nameText.textContent = name ? name.toUpperCase() : "";
    this.nameplate.classList.toggle("engraved", Boolean(name));
  }

  toBoard(clientX: number, clientY: number): Point {
    const p = new DOMPoint(clientX, clientY).matrixTransform(this.root.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  toScreen(p: Point): Point {
    const s = new DOMPoint(p.x, p.y).matrixTransform(this.root.getScreenCTM()!);
    return { x: s.x, y: s.y };
  }
}
