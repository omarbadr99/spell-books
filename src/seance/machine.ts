// The séance itself: the lock, summoning, asking, answering and goodbye.
//
// locked → unlocking → dormant → summoning → listening ⇄ asking → answering → ending → ended

import { pickSpirit, type PublicSpirit } from "../../shared/presence";
import { MAX_HISTORY, type Turn } from "../../shared/seance";
import { DIGITS, LETTERS, replyToMoves, revealsName, saysGoodbye } from "../../shared/text";
import * as api from "../api";
import type { BoardElement } from "../board/layout";
import type { BoardView } from "../board/render";
import type { SoundScape } from "../fx/audio";
import type { Phase, Room } from "../fx/room";
import type { DwellDetector } from "../planchette/dwell";
import type { Planchette } from "../planchette/planchette";
import { STILL_AIR, type Possessor } from "../planchette/possess";
import { markMet, type EndCard } from "./endcard";
import type { InkLine, SpiritLine } from "./lines";

const HINTS = {
  locked: "The board answers only to those who know the word.",
  lockedSpelling: "Rest the glass on ? to speak the word.",
  unprepared: "The board has not been prepared yet. See the README.",
  dormant: "Place your fingers on the planchette.",
  listening: "Rest the glass on a letter to spell. ✕ unsays, ? asks.",
};

export interface SeanceParts {
  room: Room;
  view: BoardView;
  planchette: Planchette;
  possessor: Possessor;
  dwell: DwellDetector;
  ink: InkLine;
  spiritLine: SpiritLine;
  endCard: EndCard;
  sound: SoundScape;
  /** Waits in step with the spirits (faster in tests). */
  sleep: (ms: number) => Promise<void>;
}

const chimeIndex = (id: string) => Math.max(0, (LETTERS + DIGITS).indexOf(id)) + id.length;

export class Seance {
  phase: Phase = "booting";
  spirit: PublicSpirit | null = null;
  private lastSpiritId: string | null = null;
  private openerIndex = 0;
  private history: Turn[] = [];
  private named = false;
  private questions = 0;
  private taught = false;

  constructor(private readonly parts: SeanceParts) {}

  async boot(): Promise<void> {
    this.parts.room.setSpirit(null);
    const seat = await api.checkSeat();
    if (seat === "seated") this.toDormant();
    else this.toLocked(seat === "unprepared" ? HINTS.unprepared : HINTS.locked);
  }

  /** The sitters may move the planchette themselves. */
  get sittersHaveIt(): boolean {
    return this.phase === "locked" || this.phase === "listening";
  }

  get inkText(): string {
    return this.parts.ink.text;
  }

  /** Fingers come to rest on the planchette. */
  onGrab(): void {
    this.parts.sound.unlock();
    if (this.phase === "dormant") void this.summon();
  }

  /** The glass rested long enough on a glyph. */
  onSelect(el: BoardElement): void {
    if (this.phase === "locked") this.lockInput(el);
    else if (this.phase === "listening") this.listenInput(el);
  }

  /** Re-applies what's drawn on the board after it is re-rendered for a new layout. */
  restoreBoard(): void {
    const { view } = this.parts;
    if (this.spirit && this.phase !== "ending" && this.phase !== "ended") view.setSigil(this.spirit, "scorch");
    view.engraveName(this.spirit && this.named ? this.spirit.name : null);
  }

  dismissEndCard(): void {
    if (this.phase !== "ended") return;
    const { endCard, view, spiritLine } = this.parts;
    endCard.hide();
    this.spirit = null;
    view.engraveName(null);
    spiritLine.begin();
    this.toDormant();
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.parts.room.setPhase(phase);
  }

  /** A spirit (or the board) takes the planchette out of the sitters' fingers. */
  private takeOver(): void {
    const { planchette, dwell, view } = this.parts;
    planchette.release();
    planchette.driven = true;
    dwell.release();
    view.setDwell(0);
    view.hover(null);
  }

  private giveBack(): void {
    this.parts.planchette.driven = false;
  }

  private toLocked(hint: string): void {
    this.setPhase("locked");
    this.giveBack();
    this.parts.dwell.reset();
    this.parts.room.hint(hint);
  }

  private toDormant(): void {
    const { room, possessor } = this.parts;
    this.setPhase("dormant");
    this.parts.planchette.driven = true;
    possessor.style = STILL_AIR;
    room.setSpirit(null);
    room.setGuttering(false);
    room.hint(HINTS.dormant);
  }

  private lockInput(el: BoardElement): void {
    const { ink, view, sound, room } = this.parts;
    if (el.kind === "letter" || el.kind === "digit") {
      ink.add(el.label);
      room.hint(HINTS.lockedSpelling);
    } else if (el.id === "UNSAY") {
      ink.unsay();
    } else if (el.id !== "ASK" || ink.empty) {
      return;
    }
    view.flash(el.id, 500);
    sound.knock();
    if (el.id === "ASK") void this.speakWord();
  }

  private async speakWord(): Promise<void> {
    const { ink, possessor, room, sound, view } = this.parts;
    this.setPhase("unlocking");
    this.takeOver();
    const word = ink.soak();
    const result = await api.enter(word);
    possessor.style = STILL_AIR;
    if (result === "ok") {
      sound.wake();
      room.shudder();
      await possessor.home();
      this.toDormant();
      return;
    }
    await possessor.lunge("NO", (id) => view.flash(id, 1500));
    await this.parts.sleep(700);
    await possessor.home();
    this.toLocked(result === "unprepared" ? HINTS.unprepared : HINTS.locked);
  }

