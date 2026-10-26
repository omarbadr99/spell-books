// The room around the board: phase classes, the candles, their color and hints.
// The look itself lives in atmosphere.css.

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

/** Moonlight, before any spirit lights the candles. */
const MOONLIGHT = "#d6d8e2";

const toRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export class Room {
  private snuffTimer = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly table: HTMLElement,
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

  /** The candle color, which lights the room, the glows and the spirit's words. */
  setSpirit(spirit: PublicSpirit | null): void {
    const rgb = toRgb(spirit?.color ?? MOONLIGHT);
    const light = rgb.map((c) => Math.round(c + (255 - c) * 0.4));
    this.el.style.setProperty("--spirit-rgb", rgb.join(", "));
    this.el.style.setProperty("--spirit-light", `rgb(${light.join(", ")})`);
  }

  /** Lights the four candles one after another, or snuffs them out with a wisp of smoke. */
  setCandles(lit: boolean): void {
    if (this.el.classList.contains("candles-lit") === lit) return;
    this.el.classList.toggle("candles-lit", lit);
    clearTimeout(this.snuffTimer);
    this.el.classList.toggle("snuffing", !lit);
    if (!lit) this.snuffTimer = window.setTimeout(() => this.el.classList.remove("snuffing"), 2600);
  }

  shudder(): void {
    this.table.classList.remove("shudder");
    void this.table.offsetWidth;
    this.table.classList.add("shudder");
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
