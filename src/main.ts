import "@fontsource/cinzel/700.css";
import "./styles.css";

import {
  boardWidthFor,
  buildLayout,
  chooseLayoutKind,
  elementById,
  hitTest,
  type BoardLayout,
  type LayoutKind,
  type Point,
} from "./board/layout";
import * as api from "./api";
import { BoardView } from "./board/render";
import { SoundScape } from "./fx/audio";
import { Room } from "./fx/room";
import { DwellDetector } from "./planchette/dwell";
import { Planchette } from "./planchette/planchette";
import { Possessor } from "./planchette/possess";
import { EndCard } from "./seance/endcard";
import { InkLine, SpiritLine, Voice } from "./seance/lines";
import { Seance } from "./seance/machine";
import { Ticker } from "./ticker";

/** How long the glass rests on a glyph to choose it, once the fingers have stopped. A pause is enough. */
const DWELL_MS = 130;
/** How long it rests on START to begin. */
const START_DWELL_MS = 380;
/** The board's own lettering, which the particles are sampled from. */
const BOARD_FONT = "700 80px Cinzel";

// In development only: ?speed=4 runs the spirits faster, for the tests, and ?steady keeps the
// picture at full resolution however slowly frames come, for screenshots.
const params = new URLSearchParams(location.search);
const speed = import.meta.env.DEV ? Math.max(1, Number(params.get("speed")) || 1) : 1;
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const roomEl = $<HTMLElement>("#room");
const table = $<HTMLElement>("#table");
/** START can also be tapped, or reached from the keyboard: this button lies over it. */
const playEl = $<HTMLButtonElement>("#play");
/** Until the planchette is brought to START the glyphs float in the dark, and the séance waits. */
let intro = true;
/** How long the glass has rested on START, in milliseconds. */
let onStartFor = 0;
let booted: Promise<void> = Promise.resolve();

let view: BoardView;
try {
  view = new BoardView($<HTMLCanvasElement>("#scene"), table);
} catch (error) {
  $("#hint").textContent = "This board is drawn with WebGL, which this browser has turned off.";
  throw error;
}

if (import.meta.env.DEV && params.has("steady")) view.adaptive = false;

const ticker = new Ticker();
const planchette = new Planchette(view);
const possessor = new Possessor(planchette, view, ticker, speed);
const sound = new SoundScape();
const room = new Room(roomEl, view, $("#hint"));
const voice = new Voice($("#voice"), $("#voice-label"));

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
  voice,
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
  sizeBoard();
  view.setLayout(layout);
  planchette.place(
    first || (intro && !planchette.held)
      ? layout.waiting
      : { x: (planchette.pos.x / previous.width) * layout.width, y: (planchette.pos.y / previous.height) * layout.height },
  );
  seance.restoreBoard();
  placePlay();
  if (!first && !intro) view.form(calm ? 0.01 : 1.6);
}

/** Lays the START button over the word on the board. */
function placePlay(): void {
  const box = table.getBoundingClientRect();
  const k = box.width / layout.width;
  const { x, y, rx, ry } = layout.start;
  Object.assign(playEl.style, {
    left: `${(box.left + (x - rx) * k).toFixed(1)}px`,
    top: `${(box.top + (y - ry) * k).toFixed(1)}px`,
    width: `${(2 * rx * k).toFixed(1)}px`,
    height: `${(2 * ry * k).toFixed(1)}px`,
  });
}

/** How far the glass is from START, in START's own radii: 1 or less is on it. */
function fromStart(p: Point): number {
  const s = layout.start;
  return Math.hypot((p.x - s.x) / s.rx, (p.y - s.y) / s.ry);
}

/** Before the séance: START stirs as the glass comes near, and resting the glass on it begins. */
function awaitStart(now: number, dt: number): void {
  // Once the planchette is there, the hint says what to do with it.
  if (view.planchetteHere) room.prompt("Bring the planchette to START.");
  const d = fromStart(planchette.pos);
  view.nearStart(Math.min(1, Math.max(0, (2.2 - d) / 1.6)));
  onStartFor = planchette.held && d <= 1 && planchette.settled(now) ? onStartFor + dt * 1000 : 0;
  view.setDwell(Math.min(1, onStartFor / START_DWELL_MS));
  if (onStartFor >= START_DWELL_MS) void begin();
}

/**
 * The planchette has come to START (or START was tapped): the glyphs come down
 * into the board and the séance begins. The sound comes up, and the preview
 * asks to use Claude.
 */
async function begin(): Promise<void> {
  if (!intro) return;
  intro = false;
  onStartFor = 0;
  view.setDwell(0);
  view.nearStart(1);
  playEl.hidden = true;
  sound.unlock();
  sound.awaken();
  void api.prepare();
  const opened = view.open(calm);
  // Begun without it, the planchette drifts to the middle of the board by itself.
  if (!planchette.held && fromStart(planchette.pos) > 1) {
    planchette.driven = true;
    await possessor.home();
    planchette.driven = false;
  }
  await opened;
  roomEl.classList.remove("intro");
  room.prompt(null);
  await booted;
}

