// Draws shapes into masks for the sampler: the board's lettering, and a candle.

import type { Mask } from "./sampling";

/** A mask and where its middle is, in mask pixels. */
export interface Drawn extends Mask {
  cx: number;
  cy: number;
}

function maskOf(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Mask {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: canvas.width, height: canvas.height };
}

/**
 * Draws a label into a mask, its capitals centred on the middle. `family` is a
 * CSS font family list and `spacing` extra room between letters, in pixels.
 */
export function textMask(label: string, px: number, family: string, spacing = 0, weight = 700): Drawn {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const setFont = () => (ctx.font = `${weight} ${px}px ${family}`);
  setFont();
  const chars = [...label];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const textWidth = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const cap = ctx.measureText("H").actualBoundingBoxAscent || px * 0.7;
  const pad = Math.ceil(px * 0.4);
  canvas.width = Math.ceil(textWidth + pad * 2);
  canvas.height = Math.ceil(px * 1.7);
  setFont();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  const baseline = canvas.height / 2 + cap / 2;
  let x = pad;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    x += widths[i] + spacing;
  });
  return { ...maskOf(canvas, ctx), cx: pad + textWidth / 2, cy: canvas.height / 2 };
}

/**
 * A pillar candle seen from the front, a little from above: a melted top, drips
 * down its face and a wick. `w` and `h` are its width and height in pixels; the
 * middle of its base sits at (cx, cy).
 */
export function candleMask(w: number, h: number, rand: () => number): Drawn {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const pad = Math.ceil(w * 0.4);
  canvas.width = Math.ceil(w + pad * 2);
  canvas.height = Math.ceil(h * 1.25);
  const cx = canvas.width / 2;
  const base = canvas.height - pad * 0.5;
  const top = base - h;
  const rim = w * 0.13;
  const left = cx - w / 2;
  const right = cx + w / 2;

  // The face, shaded like a cylinder: bright where it turns toward us, fading
  // toward its far edge, with a little light caught along the near one.
  const face = ctx.createLinearGradient(left, 0, right, 0);
  face.addColorStop(0, "rgba(255, 255, 255, 0.8)");
  face.addColorStop(0.14, "rgba(255, 255, 255, 0.7)");
  face.addColorStop(0.55, "rgba(255, 255, 255, 0.58)");
  face.addColorStop(0.88, "rgba(255, 255, 255, 0.5)");
  face.addColorStop(1, "rgba(255, 255, 255, 0.78)");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.moveTo(left, top + rim * 0.4);
  ctx.lineTo(left, base - rim);
  ctx.ellipse(cx, base - rim, w / 2, rim, 0, Math.PI, 0, true);
  ctx.lineTo(right, top + rim * 0.4);
  ctx.closePath();
  ctx.fill();

  // Drips down the face, each set apart by a dark seam so the points trace it.
  // The outer ones spill over the edges and break the candle's outline.
  ctx.lineCap = "round";
  const drips = [0.02 + rand() * 0.06, 0.25 + rand() * 0.15, 0.5 + rand() * 0.12, 0.72 + rand() * 0.12, 0.92 + rand() * 0.06];
  for (const at of drips) {
    const x = left + w * at;
    const len = h * (0.12 + 0.4 * rand());
    const thick = w * (0.08 + 0.06 * rand());
    const y0 = top + rim * (0.6 + rand() * 0.6);
    const bulge = at < 0.1 ? -thick * 0.35 : at > 0.9 ? thick * 0.35 : 0;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + bulge, y0 + len * 0.5, x + bulge * 0.6, y0 + len);
    };
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = thick + w * 0.05;
    path();
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = thick;
    path();
    ctx.stroke();
    // A bead of wax at the end of the drip.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + bulge * 0.6, y0 + len, thick * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  // The top: a melted hollow, darker than the bright lip around it.
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, top + rim * 0.4, w / 2 + 1, rim + 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.beginPath();
  ctx.ellipse(cx, top + rim * 0.45, w / 2 - w * 0.07, rim * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = w * 0.05;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const sag = Math.sin(a) > 0 ? Math.sin(a * 3 + 1) * rim * 0.18 : 0;
    const x = cx + Math.cos(a) * (w / 2 - w * 0.025);
    const y = top + rim * 0.4 + Math.sin(a) * (rim - w * 0.02) + sag;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // The wick.
  ctx.lineWidth = Math.max(1.5, w * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx, top + rim * 0.4);
  ctx.quadraticCurveTo(cx + w * 0.02, top - h * 0.05, cx - w * 0.01, top - h * 0.09);
  ctx.stroke();

  return { ...maskOf(canvas, ctx), cx, cy: base };
}