  private async summon(): Promise<void> {
    const { room, view, possessor, sound, ink, spiritLine, dwell } = this.parts;
    this.setPhase("summoning");
    this.takeOver();
    const spirit = pickSpirit(this.lastSpiritId);
    this.spirit = spirit;
    this.openerIndex = Math.floor(Math.random() * spirit.openers.length);
    this.history = [];
    this.named = false;
    this.questions = 0;
    markMet(spirit.id);
    ink.clear();
    spiritLine.begin();
    view.engraveName(null);
    dwell.reset();
    room.hint("");

    sound.gutter();
    room.setGuttering(true);
    await this.parts.sleep(1000);
    room.setSpirit(spirit);
    possessor.style = spirit.motion;
    sound.summon(spirit.sound);
    room.setGuttering(false);
    view.setSigil(spirit, "burn");
    window.setTimeout(() => {
      if (this.spirit === spirit && this.phase !== "ending" && this.phase !== "ended") view.setSigil(spirit, "scorch");
    }, 2600);
    await possessor.jolt();
    await this.parts.sleep(450);
    await this.spell(spirit.openers[this.openerIndex]);
    this.listen();
  }

  private listen(): void {
    this.setPhase("listening");
    this.giveBack();
    this.parts.room.hint(this.taught ? "" : HINTS.listening);
  }

  private listenInput(el: BoardElement): void {
    const { ink, view, sound } = this.parts;
    if (el.id === "ASK" && ink.empty) return;
    view.flash(el.id, 500);
    sound.knock();
    switch (el.id) {
      case "UNSAY":
        ink.unsay();
        return;
      case "ASK":
        void this.ask();
        return;
      case "GOODBYE":
        void this.sittersLeave();
        return;
      case "YES":
      case "NO": {
        const answering = ink.empty;
        ink.addWord(el.id);
        if (answering) void this.ask();
        return;
      }
      default:
        ink.add(el.label);
    }
  }

  private async ask(): Promise<void> {
    const { ink, possessor, room } = this.parts;
    const spirit = this.spirit!;
    this.setPhase("asking");
    this.takeOver();
    this.taught = true;
    room.hint("");
    const question = ink.soak();
    const stop = possessor.circle();
    const result = await api.ask({
      spiritId: spirit.id,
      openerIndex: this.openerIndex,
      history: this.history.slice(-MAX_HISTORY),
      question,
    });
    await stop();
    this.setPhase("answering");

    if ("reply" in result) {
      this.questions++;
      this.history.push({ from: "sitters", text: question }, { from: "spirit", text: result.reply });
      await this.spell(result.reply);
      if (!this.named && revealsName(result.reply, spirit.revealWords, spirit.name)) {
        this.named = true;
        this.parts.view.engraveName(spirit.name);
      }
      if (saysGoodbye(result.reply)) return this.end();
      return this.listen();
    }

    if (result.error === "locked") return this.loseTheTable();
    if (result.error === "slow") {
      await this.spell("WAIT");
    } else {
      if (result.error === "unprepared") room.hint(HINTS.unprepared);
      await possessor.tremble();
      await possessor.home();
    }
    ink.restore(question);
    this.listen();
  }

  /** The planchette spells a reply glyph by glyph, then drifts home (or stays on GOOD BYE). */
  private async spell(text: string): Promise<void> {
    const { possessor, spiritLine, view, sound } = this.parts;
    spiritLine.begin();
    for (const move of replyToMoves(text)) {
      if (move.type === "space") {
        spiritLine.space();
        await possessor.wordBreak();
        continue;
      }
      await possessor.visit(move.target, (id) => {
        view.flash(id, 1100);
        spiritLine.add(move.text);
        sound.chime(chimeIndex(id));
      });
    }
    spiritLine.fadeLater();
    if (!saysGoodbye(text)) await possessor.home();
  }

  private async sittersLeave(): Promise<void> {
    const spirit = this.spirit!;
    this.setPhase("answering");
    this.takeOver();
    this.parts.ink.clear();
    const farewell = spirit.farewells[Math.floor(Math.random() * spirit.farewells.length)];
    await this.spell(`${farewell} GOODBYE`);
    await this.end();
  }

  private async end(): Promise<void> {
    const { room, view, sound, endCard, possessor } = this.parts;
    const spirit = this.spirit!;
    this.setPhase("ending");
    sound.gutter();
    sound.release();
    room.setGuttering(true);
    view.setSigil(spirit, "fade");
    await this.parts.sleep(1700);
    this.lastSpiritId = spirit.id;
    possessor.style = STILL_AIR;
    endCard.show(spirit, this.named, this.questions);
    this.setPhase("ended");
  }

  /** The device's seat expired mid-séance: the spirit slips away and the board locks. */
  private loseTheTable(): void {
    const { room, view, sound, spiritLine } = this.parts;
    sound.release();
    if (this.spirit) view.setSigil(this.spirit, "fade");
    view.engraveName(null);
    spiritLine.begin();
    this.spirit = null;
    room.setSpirit(null);
    this.toLocked(HINTS.locked);
  }
}
