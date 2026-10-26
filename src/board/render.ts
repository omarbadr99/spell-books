// Draws the board and the planchette as SVG, and owns every visual state that
// lives on the board itself (glows, sigil, nameplate, dwell ring).

import type { PublicSpirit } from "../../shared/presence";
import type { BoardElement, BoardLayout, Point } from "./layout";
import { paintWood } from "./wood";

const NS = "http://www.w3.org/2000/svg";
const LENS_R = 40;
const LENS_ZOOM = 1.6;
const PLANCHETTE =
  "M 0 -122 C 34 -100 98 -42 104 22 C 108 66 84 104 46 108 C 26 110 10 100 0 88 " +
  "C -10 100 -26 110 -46 108 C -84 104 -108 66 -104 22 C -98 -42 -34 -100 0 -122 Z";
const FONT = "'Cinzel Decorative', 'Cinzel', Georgia, serif";

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const star = (x: number, y: number, r: number) =>
  `M ${x} ${y - r} L ${x + r * 0.22} ${y - r * 0.22} L ${x + r} ${y} L ${x + r * 0.22} ${y + r * 0.22} ` +
  `L ${x} ${y + r} L ${x - r * 0.22} ${y + r * 0.22} L ${x - r} ${y} L ${x - r * 0.22} ${y - r * 0.22} Z`;

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
  private sigil!: SVGGElement;
  private sigilPaths: SVGPathElement[] = [];
  private nameplate!: SVGGElement;
  private nameText!: SVGTextElement;
  private wood = new Map<string, string>();

  constructor(readonly root: SVGSVGElement) {}

  render(layout: BoardLayout): void {
    this.layout = layout;
    this.glyphs.clear();
    this.glows.clear();
    this.hovered = null;
    const { width, height } = layout;
    this.root.replaceChildren();
    this.root.setAttribute("viewBox", `0 0 ${width} ${height}`);

    let woodUrl = this.wood.get(layout.kind);
    if (!woodUrl) {
      woodUrl = paintWood(width, height);
      this.wood.set(layout.kind, woodUrl);
    }

    const defs = svg("defs", {}, this.root);
    defs.innerHTML = `
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f7e6ad"/><stop offset=".5" stop-color="#d4ab52"/><stop offset="1" stop-color="#8d6624"/>
      </linearGradient>
      <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e8c977"/><stop offset=".55" stop-color="#b48a3a"/><stop offset="1" stop-color="#7a5a22"/>
      </linearGradient>
      <linearGradient id="bone" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f6ecd2"/><stop offset=".55" stop-color="#dcc79e"/><stop offset="1" stop-color="#a88b5a"/>
      </linearGradient>
      <radialGradient id="glow"><stop class="glow-stop" offset="0" stop-opacity=".95"/><stop class="glow-stop" offset=".45" stop-opacity=".45"/><stop class="glow-stop" offset="1" stop-opacity="0"/></radialGradient>
      <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="glass" cx=".36" cy=".3" r=".85">
        <stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".32" stop-color="#fff" stop-opacity=".06"/>
        <stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
      </radialGradient>
      <filter id="engrave" x="-15%" y="-15%" width="130%" height="140%">
        <feDropShadow dx="0" dy="2.6" stdDeviation="1.3" flood-color="#000" flood-opacity=".8" result="cut"/>
        <feDropShadow in="cut" dx="0" dy="-1" stdDeviation=".35" flood-color="#ffeec0" flood-opacity=".22"/>
      </filter>
      <filter id="blur-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
      <clipPath id="lens-clip"><circle r="${LENS_R}"/></clipPath>`;
    this.lensClip = defs.querySelector("#lens-clip circle")!;

    // Wood, border and ornaments.
    svg("image", { href: woodUrl, x: 0, y: 0, width, height, preserveAspectRatio: "none" }, this.root);
    const ornament = svg("g", { class: "ornament", fill: "none", stroke: "url(#gold)" }, this.root);
    svg("rect", { x: 22, y: 22, width: width - 44, height: height - 44, rx: 30, "stroke-width": 3, opacity: 0.55 }, ornament);
    svg("rect", { x: 36, y: 36, width: width - 72, height: height - 72, rx: 22, "stroke-width": 1.2, opacity: 0.4 }, ornament);
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx > 0 ? 36 : width - 36;
      const y = sy > 0 ? 36 : height - 36;
      svg("path", {
        d: `M ${x + sx * 86} ${y + sy * 10} Q ${x + sx * 10} ${y + sy * 10} ${x + sx * 10} ${y + sy * 86}
            M ${x + sx * 30} ${y + sy * 54} Q ${x + sx * 30} ${y + sy * 30} ${x + sx * 54} ${y + sy * 30}`,
        "stroke-width": 2.4,
        opacity: 0.6,
      }, ornament);
    }

    const engraved = svg("g", { filter: "url(#engrave)" }, this.root);
    this.drawSun(engraved);
    this.drawMoon(engraved);
    const { sigil, nameplate } = layout;
    svg("circle", { cx: sigil.x, cy: sigil.y, r: sigil.r * 1.04, fill: "none", stroke: "url(#gold)", "stroke-width": 2, opacity: 0.55 }, engraved);
    svg("circle", { cx: sigil.x, cy: sigil.y, r: sigil.r * 0.9, fill: "none", stroke: "url(#gold)", "stroke-width": 1, opacity: 0.35 }, engraved);
    for (const dx of [-1, 1]) {
      svg("path", { d: star(sigil.x + dx * sigil.r * 1.7, sigil.y, 14), fill: "url(#gold)", opacity: 0.7 }, engraved);
      svg("path", { d: star(sigil.x + dx * sigil.r * 2.35, sigil.y + 6, 8), fill: "url(#gold)", opacity: 0.5 }, engraved);
    }

    // Glows sit under the glyphs so a lit letter seems to shine from inside the wood.
    const glowLayer = svg("g", { class: "glyph-glows" }, this.root);
    const glyphLayer = svg("g", { class: "glyphs" }, engraved);
    for (const el of layout.elements) {
      const r = Math.max(el.rx, el.ry);
      this.glows.set(
        el.id,
        svg("ellipse", { class: "glyph-glow", cx: el.x, cy: el.y, rx: el.kind === "word" ? el.rx * 1.15 : r * 1.25, ry: el.kind === "word" ? el.ry * 1.25 : r * 1.25, fill: "url(#glow)" }, glowLayer),
      );
      this.glyphs.set(el.id, this.drawGlyph(el, glyphLayer));
    }
    this.root.insertBefore(glowLayer, engraved);

    // Sigil and nameplate, empty until a spirit arrives.
    this.sigil = svg("g", { class: "sigil", transform: `translate(${sigil.x} ${sigil.y}) scale(${sigil.r / 52})` }, this.root);
    this.sigilPaths = [
      svg("path", { class: "sigil-ember", filter: "url(#blur-soft)", pathLength: 1 }, this.sigil),
      svg("path", { class: "sigil-path", pathLength: 1 }, this.sigil),
    ];
    this.nameplate = svg("g", { class: "nameplate" }, this.root);
    svg("rect", {
      x: nameplate.x - nameplate.w / 2, y: nameplate.y - nameplate.h / 2, width: nameplate.w, height: nameplate.h,
      rx: 8, fill: "url(#brass)", stroke: "#4a3412", "stroke-width": 2,
    }, this.nameplate);
    for (const dx of [-1, 1]) {
      svg("circle", { cx: nameplate.x + dx * (nameplate.w / 2 - 14), cy: nameplate.y, r: 4, fill: "#5a4318" }, this.nameplate);
    }
    this.nameText = svg("text", {
      x: nameplate.x, y: nameplate.y + 1, "text-anchor": "middle", "dominant-baseline": "central",
      "font-family": FONT, "font-weight": 700, "font-size": nameplate.h * 0.52, fill: "#3a280c", "letter-spacing": 2,
    }, this.nameplate);

    this.buildPlanchette();
  }

  private drawGlyph(el: BoardElement, parent: Element): SVGElement {
    const g = svg("g", { class: `glyph ${el.kind}`, "data-id": el.id }, parent);
    const text = (label: string, x: number, y: number, size: number, extra: Attrs = {}) =>
      svg("text", {
        x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-family": FONT, "font-weight": 700,
        "font-size": size, ...extra,
      }, g).appendChild(document.createTextNode(label));

    if (el.id === "UNSAY") {
      const s = el.size * 0.32;
      svg("path", {
        d: `M ${el.x - s} ${el.y - s - 8} L ${el.x + s} ${el.y + s - 8} M ${el.x + s} ${el.y - s - 8} L ${el.x - s} ${el.y + s - 8}`,
        class: "stroke", "stroke-width": 7, "stroke-linecap": "round", fill: "none",
      }, g);
      text("UNSAY", el.x, el.y + el.size * 0.62, el.size * 0.36, { "letter-spacing": 3 });
    } else if (el.id === "ASK") {
      text("?", el.x, el.y - 8, el.size);
      text("ASK", el.x, el.y + el.size * 0.58, el.size * 0.34, { "letter-spacing": 3 });
    } else {
      const extra: Attrs = el.rotate ? { transform: `rotate(${el.rotate.toFixed(2)} ${el.x.toFixed(1)} ${el.y.toFixed(1)})` } : {};
      if (el.kind === "word") extra["letter-spacing"] = 4;
      text(el.label, el.x, el.y, el.size, extra);
    }
    return g;
  }

  private drawSun(parent: Element): void {
    const { x, y, r } = this.layout.sun;
    const g = svg("g", { class: "sun" }, parent);
    let rays = "";
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const outer = i % 2 ? r * 0.88 : r * 1.05;
      const p = (rr: number, da: number) => `${x + rr * Math.cos(a + da)} ${y + rr * Math.sin(a + da)}`;
      rays += `M ${p(r * 0.6, -0.13)} L ${p(outer, 0)} L ${p(r * 0.6, 0.13)} Z `;
    }
    svg("path", { d: rays, fill: "url(#gold)" }, g);
    svg("circle", { cx: x, cy: y, r: r * 0.58, fill: "url(#gold)" }, g);
    svg("path", {
      d: `M ${x - r * 0.3} ${y - r * 0.1} q ${r * 0.1} ${-r * 0.08} ${r * 0.2} 0 M ${x + r * 0.1} ${y - r * 0.1} q ${r * 0.1} ${-r * 0.08} ${r * 0.2} 0
          M ${x - r * 0.24} ${y + r * 0.16} q ${r * 0.24} ${r * 0.2} ${r * 0.48} 0`,
      fill: "none", stroke: "#4a2f10", "stroke-width": 3, "stroke-linecap": "round",
    }, g);
  }

  private drawMoon(parent: Element): void {
    const { x, y, r } = this.layout.moon;
    const g = svg("g", { class: "moon" }, parent);
    const m = r * 0.72;
    svg("path", { d: `M ${x} ${y - m} A ${m} ${m} 0 0 0 ${x} ${y + m} A ${m * 1.3} ${m * 1.3} 0 0 1 ${x} ${y - m} Z`, fill: "url(#gold)" }, g);
    svg("path", {
      d: `M ${x - m * 0.72} ${y - m * 0.2} q ${m * 0.12} ${m * 0.1} ${m * 0.22} 0`,
      fill: "none", stroke: "#4a2f10", "stroke-width": 3, "stroke-linecap": "round",
    }, g);
    svg("path", { d: star(x + r * 0.55, y - r * 0.55, r * 0.2) + star(x + r * 0.75, y + r * 0.35, r * 0.13), fill: "url(#gold)" }, g);
  }

  private buildPlanchette(): void {
    const s = this.layout.planchetteScale;
    this.planchette = svg("g", { class: "planchette" }, this.root);
    svg("ellipse", { cx: 14, cy: 24, rx: 122, ry: 134, fill: "url(#shadow)" }, this.planchette);
    svg("path", { d: PLANCHETTE, fill: "url(#bone)", stroke: "#3b2814", "stroke-width": 3 }, this.planchette);
    svg("path", { d: PLANCHETTE, transform: "scale(0.84) translate(0 -4)", fill: "none", stroke: "#b08a3e", "stroke-width": 2.4, opacity: 0.85 }, this.planchette);
    svg("path", { d: star(0, -78, 11), fill: "#8a6a2c" }, this.planchette);
    svg("circle", { cx: 0, cy: 0, r: LENS_R + 10, fill: "#2a1b0e", opacity: 0.35 }, this.planchette);

    // The lens shows the board beneath, magnified. It doesn't rotate with the body.
    const lens = svg("g", { "clip-path": "url(#lens-clip)" }, this.root);
    svg("rect", { x: 0, y: 0, width: this.layout.width, height: this.layout.height, fill: "#1a0e07" }, lens);
    this.lensZoom = svg("g", {}, lens);
    for (const node of this.root.querySelectorAll(":scope > image, :scope > g[filter]")) {
      this.lensZoom.appendChild(node.cloneNode(true));
    }
    this.lensZoom.querySelectorAll("[filter]").forEach((n) => n.removeAttribute("filter"));

    this.lensTop = svg("g", { class: "lens-top" }, this.root);
    svg("circle", { r: LENS_R, fill: "url(#glass)" }, this.lensTop);
    svg("circle", { r: LENS_R + 3, fill: "none", stroke: "url(#brass)", "stroke-width": 7 }, this.lensTop);
    svg("circle", { r: LENS_R + 13, class: "dwell-track", fill: "none", "stroke-width": 5 }, this.lensTop);
    this.dwellRing = svg("circle", {
      r: LENS_R + 13, class: "dwell-ring", fill: "none", "stroke-width": 6, "stroke-linecap": "round",
      pathLength: 1, "stroke-dasharray": "0 1", transform: "rotate(-90)",
    }, this.lensTop);
    this.lensTop.setAttribute("transform", `scale(${s})`);
  }

  drawPlanchette(pos: Point, angle: number): void {
    const s = this.layout.planchetteScale;
    this.planchette.setAttribute("transform", `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) rotate(${angle.toFixed(2)}) scale(${s})`);
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

  setFlicker(on: boolean): void {
    this.planchette.classList.toggle("flicker", on);
    this.lensTop.classList.toggle("flicker", on);
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

  /** Draws the spirit's sigil into the board ("burn"), leaves it as a scorch, or clears it. */
  setSigil(spirit: PublicSpirit | null, mode: "burn" | "scorch" | "fade"): void {
    if (spirit) for (const p of this.sigilPaths) p.setAttribute("d", spirit.sigil);
    this.sigil.classList.remove("burning", "scorched", "fading");
    void this.sigil.getBoundingClientRect();
    this.sigil.classList.add(mode === "burn" ? "burning" : mode === "scorch" ? "scorched" : "fading");
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
