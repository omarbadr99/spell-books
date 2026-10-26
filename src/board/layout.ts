// Where everything sits on the board, in board units. Pure data so it can be
// tested and shared by the renderer, the dwell detector and the spirits.

import { DIGITS } from "../../shared/text";

export type LayoutKind = "wide" | "tall";
export type ElementKind = "letter" | "digit" | "word" | "action";

export interface Point {
  x: number;
  y: number;
}

export interface BoardElement {
  /** "A".."Z", "0".."9", "YES", "NO", "GOODBYE", or "CENTER" (where the planchette rests). */
  id: string;
  kind: ElementKind;
  label: string;
  x: number;
  y: number;
  /** Hit ellipse radii. */
  rx: number;
  ry: number;
  /** Tilt in degrees, so letters lean along their arc. */
  rotate: number;
  size: number;
}

export interface BoardLayout {
  kind: LayoutKind;
  width: number;
  height: number;
  elements: BoardElement[];
  /** Where the planchette sleeps: the CENTER glyph, where resting sends what was spelled. */
  rest: Point;
  /** The dotted moon at the head of the board. */
  moon: Point & { r: number };
  /** Where a spirit's name appears once it gives it. */
  nameplate: Point & { w: number; h: number };
  planchetteScale: number;
}

interface ArcSpec {
  letters: string;
  /** Circle the arc sits on. */
  cx: number;
  cy: number;
  r: number;
  /** Half the angle the arc spans, in degrees from vertical. */
  spread: number;
  size: number;
}

function arc(spec: ArcSpec): BoardElement[] {
  const n = spec.letters.length;
  const step = (2 * spec.spread) / (n - 1);
  const spacing = spec.r * ((step * Math.PI) / 180);
  const hit = spacing * 0.47;
  return [...spec.letters].map((letter, i) => {
    const deg = -spec.spread + step * i;
    const rad = (deg * Math.PI) / 180;
    return {
      id: letter,
      kind: "letter",
      label: letter,
      x: spec.cx + spec.r * Math.sin(rad),
      y: spec.cy - spec.r * Math.cos(rad),
      rx: hit,
      ry: hit,
      rotate: deg,
      size: spec.size,
    };
  });
}

function digitRow(y: number, from: number, to: number, size: number): BoardElement[] {
  const step = (to - from) / (DIGITS.length - 1);
  return [...DIGITS].map((digit, i) => ({
    id: digit,
    kind: "digit",
    label: digit,
    x: from + step * i,
    y,
    rx: step * 0.47,
    ry: step * 0.47,
    rotate: 0,
    size,
  }));
}

function word(id: string, label: string, kind: ElementKind, x: number, y: number, rx: number, ry: number, size: number): BoardElement {
  return { id, kind, label, x, y, rx, ry, rotate: 0, size };
}

/** Arc geometry: a circle through the arc's top point whose ends sit `drop` lower at ±halfWidth. */
function arcThrough(top: Point, halfWidth: number, drop: number): Pick<ArcSpec, "cx" | "cy" | "r" | "spread"> {
  const half = 2 * Math.atan(drop / halfWidth);
  const r = halfWidth / Math.sin(half);
  return { cx: top.x, cy: top.y + r, r, spread: (half * 180) / Math.PI };
}

function wideLayout(): BoardLayout {
  const width = 1600;
  const height = 1100;
  const elements = [
    word("YES", "YES", "word", 300, 175, 125, 68, 66),
    word("NO", "NO", "word", 1300, 175, 105, 68, 66),
    ...arc({ letters: "ABCDEFGHIJKLM", ...arcThrough({ x: 800, y: 420 }, 610, 200), size: 78 }),
    ...arc({ letters: "NOPQRSTUVWXYZ", ...arcThrough({ x: 800, y: 590 }, 560, 190), size: 78 }),
    ...digitRow(900, 350, 1250, 56),
    word("GOODBYE", "GOOD BYE", "word", 800, 1010, 175, 60, 56),
    word("CENTER", "", "action", 800, 742, 80, 80, 0),
  ];
  return {
    kind: "wide",
    width,
    height,
    elements,
    rest: { x: 800, y: 742 },
    moon: { x: 800, y: 188, r: 74 },
    nameplate: { x: 800, y: 318, w: 380, h: 48 },
    planchetteScale: 1,
  };
}

function tallLayout(): BoardLayout {
  const width = 1000;
  const height = 1200;
  const elements = [
    word("YES", "YES", "word", 222, 128, 112, 62, 60),
    word("NO", "NO", "word", 790, 128, 100, 62, 60),
    ...arc({ letters: "ABCDEFGHI", ...arcThrough({ x: 500, y: 380 }, 420, 140), size: 74 }),
    ...arc({ letters: "JKLMNOPQR", ...arcThrough({ x: 500, y: 520 }, 370, 130), size: 74 }),
    ...arc({ letters: "STUVWXYZ", ...arcThrough({ x: 500, y: 655 }, 330, 110), size: 74 }),
    ...digitRow(990, 95, 905, 50),
    word("GOODBYE", "GOOD BYE", "word", 500, 1118, 155, 56, 50),
    word("CENTER", "", "action", 500, 846, 74, 74, 0),
  ];
  return {
    kind: "tall",
    width,
    height,
    elements,
    rest: { x: 500, y: 846 },
    moon: { x: 500, y: 132, r: 64 },
    nameplate: { x: 500, y: 236, w: 300, h: 44 },
    planchetteScale: 0.9,
  };
}

const cache = new Map<LayoutKind, BoardLayout>();

export function buildLayout(kind: LayoutKind): BoardLayout {
  let layout = cache.get(kind);
  if (!layout) {
    layout = kind === "wide" ? wideLayout() : tallLayout();
    cache.set(kind, layout);
  }
  return layout;
}

/** Portrait screens get the three-arc board so letters stay finger-sized. */
export function chooseLayoutKind(viewportWidth: number, viewportHeight: number): LayoutKind {
  return viewportWidth / viewportHeight < 0.9 ? "tall" : "wide";
}

/** How wide the board is drawn, in CSS pixels: as big as fits, leaving room for the lines above and below it. */
export function boardWidthFor(layout: BoardLayout, viewportWidth: number, viewportHeight: number): number {
  const tall = layout.kind === "tall";
  // Phones held sideways get a compact version of the lines around the board.
  const chrome = viewportHeight < 520 ? 118 : tall ? 236 : 206;
  const sides = tall ? 32 : 230;
  const width = Math.min(viewportWidth - sides, (viewportHeight - chrome) * (layout.width / layout.height), tall ? 640 : 1160);
  return Math.max(240, Math.floor(width));
}

/** The element under a point, or null. Overlapping ellipses go to the closest centre. */
export function hitTest(layout: BoardLayout, x: number, y: number): BoardElement | null {
  let best: BoardElement | null = null;
  let bestDistance = 1;
  for (const el of layout.elements) {
    const d = Math.hypot((x - el.x) / el.rx, (y - el.y) / el.ry);
    if (d <= bestDistance) {
      best = el;
      bestDistance = d;
    }
  }
  return best;
}

export function elementById(layout: BoardLayout, id: string): BoardElement | undefined {
  return layout.elements.find((el) => el.id === id);
}