// Fingers on the planchette, which may hang a little over the board's edge.
addEventListener("pointerdown", (e) => {
  if (!e.isPrimary || (e.target as Element).closest("#endcard, #mute, #voice")) return;
  const p = view.toBoard(e.clientX, e.clientY);
  // A touch anywhere else hurries the board along as it comes down.
  if (!view.planchetteHere || !planchette.canGrab(p)) return view.hurry();
  e.preventDefault();
  sound.unlock();
  if (planchette.driven || !(intro || seance.sittersHaveIt)) return;
  planchette.grab(p);
  table.setPointerCapture(e.pointerId);
});
table.addEventListener("pointermove", (e) => {
  if (planchette.held) planchette.dragTo(view.toBoard(e.clientX, e.clientY));
});
// The eye drifts a little toward the hand, so the depths slide past the board.
addEventListener("pointermove", (e) => view.look(e.clientX, e.clientY));
const letGo = () => {
  if (!planchette.held) return;
  // Letting go with the window on the center sends too, however briefly it was there; on START, it begins.
  const aim = planchette.aim;
  const center = hitTest(layout, aim.x, aim.y);
  planchette.release();
  dwell.release();
  view.setDwell(0);
  if (intro) {
    if (fromStart(aim) <= 1) void begin();
  } else if (center?.id === "CENTER" && !planchette.driven) seance.onSelect(center);
};
table.addEventListener("pointerup", letGo);
table.addEventListener("pointercancel", letGo);
// Tapping the message rubs out its last letter.
$("#voice").addEventListener("click", () => seance.unsay());

// iOS only starts audio from certain gestures, so try on each of them.
for (const type of ["pointerdown", "touchend", "click"]) document.addEventListener(type, () => sound.unlock());

ticker.add((now, dt) => {
  planchette.tick(dt);
  sound.scrape(planchette.speed);
  sound.wind(view.windLevel);
  if (intro) {
    awaitStart(now, dt);
  } else if (planchette.held && !planchette.driven && seance.sittersHaveIt && !view.forming) {
    const state = dwell.update(now, planchette.pos.x, planchette.pos.y, planchette.settled(now));
    view.hover(state.hoverId);
    view.setDwell(state.progress);
    const selected = state.selected && elementById(layout, state.selected);
    if (selected) seance.onSelect(selected);
  } else {
    view.hover(null);
  }
});
ticker.onDraw((now, dt) => view.tick(now, dt));

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const kind = chooseLayoutKind(innerWidth, innerHeight);
    if (kind !== layout.kind) applyLayout(kind);
    else {
      sizeBoard();
      placePlay();
    }
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
  // Hooks for the Playwright suite, which also gets every phase the séance passes through.
  const visited: string[] = [];
  const setPhase = room.setPhase.bind(room);
  room.setPhase = (phase) => {
    visited.push(phase);
    setPhase(phase);
  };
  Object.assign(window, {
    __board: {
      phase: () => seance.phase,
      visited: () => visited.length,
      since: (from: number) => visited.slice(from),
      spirit: () => seance.spirit?.id ?? null,
      lens: () => view.toScreen(planchette.pos),
      glyph: (id: string) => {
        const el = elementById(layout, id);
        return el ? view.toScreen(el) : null;
      },
      lastTarget: () => possessor.lastTarget,
      spiritLine: () => $("#spirit-line").textContent,
      ink: () => seance.inkText,
      speaker: () => `${$("#voice").getAttribute("data-speaker")}:${$("#voice-label").textContent}`,
      forming: () => view.forming,
      start: () => (intro ? view.toScreen(layout.start) : null),
      // The scene itself, for measuring what each layer costs.
      view,
    },
  });
}

async function start(): Promise<void> {
  // The particles are sampled from the board's lettering, so wait (a little) for it.
  const fontReady = await Promise.race([
    document.fonts.load(BOARD_FONT).then((faces) => faces.length > 0, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  applyLayout(layout.kind, true);
  if (calm) view.settle();
  showMute();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("preload")));
  ticker.start();

  if (!fontReady) {
    // If the lettering turns up late, sample it again and let the board re-form.
    const late = () => {
      if (!document.fonts.check(BOARD_FONT)) return;
      document.fonts.removeEventListener("loadingdone", late);
      view.resample();
      if (!view.forming) view.form(calm ? 0.01 : 1.4);
    };
    document.fonts.addEventListener("loadingdone", late);
  }
  // Meanwhile, find out whether this device already knows the word. Its hints wait until the séance begins.
  room.prompt("");
  booted = seance.boot();
  // The glyphs gather out of the dust and float in the dark until the planchette is brought to START.
  playEl.addEventListener("click", () => void begin());
}

void start();
