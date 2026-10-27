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
  private fitted = "";

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 1);
  }

  /** Lines the board's plane up with its box on the page. Returns false if nothing changed. */
  fit(box: DOMRect, layout: BoardLayout): boolean {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
    this.camera.far = distance + 9000;
    this.camera.position.set(cx, -cy, distance);
    this.camera.lookAt(cx, -cy, 0);
    this.camera.updateProjectionMatrix();
    this.focal = (h * dpr) / (2 * tan);
    this.distance = distance;
    this.pixels = scale * dpr;
    return true;
  }

  /** Draws a frame, the camera nudged by (dx, dy) board units for a shudder. */
  render(dx = 0, dy = 0): void {
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.renderer.render(this.scene, this.camera);
    this.camera.position.x -= dx;
    this.camera.position.y -= dy;
  }
}
