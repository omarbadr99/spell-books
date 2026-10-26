import "@fontsource/cinzel-decorative/700.css";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "./styles.css";
import "./fx/atmosphere.css";

import { buildLayout, chooseLayoutKind, elementById, hitTest, type BoardLayout, type LayoutKind } from "./board/layout";
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

const DWELL_MS = 700;

// ?speed=4 runs the spirits faster; only honoured in development, for the tests.
const speed = import.meta.env.DEV ? Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 1) : 1;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const roomEl = $<HTMLElement>("#room");
const boardEl = $<SVGSVGElement>("#board");

const ticker = new Ticker();
const view = new BoardView(boardEl);
const planchette = new Planchette(view);
const possessor = new Possessor(planchette, view, ticker, speed);
const sound = new SoundScape();
possessor.onTap = () => sound.tap();
const room = new Room(roomEl, $("#table"), $("#hint"));

let layout: BoardLayout = buildLayout(chooseLayoutKind(innerWidth, innerHeight));
const dwell = new DwellDetector((x, y) => hitTest(layout, x, y)?.id ?? null, { dwellMs: DWELL_MS, maxSpeed: 260 });

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
  const tall = layout.kind === "tall";
  // Room for the spirit's line, the slip and the hint; phones held sideways get a compact version.
  const chrome = innerHeight < 520 ? 118 : tall ? 236 : 206;
  const sides = tall ? 32 : 230;
  const width = Math.min(innerWidth - sides, (innerHeight - chrome) * (layout.width / layout.height), tall ? 640 : 1160);
  roomEl.style.setProperty("--board-w", `${Math.max(240, Math.floor(width))}px`);
}

function applyLayout(kind: LayoutKind, first = false): void {
  const previous = layout;
  layout = buildLayout(kind);
  room.setLayout(kind);
  view.render(layout);
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
  planchette.release();
  dwell.release();
  view.setDwell(0);
};
boardEl.addEventListener("pointerup", letGo);
boardEl.addEventListener("pointercancel", letGo);
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
    document.fonts.load("700 40px 'Cinzel Decorative'").catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  applyLayout(layout.kind, true);
  showMute();
  ticker.start();
  await seance.boot();
}

void start();
