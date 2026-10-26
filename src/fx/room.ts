// The room around the board: phase classes, the spirit's color, candles and hints.
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

/** Plain candlelight, before any spirit arrives. */
const CANDLE = "#ffb35c";

function toRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export class Room {
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

  setSpirit(spirit: PublicSpirit | null): void {
    const color = spirit?.color ?? CANDLE;
    this.el.style.setProperty("--spirit", color);
    this.el.style.setProperty("--spirit-rgb", toRgb(color));
  }

  /** Candles gutter out (or relight when false). */
  setGuttering(on: boolean): void {
    this.el.classList.toggle("guttering", on);
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
