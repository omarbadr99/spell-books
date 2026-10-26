import "@fontsource/kalnia/700.css";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "./styles.css";
import "./fx/atmosphere.css";

import {
  boardWidthFor,
  buildLayout,
  chooseLayoutKind,
  elementById,
  hitTest,
  type BoardLayout,
  type LayoutKind,
} from "./board/layout";
import { BoardView } from "./board/render";
import { SoundScape } from "./fx/audio";
import { Room } from "./fx/room";
import { DwellDetector } from "./planchette/dwell";
import { Planchette } from "./planchette/planchette";
import { Possessor } from "./planchette/possess";
import { EndCard } from "./seance/endcard";
import { InkLine, SpiritLine } from "./seance/lines";
import { Seance } from "./seance/machine";
import { Ticker } from "./ticker";

/** How long the glass rests on a glyph to choose it, once the fingers have stopped. A pause is enough. */
const DWELL_MS = 130;

// ?speed=4 runs the spirits faster; only honoured in development, for the tests.
const speed = import.meta.env.DEV ? Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 1) : 1;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const roomEl = $<HTMLElement>("#room");
const boardEl = $<SVGSVGElement>("#board");

const ticker = new Ticker();
const view = new BoardView(boardEl, $<SVGSVGElement>("#hand"));
const planchette = new Planchette(view);
const possessor = new Possessor(planchette, view, ticker, speed);
const sound = new SoundScape();
const room = new Room(roomEl, $("#table"), $("#hint"));

let layout: BoardLayout = buildLayout(chooseLayoutKind(innerWidth, innerHeight));
// The center needs no wait: stopping the glass there sends what was spelled.
const dwell = new DwellDetector((x, y) => hitTest(layout, x, y)?.id ?? null, {
  dwellMs: DWELL_MS,
  dwellFor: (id) => (id === "CENTER" ? 0 : DWELL_MS),
  maxSpeed: 260,
});

const seance: Seance = new Seance({
  room,
  view,
  planchette,
  possessor,
  dwell,
  ink: new InkLine($("#ink-line")),
  spiritLine: new SpiritLine($("#spirit-line")),
  endCard: new EndCard($("#endcard"), () => seance.dismissEndCard()),
  sound,
  sleep: (ms) => possessor.wait(ms),
});

function sizeBoard(): void {
  roomEl.style.setProperty("--board-w", `${boardWidthFor(layout, innerWidth, innerHeight)}px`);
}

function applyLayout(kind: LayoutKind, first = false): void {
  const previous = layout;
  layout = buildLayout(kind);
  room.setLayout(kind);
  view.render(layout, boardWidthFor(layout, innerWidth, innerHeight) * (window.devicePixelRatio || 1));
  sizeBoard();
  planchette.place(
    first
      ? layout.rest
      : { x: (planchette.pos.x / previous.width) * layout.width, y: (planchette.pos.y / previous.height) * layout.height },
  );
  seance.restoreBoard();
}

// Fingers on the planchette.
boardEl.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary) return;
  const p = view.toBoard(e.clientX, e.clientY);
  if (!planchette.canGrab(p)) return;
  e.preventDefault();
  sound.unlock();
  if (!seance.sittersHaveIt || planchette.driven) return;
  planchette.grab(p);
  boardEl.setPointerCapture(e.pointerId);
});
boardEl.addEventListener("pointermove", (e) => {
  if (planchette.held) planchette.dragTo(view.toBoard(e.clientX, e.clientY));
});
const letGo = () => {
  if (!planchette.held) return;
  // Letting go with the glass on the center sends too, however briefly it was there.
  const aim = planchette.aim;
  const center = hitTest(layout, aim.x, aim.y);
  planchette.release();
  dwell.release();
  view.setDwell(0);
  if (center?.id === "CENTER" && !planchette.driven) seance.onSelect(center);
};
boardEl.addEventListener("pointerup", letGo);
boardEl.addEventListener("pointercancel", letGo);
// Tapping the paper slip rubs out the last letter.
$("#slip").addEventListener("click", () => seance.unsay());

// iOS only starts audio from certain gestures, so try on each of them.
for (const type of ["pointerdown", "touchend", "click"]) document.addEventListener(type, () => sound.unlock());

ticker.add((now, dt) => {
  planchette.tick(dt);
  sound.scrape(planchette.speed);
  if (planchette.held && !planchette.driven && seance.sittersHaveIt) {
    const state = dwell.update(now, planchette.pos.x, planchette.pos.y, planchette.settled(now));
    view.hover(state.hoverId);
    view.setDwell(state.progress);
    const selected = state.selected && elementById(layout, state.selected);
    if (selected) seance.onSelect(selected);
  } else {
    view.hover(null);
  }
});

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const kind = chooseLayoutKind(innerWidth, innerHeight);
    if (kind !== layout.kind) applyLayout(kind);
    else sizeBoard();
  }, 150);
});

const mute = $<HTMLButtonElement>("#mute");
const showMute = () => {
  mute.setAttribute("aria-pressed", String(sound.muted));
  mute.setAttribute("aria-label", sound.muted ? "Unmute sound" : "Mute sound");
  mute.classList.toggle("off", sound.muted);
};
mute.addEventListener("click", () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  showMute();
});

if (import.meta.env.DEV) {
  // Hooks for the Playwright suite.
  Object.assign(window, {
    __board: {
      phase: () => seance.phase,
      spirit: () => seance.spirit?.id ?? null,
      lens: () => view.toScreen(planchette.pos),
      glyph: (id: string) => {
        const el = elementById(layout, id);
        return el ? view.toScreen(el) : null;
      },
      lastTarget: () => possessor.lastTarget,
      spiritLine: () => $("#spirit-line").textContent,
      ink: () => seance.inkText,
    },
  });
}

async function start(): Promise<void> {
  await Promise.race([
    document.fonts.load("700 40px Kalnia").catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  applyLayout(layout.kind, true);
  showMute();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("preload")));
  ticker.start();
  await seance.boot();
}

void start();
