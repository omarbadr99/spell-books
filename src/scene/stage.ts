// The WebGL renderer and the camera. The camera looks straight at the board's
// plane (z = 0) from just the right distance for one board unit there to match
// the board's box on the page, so the particles line up with everything the page
// draws over them. World space is board space with y pointing up: (x, -y, z).

import { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { BoardLayout } from "../board/layout";

const FOV = 35;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 1, 20000);
  /** Device pixels per world unit at a distance of one unit, for sizing points. */
  focal = 1;
  /** How far the camera stands from the board's plane. */
  distance = 1;
  /** Device pixels per board unit on the board's plane. */
  pixels = 1;
  /** How much further back than its place the camera stands: 1 at rest, more before the board appears. */
  dolly = 1;
  /**
   * Where the eye has drifted to, in board units. The lens shifts to match, so
   * the board's plane stays exactly where it is while everything nearer or
   * farther slides past it: parallax.
   */
  readonly eye = { x: 0, y: 0 };
  /** What the camera sees of the board's plane from its place, in world space. */
  view = { x0: 0, y0: -1100, x1: 1600, y1: 0 };
  private center = { x: 0, y: 0 };
  private fitted = "";
  /** A share of the screen's resolution to draw at: lowered on devices that can't keep up. */
  private detail = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 1);
  }

  /** Lines the board's plane up with its box on the page. Returns false if nothing changed. */
  fit(box: DOMRect, layout: BoardLayout): boolean {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.max(0.75, Math.min(2, window.devicePixelRatio || 1) * this.detail);
    const key = [box.left, box.top, box.width, w, h, dpr, layout.width].map((n) => Math.round(n * 4)).join();
    if (key === this.fitted) return false;
    this.fitted = key;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const scale = box.width / layout.width;
    const tan = Math.tan((FOV * Math.PI) / 360);
    const distance = h / scale / (2 * tan);
    const cx = (w / 2 - box.left) / scale;
    const cy = (h / 2 - box.top) / scale;
    this.camera.aspect = w / h;
    this.camera.near = distance * 0.05;
    this.camera.far = distance * 1.6 + 9000;
    this.center = { x: cx, y: -cy };
    this.camera.position.set(cx, -cy, distance);
    this.camera.lookAt(cx, -cy, 0);
    this.camera.updateProjectionMatrix();
    this.focal = (h * dpr) / (2 * tan);
    this.distance = distance;
    this.pixels = scale * dpr;
    const halfH = distance * tan;
    const halfW = halfH * this.camera.aspect;
    this.view = { x0: cx - halfW, y0: -cy - halfH, x1: cx + halfW, y1: -cy + halfH };
    return true;
  }

  /**
   * Draws at a lower resolution from now on, for a device that is struggling.
   * Returns false once there is nothing left to give.
   */
  lighten(): boolean {
    if (Math.min(2, window.devicePixelRatio || 1) * this.detail <= 0.75) return false;
    this.detail *= 0.8;
    this.fitted = "";
    return true;
  }

  /** Draws a frame, the camera nudged by (dx, dy) board units for a shudder. */
  render(dx = 0, dy = 0): void {
    const z = this.distance * this.dolly;
    this.camera.position.set(this.center.x + dx + this.eye.x, this.center.y + dy + this.eye.y, z);
    this.camera.updateProjectionMatrix();
    // Shift the lens against the eye's drift, so the board's plane doesn't move.
    const m = this.camera.projectionMatrix.elements;
    m[8] = (-m[0] * this.eye.x) / z;
    m[9] = (-m[5] * this.eye.y) / z;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.render(this.scene, this.camera);
  }
}
