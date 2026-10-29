import "@fontsource/cinzel/700.css";
import "./styles.css";

import { boardWidthFor, buildLayout, chooseLayoutKind, elementById, hitTest, type BoardLayout, type LayoutKind } from "./board/layout";
import * as api from "./api";
import { BoardView } from "./board/render";
import { SoundScape } from "./fx/audio";
import { Room } from "./fx/room";
import { DwellDetector } from "./planchette/dwell";
import { Planchette } from "./planchette/planchette";
import { Possessor } from "./planchette/possess";
import { InkLine, SpiritLine, Voice } from "./seance/lines";
import { Seance } from "./seance/machine";
import { Ticker } from "./ticker";

/** How long the glass rests on a glyph to choose it, once the hand has stopped. */
const DWELL_MS = 300;
/** How long it rests, with something spelled, before what was spelled is sent. */
const SEND_MS = 2000;
/** How far above a fingertip the glass sits, in CSS pixels, so the finger doesn't hide the letter. */
const LIFT = 64;
/** Pointer movement smaller than this, in CSS pixels, is a tremble of the hand, not a move. */
const JITTER = 6;
/** The board's own lettering, which the particles are sampled from. */
const BOARD_FONT = "700 80px Cinzel";
/** The page's own buttons, over which the planchette steps aside for the ordinary pointer. */
const BUTTONS = "#mute, #voice";

// In development only: ?speed=4 runs the spirit faster, for the tests, and ?steady keeps the
// picture at full resolution however slowly frames come, for screenshots.
const params = new URLSearchParams(location.search);
const speed = import.meta.env.DEV ? Math.max(1, Number(params.get("speed")) || 1) : 1;
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const roomEl = $<HTMLElement>("#room");
const table = $<HTMLElement>("#table");
/**
 * START, and RESTART under the farewell's land, are written in the particles;
 * these buttons lie over them, so they can be pressed, tapped or reached from
 * the keyboard.
 */
const playEl = $<HTMLButtonElement>("#play");
const restartEl = $<HTMLButtonElement>("#restart");
/** The hand's own mark, while the spirit has the planchette. */
const cursorEl = $<HTMLElement>("#cursor");

/** What the room shows: START, the board, or the farewell. */
let scene: "start" | "board" | "farewell" = "start";
/** Where the sitters' pointer is on the page, where the glass follows it, and whether it is a finger. */
const pointer = { x: innerWidth / 2, y: innerHeight * 0.66, touch: false, overButton: false };
/** Where the pointer was when it last truly moved. */
const steadyAt = { ...pointer };
/** How long the glass has rested, in ms, toward sending what was spelled. */
let restingFor = 0;
/** Whether the sitters are waiting to have the board back: while the points fly, or while the spirit has the planchette. */
let waiting = true;
let booted: Promise<void> = Promise.resolve();

let view: BoardView;
try {
  view = new BoardView($<HTMLCanvasElement>("#scene"), table, $<HTMLElement>("#hand"));
} catch (error) {
  const notice = $<HTMLElement>("#notice");
  notice.textContent = "This board is drawn with WebGL, which this browser has turned off.";
  notice.hidden = false;
  throw error;
}

if (import.meta.env.DEV && params.has("steady")) view.adaptive = false;

const ticker = new Ticker();
const planchette = new Planchette(view);
const possessor = new Possessor(planchette, view, ticker, speed);
possessor.handAt = () => view.toBoard(pointer.x, pointer.y);
const sound = new SoundScape();
const room = new Room(roomEl, view);
const voice = new Voice($("#voice"));

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
  voice,
  sound,
  sleep: (ms) => possessor.wait(ms),
  farewell: () => void part(),
});

function sizeBoard(): void {
  roomEl.style.setProperty("--board-w", `${boardWidthFor(layout, innerWidth, innerHeight)}px`);
}

function applyLayout(kind: LayoutKind): void {
  layout = buildLayout(kind);
  room.setLayout(kind);
  sizeBoard();
  view.setLayout(layout);
}

