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
} from "./board/layout";
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
/** The board's own lettering, which the particles are sampled from. */
const BOARD_FONT = "700 80px Cinzel";

// ?speed=4 runs the spirits faster; only honoured in development, for the tests.
const speed = import.meta.env.DEV ? Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 1) : 1;
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const roomEl = $<HTMLElement>("#room");
const table = $<HTMLElement>("#table");

let view: BoardView;
try {
  view = new BoardView($<HTMLCanvasElement>("#scene"), table);
} catch (error) {
  $("#hint").textContent = "This board is drawn with WebGL, which this browser has turned off.";
  throw error;
}

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
    first
      ? layout.rest
      : { x: (planchette.pos.x / previous.width) * layout.width, y: (planchette.pos.y / previous.height) * layout.height },
  );
  seance.restoreBoard();
  if (!first) view.form(calm ? 0.01 : 1.6);
}

// Fingers on the planchette, which may hang a little over the board's edge.
addEventListener("pointerdown", (e) => {
  // Any touch hurries the opening along.
  view.hurry();
  if (!e.isPrimary || (e.target as Element).closest("#endcard, #mute, #voice")) return;
  const p = view.toBoard(e.clientX, e.clientY);
  if (!planchette.canGrab(p)) return;
  e.preventDefault();
  sound.unlock();
  if (!seance.sittersHaveIt || planchette.driven) return;
  planchette.grab(p);
  table.setPointerCapture(e.pointerId);
});
table.addEventListener("pointermove", (e) => {
  if (planchette.held) planchette.dragTo(view.toBoard(e.clientX, e.clientY));
});
const letGo = () => {
  if (!planchette.held) return;
  // Letting go with the window on the center sends too, however briefly it was there.
  const aim = planchette.aim;
  const center = hitTest(layout, aim.x, aim.y);
  planchette.release();
  dwell.release();
  view.setDwell(0);
  if (center?.id === "CENTER" && !planchette.driven) seance.onSelect(center);
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
ticker.onDraw((now, dt) => view.tick(now, dt));

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
  showMute();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("preload")));
  ticker.start();

  // The opening: the dark, the planchette alone in it, a title out of dust, and the board
  // carried in on a gust. The page's words wait until it is over.
  roomEl.classList.add("intro");
  void view.open(calm).then(() => roomEl.classList.remove("intro"));
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
  await seance.boot();
}

void start();
