// The room around the board: phase classes, the candle and its color, and hints.
// The candle itself is drawn by the scene; this tells it what to do.

import type { PublicSpirit } from "../../shared/presence";
import type { LayoutKind } from "../board/layout";

export type Phase =
  | "booting"
  | "locked"
  | "unlocking"
  | "dormant"
  | "summoning"
  | "listening"
  | "asking"
  | "answering"
  | "ending"
  | "ended";

/** What the room asks of the scene. */
export interface Scenery {
  setCandle(lit: boolean): void;
  setLightColor(hex: string): void;
  shudder(): void;
}

/** Moonlight, before any spirit lights the candle. */
const MOONLIGHT = "#d6d8e2";
/** Plain candlelight, if the candle is ever lit with no spirit. */
const CANDLE = "#ef8e34";

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export class Room {
  constructor(
    private readonly el: HTMLElement,
    private readonly scenery: Scenery,
    private readonly hintEl: HTMLElement,
  ) {}

  setPhase(phase: Phase): void {
    for (const c of [...this.el.classList]) if (c.startsWith("phase-")) this.el.classList.remove(c);
    this.el.classList.add(`phase-${phase}`);
    this.el.dataset.phase = phase;
  }

  setLayout(kind: LayoutKind): void {
    this.el.classList.toggle("layout-tall", kind === "tall");
    this.el.classList.toggle("layout-wide", kind === "wide");
  }

  /** The candle's color, which lights the board, the breeze and the spirit's words. */
  setSpirit(spirit: PublicSpirit | null): void {
    const rgb = toRgb(spirit?.color ?? MOONLIGHT);
    const light = rgb.map((c) => Math.round(c + (255 - c) * 0.4));
    this.el.style.setProperty("--spirit-rgb", rgb.join(", "));
    this.el.style.setProperty("--spirit-light", `rgb(${light.join(", ")})`);
    this.scenery.setLightColor(spirit?.color ?? CANDLE);
  }

  /** Lights the candle, bringing the breeze of a presence, or snuffs it out. */
  setCandles(lit: boolean): void {
    this.el.classList.toggle("candles-lit", lit);
    this.scenery.setCandle(lit);
  }

  shudder(): void {
    this.scenery.shudder();
  }

  hint(text: string): void {
    if (this.hintEl.dataset.text === text) return;
    this.hintEl.dataset.text = text;
    this.hintEl.classList.add("changing");
    window.setTimeout(() => {
      if (this.hintEl.dataset.text !== text) return;
      this.hintEl.textContent = text;
      this.hintEl.classList.remove("changing");
    }, 260);
  }
}