/**
 * START (or RESTART) waits to be pressed: it stirs and brightens as the glass
 * comes near it, and its button lies over it, wherever the view has put it.
 */
function awaitPress(button: HTMLButtonElement, word: "start" | "restart"): void {
  if (button.hidden) return;
  const box = view.wordBox(word);
  const dx = (pointer.x - (box.left + box.right) / 2) / ((box.right - box.left) / 2);
  const dy = (pointer.y - (box.top + box.bottom) / 2) / ((box.bottom - box.top) / 2);
  view.nearWord(Math.min(1, Math.max(0, (2.2 - Math.hypot(dx, dy * 0.5)) / 1.6)));
  const pad = 14;
  Object.assign(button.style, {
    left: `${(box.left - pad).toFixed(0)}px`,
    top: `${(box.top - pad).toFixed(0)}px`,
    width: `${(box.right - box.left + 2 * pad).toFixed(0)}px`,
    height: `${(box.bottom - box.top + 2 * pad).toFixed(0)}px`,
  });
}

/**
 * On the board: the glass chooses a glyph by resting on it a moment, and once
 * something is spelled, resting a little longer sends it. A ring round the
 * window fills for each.
 */
function spellWith(now: number, dt: number): void {
  if (planchette.driven || !seance.sittersHaveIt || view.forming) {
    view.hover(null);
    view.setDwell(0);
    view.setSend(0);
    restingFor = 0;
    waiting = true;
    return;
  }
  if (waiting) {
    // Whatever the glass is on as the sitters get it back is only chosen once it moves off and comes back.
    waiting = false;
    const under = hitTest(layout, planchette.pos.x, planchette.pos.y);
    if (under) dwell.chose(under.id);
  }
  const steady = planchette.settled(now);
  const state = dwell.update(now, planchette.pos.x, planchette.pos.y, steady);
  view.hover(state.hoverId);
  view.setDwell(state.progress);
  const selected = state.selected && elementById(layout, state.selected);
  if (selected) seance.onSelect(selected);

  restingFor = steady ? restingFor + dt * 1000 : 0;
  const spelled = seance.inkText !== "" && seance.sittersHaveIt;
  view.setSend(spelled ? Math.min(1, Math.max(0, (restingFor - DWELL_MS) / (SEND_MS - DWELL_MS))) : 0);
  if (spelled && restingFor >= SEND_MS) {
    restingFor = 0;
    view.setSend(0);
    seance.send();
  }
}

/** A click chooses the glyph under the pointer, where the glass is going, at once. */
function chooseNow(): void {
  if (planchette.driven || !seance.sittersHaveIt || view.forming) return;
  const at = view.toBoard(pointer.x, pointer.y);
  const el = hitTest(layout, at.x, at.y);
  if (!el) return;
  dwell.chose(el.id);
  restingFor = 0;
  seance.onSelect(el);
}

/**
 * START is pressed: it bursts and the board flies together out of the dark.
 * The sound comes up, and the preview asks to use Claude.
 */
async function begin(): Promise<void> {
  if (scene !== "start") return;
  scene = "board";
  playEl.hidden = true;
  view.nearWord(1);
  sound.unlock();
  sound.awaken();
  void api.prepare();
  await view.open(calm);
  roomEl.classList.remove("intro");
  await booted;
}

/** The spirit has gone: the board breaks up into the farewell, and RESTART gathers under the land. */
async function part(): Promise<void> {
  scene = "farewell";
  roomEl.classList.add("parted");
  sound.farewell();
  view.nearWord(0);
  await view.farewell(calm);
  if (scene === "farewell") restartEl.hidden = false;
}

/** RESTART is pressed: it bursts, and the land flies back together into the board for another séance. */
async function restart(): Promise<void> {
  if (scene !== "farewell" || restartEl.hidden) return;
  scene = "board";
  restartEl.hidden = true;
  view.nearWord(1);
  roomEl.classList.remove("parted");
  seance.restart();
  sound.unlock();
  sound.awaken();
  await view.reopen(calm);
}

