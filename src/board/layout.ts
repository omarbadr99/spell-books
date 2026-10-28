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
  /** Where the planchette waits before the séance, off to one side of the letters. */
  waiting: Point;
  /** Where START is written before the séance (over the center), and how far from it the glass still counts as on it. */
  start: Point & { rx: number; ry: number; size: number };
  /** The candle: the middle of its base, and its height. It may stand just off the board, in the margin. */
  candle: Point & { h: number };
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
  const width = 1800;
  const height = 1000;
  const elements = [
    word("YES", "YES", "word", 340, 140, 150, 70, 100),
    word("NO", "NO", "word", 1460, 140, 120, 70, 100),
    ...arc({ letters: "ABCDEFGHIJKLM", ...arcThrough({ x: 900, y: 300 }, 720, 130), size: 124 }),
    ...arc({ letters: "NOPQRSTUVWXYZ", ...arcThrough({ x: 900, y: 500 }, 680, 120), size: 118 }),
    ...digitRow(830, 470, 1330, 100),
    word("GOODBYE", "GOODBYE", "word", 900, 940, 190, 54, 82),
    word("CENTER", "", "action", 900, 700, 78, 78, 0),
  ];
  return {
    kind: "wide",
    width,
    height,
    elements,
    rest: { x: 900, y: 700 },
    waiting: { x: 1620, y: 870 },
    start: { x: 900, y: 700, rx: 250, ry: 80, size: 132 },
    candle: { x: 96, y: 975, h: 280 },
    planchetteScale: 1,
  };
}

function tallLayout(): BoardLayout {
  const width = 1000;
  const height = 1500;
  const elements = [
    word("YES", "YES", "word", 215, 120, 110, 62, 88),
    word("NO", "NO", "word", 785, 120, 95, 62, 88),
    ...arc({ letters: "ABCDEFGHI", ...arcThrough({ x: 500, y: 330 }, 420, 95), size: 112 }),
    ...arc({ letters: "JKLMNOPQR", ...arcThrough({ x: 500, y: 490 }, 400, 90), size: 112 }),
    ...arc({ letters: "STUVWXYZ", ...arcThrough({ x: 500, y: 650 }, 370, 80), size: 112 }),
    ...digitRow(1060, 90, 910, 92),
    word("GOODBYE", "GOODBYE", "word", 500, 1190, 170, 54, 76),
    word("CENTER", "", "action", 500, 880, 74, 74, 0),
  ];
  return {
    kind: "tall",
    width,
    height,
    elements,
    rest: { x: 500, y: 880 },
    waiting: { x: 820, y: 1350 },
    start: { x: 500, y: 880, rx: 210, ry: 72, size: 112 },
    candle: { x: 105, y: 1460, h: 200 },
    planchetteScale: 0.85,
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
  const chrome = viewportHeight < 520 ? 118 : tall ? 236 : 176;
  const sides = 32;
  const width = Math.min(viewportWidth - sides, (viewportHeight - chrome) * (layout.width / layout.height), tall ? 640 : 1700);
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
