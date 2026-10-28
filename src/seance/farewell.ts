// The farewell after GOODBYE, made to be the last shot of a video. The board's
// points become the spirit reaching out (see scene/board.ts); here the sitter
// reaching back is drawn solid, in porcelain like the planchette, with a few
// words beneath and a way to begin again.

import { figurePaths } from "../scene/figure";

/** The sitter, `h` pixels tall and facing left, lit from above on the side away from the spirit and cooled by its glow on the near side. */
function sitter(h: number): string {
  const paths = figurePaths(h, -1)
    .map((d) => `<path d="${d}"/>`)
    .join("");
  const f = (n: number) => (n * h).toFixed(1);
  return `
    <svg viewBox="0 0 ${h} ${h}" width="${h}" height="${h}" aria-hidden="true">
      <defs>
        <radialGradient id="sitter-porcelain" gradientUnits="userSpaceOnUse" cx="${f(0.56)}" cy="${f(0.2)}" r="${f(0.72)}">
          <stop offset="0" stop-color="#ffffff"/><stop offset="0.38" stop-color="#f1efeb"/>
          <stop offset="0.78" stop-color="#cbc8c2"/><stop offset="1" stop-color="#9c9993"/>
        </radialGradient>
        <linearGradient id="sitter-glow" gradientUnits="userSpaceOnUse" x1="${f(0.2)}" y1="0" x2="${f(0.62)}" y2="0">
          <stop offset="0" stop-color="#b9cbff" stop-opacity="0.75"/><stop offset="1" stop-color="#b9cbff" stop-opacity="0"/>
        </linearGradient>
        <!-- Darker toward the edges of the whole figure, the way light falls off round porcelain. -->
        <filter id="sitter-round" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="${(h * 0.014).toFixed(1)}" result="blur"/>
          <feComposite in="SourceAlpha" in2="blur" operator="arithmetic" k2="1" k3="-1" result="rim"/>
          <feFlood flood-color="#55524d" flood-opacity="0.6"/>
          <feComposite in2="rim" operator="in" result="shade"/>
          <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/></feMerge>
        </filter>
        <clipPath id="sitter-inside">${paths}</clipPath>
      </defs>
      <g fill="url(#sitter-porcelain)" filter="url(#sitter-round)">${paths}</g>
      <g clip-path="url(#sitter-inside)"><rect width="${h}" height="${h}" fill="url(#sitter-glow)"/></g>
    </svg>`;
}

export class Farewell {
  constructor(
    private readonly el: HTMLElement,
    onRestart: () => void,
  ) {
    el.querySelector("#restart")!.addEventListener("click", () => {
      if (!el.hidden) onRestart();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Shows the sitter standing where the view puts them: the middle of their feet and their height, in CSS pixels. */
  show(at: { x: number; y: number; height: number }): void {
    const h = Math.max(40, Math.round(at.height));
    const figure = this.el.querySelector<HTMLElement>(".sitter")!;
    figure.innerHTML = sitter(h);
    Object.assign(figure.style, { left: `${(at.x - h / 2).toFixed(1)}px`, top: `${(at.y - h).toFixed(1)}px`, width: `${h}px`, height: `${h}px` });
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