/** Where the sitters' pointer is, and whether it is over one of the page's own buttons. */
function track(e: PointerEvent): void {
  if (!e.isPrimary) return;
  pointer.touch = e.pointerType === "touch";
  pointer.x = e.clientX;
  pointer.y = e.clientY - (pointer.touch ? LIFT : 0);
  pointer.overButton = !pointer.touch && (e.target as Element).closest?.(BUTTONS) != null;
  view.look(e.clientX, e.clientY);
}

addEventListener("pointermove", track);
addEventListener("pointerdown", (e) => {
  track(e);
  sound.unlock();
  // A touch while the points are flying hurries them along.
  if (view.forming && scene !== "start") view.hurry();
  if (scene === "board" && e.pointerType === "mouse" && e.button === 0 && !pointer.overButton) chooseNow();
});
playEl.addEventListener("click", () => void begin());
restartEl.addEventListener("click", () => void restart());
// Tapping the message rubs out its last letter.
$("#voice").addEventListener("click", () => seance.unsay());

// iOS only starts audio from certain gestures, so try on each of them.
for (const type of ["pointerdown", "touchend", "click"]) document.addEventListener(type, () => sound.unlock());

ticker.add((now, dt) => {
  const moved = Math.hypot(pointer.x - steadyAt.x, pointer.y - steadyAt.y) > JITTER;
  if (moved) Object.assign(steadyAt, { x: pointer.x, y: pointer.y });
  if (!planchette.driven) planchette.follow(view.toBoard(pointer.x, pointer.y), moved);
  planchette.tick(dt);
  sound.scrape(planchette.speed);
  sound.wind(view.windLevel);
  // The planchette steps aside only for the page's own buttons.
  view.showPlanchette(planchette.driven || !pointer.overButton);
  // While the spirit has the planchette, a faint mark shows where the hand is.
  const hand = planchette.driven && !pointer.touch;
  cursorEl.classList.toggle("on", hand);
  if (hand) cursorEl.style.transform = `translate(${pointer.x.toFixed(1)}px, ${pointer.y.toFixed(1)}px)`;
  if (scene === "start") awaitPress(playEl, "start");
  else if (scene === "farewell") awaitPress(restartEl, "restart");
  else spellWith(now, dt);
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
      scene: () => scene,
      visited: () => visited.length,
      since: (from: number) => visited.slice(from),
      spirit: () => seance.spirit?.name ?? null,
      lens: () => view.toScreen(planchette.pos),
      glyph: (id: string) => {
        const el = elementById(layout, id);
        return el ? view.toScreen(el) : null;
      },
      lastTarget: () => possessor.lastTarget,
      spiritLine: () => $("#spirit-line").textContent,
      ink: () => seance.inkText,
      speaker: () => $("#voice").getAttribute("data-speaker"),
      forming: () => view.forming,
      start: () => {
        const box = view.wordBox("start");
        return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
      },
      restart: () => {
        const box = view.wordBox("restart");
        return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
      },
      // The scene itself, for measuring what each layer costs.
      view,
      // Straight to the farewell, for looking at it.
      part: () => void part(),
    },
  });
}

async function start(): Promise<void> {
  // The particles are sampled from the board's lettering, so wait (a little) for it.
  const fontReady = await Promise.race([
    document.fonts.load(BOARD_FONT).then((faces) => faces.length > 0, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  applyLayout(layout.kind);
  planchette.place(layout.rest);
  showMute();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("preload")));
  ticker.start();

  if (!fontReady) {
    // If the lettering turns up late, sample it again.
    const late = () => {
      if (!document.fonts.check(BOARD_FONT)) return;
      document.fonts.removeEventListener("loadingdone", late);
      view.resample();
    };
    document.fonts.addEventListener("loadingdone", late);
  }
  // Meanwhile, find out whether this device already knows the word.
  booted = seance.boot();
  // The dust flies together into START, and waits there to be pressed.
  await view.gather(calm);
}

void start();
