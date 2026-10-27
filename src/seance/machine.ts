// The séance itself: the lock, the greeting that lights the candle and calls a
// spirit, asking, answering and goodbye. Whatever the sitters spell is sent the
// moment they bring the planchette back to the center of the board.
//
// locked → unlocking → dormant → summoning → listening ⇄ asking → answering → ending → ended

import { pickSpirit, type PublicSpirit } from "../../shared/presence";
import { recentHistory, type Turn } from "../../shared/seance";
import { DIGITS, isGreeting, LETTERS, replyToMoves, revealsName, saysGoodbye } from "../../shared/text";
import * as api from "../api";
import type { BoardElement } from "../board/layout";
import type { BoardView } from "../board/render";
import type { SoundScape } from "../fx/audio";
import type { Phase, Room } from "../fx/room";
import type { DwellDetector } from "../planchette/dwell";
import type { Planchette } from "../planchette/planchette";
import { STILL_AIR, type Possessor } from "../planchette/possess";
import { markMet, type EndCard } from "./endcard";
import type { InkLine, SpiritLine, Voice } from "./lines";

const HINTS = {
  locked: "Spell the secret word, then bring the planchette back to the center.",
  unprepared: "The board has not been prepared yet. See the README.",
  dormant: "Greet the spirits: spell HI, HELLO or IS ANYONE THERE, then bring the planchette back to the center.",
  notGreeting: "The board stays dark. The spirits only come when greeted: HI, HELLO or IS ANYONE THERE.",
  unanswered: "No one answered. Bring the planchette back to the center to call again.",
  busy: "The spirits are crowding the board. Wait a moment, then call again.",
  listening: "Spell your question, then bring the planchette back to the center.",
  send: "Back to the center to send it. Tap your message to rub out a letter.",
  unlocked: "The board knows you now. Greet the spirits to light the candle.",
};

export interface SeanceParts {
  room: Room;
  view: BoardView;
  planchette: Planchette;
  possessor: Possessor;
  dwell: DwellDetector;
  ink: InkLine;
  spiritLine: SpiritLine;
  voice: Voice;
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
  private history: Turn[] = [];
  private named = false;
  private questions = 0;
  private taught = false;

  constructor(private readonly parts: SeanceParts) {}

  async boot(): Promise<void> {
    this.parts.room.setSpirit(null);
    const seat = await api.checkSeat();
    if (seat === "seated") this.toDormant(HINTS.dormant);
    else this.toLocked(seat === "unprepared" ? HINTS.unprepared : HINTS.locked);
  }

  /** The sitters may move the planchette themselves. */
  get sittersHaveIt(): boolean {
    return this.phase === "locked" || this.phase === "dormant" || this.phase === "listening";
  }

  get inkText(): string {
    return this.parts.ink.text;
  }

  /** The glass rested long enough on a glyph. */
  onSelect(el: BoardElement): void {
    if (!this.sittersHaveIt) return;
    const { ink, view, sound } = this.parts;
    if (el.id === "CENTER") {
      if (ink.empty) return;
      view.flash(el.id, 600);
      sound.knock();
      if (this.phase === "locked") void this.speakWord();
      else if (this.phase === "dormant") {
        if (isGreeting(ink.text)) void this.summon();
        else this.ignore();
      }
      else void this.ask();
      return;
    }

    if (el.id === "GOODBYE") {
      if (this.phase !== "listening") return;
      view.flash(el.id, 500);
      sound.knock();
      void this.sittersLeave();
      return;
    }

    view.flash(el.id, 500);
    sound.knock();
    if (el.id === "YES" || el.id === "NO") {
      // On an empty slip, YES or NO is an answer to the spirit's own question.
      const answering = ink.empty && this.phase === "listening";
      ink.addWord(el.id);
      if (answering) return void this.ask();
    } else {
      ink.add(el.label);
    }
    this.showSpelling();
  }

  /** Rubs the last letter off the paper slip. */
  unsay(): void {
    const { ink, sound } = this.parts;
    if (!this.sittersHaveIt || ink.empty) return;
    ink.unsay();
    sound.rub();
    this.showSpelling();
  }

  private showSpelling(): void {
    const { ink, view, room, voice } = this.parts;
    voice.sitters();
    view.beckon(!ink.empty);
    room.hint(ink.empty ? this.restingHint() : this.phase === "listening" && this.taught ? "" : HINTS.send);
  }

  /** Re-applies what's drawn on the board after it is re-rendered for a new layout. */
  restoreBoard(): void {
    const { view, ink } = this.parts;
    view.beckon(this.sittersHaveIt && !ink.empty);
  }

  dismissEndCard(): void {
    if (this.phase !== "ended") return;
    const { endCard, voice, spiritLine } = this.parts;
    endCard.hide();
    this.spirit = null;
    voice.setName(null);
    voice.sitters();
    spiritLine.begin();
    this.toDormant(HINTS.dormant);
  }

  private restingHint(): string {
    if (this.phase === "locked") return HINTS.locked;
    if (this.phase === "dormant") return HINTS.dormant;
    return this.taught ? "" : HINTS.listening;
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
    view.beckon(false);
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

  private toDormant(hint: string): void {
    const { room, possessor, dwell } = this.parts;
    this.setPhase("dormant");
    this.giveBack();
    dwell.reset();
    possessor.style = STILL_AIR;
    room.setSpirit(null);
    room.setCandles(false);
    room.hint(hint);
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
      this.toDormant(HINTS.unlocked);
      return;
    }
    await possessor.lunge("NO", (id) => view.flash(id, 1500));
    await this.parts.sleep(700);
    await possessor.home();
    this.toLocked(result === "unprepared" ? HINTS.unprepared : HINTS.locked);
  }

  /** Words that aren't a greeting fade into the dark board, and nothing comes. */
  private ignore(): void {
    const { ink, room, sound } = this.parts;
    ink.soak();
    sound.rub();
    this.showSpelling();
    room.hint(HINTS.notGreeting);
  }

  /**
   * The sitters' greeting lights the candle and calls a spirit. It starts
   * thinking at once, while the candle catches, and answers the greeting.
   */
  private async summon(): Promise<void> {
    const { room, voice, possessor, sound, ink, spiritLine, dwell } = this.parts;
    this.setPhase("summoning");
    this.takeOver();
    const greeting = ink.soak();
    const spirit = pickSpirit(this.lastSpiritId);
    this.spirit = spirit;
    this.history = [];
    this.named = false;
    this.questions = 0;
    spiritLine.begin();
    voice.setName(null);
    dwell.reset();
    room.hint("");
    const answer = api.ask({ spiritId: spirit.id, history: [], question: greeting });

    await this.parts.sleep(500);
    room.setSpirit(spirit);
    room.setCandles(true);
    possessor.style = spirit.motion;
    sound.summon(spirit.sound);
    await this.parts.sleep(1100);
    await possessor.jolt();
    const result = await answer;
    if (!("reply" in result)) return this.unanswered(greeting, result.error);

    markMet(spirit.id);
    if (result.note) room.hint(result.note);
    this.history.push({ from: "sitters", text: greeting }, { from: "spirit", text: result.reply });
    await this.answer(result.reply);
  }

  /** No spirit came after all: the candle goes out and the greeting comes back, to be sent again. */
  private async unanswered(greeting: string, error: "slow" | "silent" | "locked" | "unprepared"): Promise<void> {
    const { sound, ink, possessor, view } = this.parts;
    if (error === "locked") return this.loseTheTable();
    sound.release(1.2);
    sound.gutter();
    this.spirit = null;
    await possessor.tremble();
    this.toDormant(error === "slow" ? HINTS.busy : error === "unprepared" ? HINTS.unprepared : HINTS.unanswered);
    ink.restore(greeting);
    view.beckon(true);
  }

  private listen(): void {
    const { ink, room, view } = this.parts;
    this.setPhase("listening");
    this.giveBack();
    view.beckon(!ink.empty);
    room.hint(ink.empty ? this.restingHint() : HINTS.send);
  }

  private async ask(): Promise<void> {
    const { ink, possessor, room } = this.parts;
    const spirit = this.spirit!;
    this.setPhase("asking");
    this.takeOver();
    this.taught = true;
    room.hint("");
    const question = ink.soak();
    // No show while the spirit thinks: the planchette rests, and then it moves.
    const result = await api.ask({ spiritId: spirit.id, history: recentHistory(this.history), question });

    if ("reply" in result) {
      if (result.note) room.hint(result.note);
      this.questions++;
      this.history.push({ from: "sitters", text: question }, { from: "spirit", text: result.reply });
      return this.answer(result.reply);
    }

    this.setPhase("answering");
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

  /** The spirit spells its reply; a GOODBYE in it ends the séance. */
  private async answer(reply: string): Promise<void> {
    const spirit = this.spirit!;
    this.setPhase("answering");
    await this.spell(reply);
    if (!this.named && revealsName(reply, spirit.revealWords, spirit.name)) {
      this.named = true;
      this.parts.voice.setName(spirit.name);
    }
    if (saysGoodbye(reply)) return this.end();
    this.listen();
  }

  /** The planchette spells a reply glyph by glyph, then drifts home (or stays on GOOD BYE). */
  private async spell(text: string): Promise<void> {
    const { possessor, spiritLine, view, sound, voice } = this.parts;
    spiritLine.begin();
    voice.spirit();
    // The candle flares and the air stirs while the spirit speaks.
    view.speak(true);
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
    view.speak(false);
    spiritLine.fadeLater(3400, () => {
      if (this.sittersHaveIt) voice.sitters();
    });
    if (!saysGoodbye(text)) await possessor.home();
  }

  /** The sitters say goodbye, and the spirit simply goes, without a word. */
  private async sittersLeave(): Promise<void> {
    this.takeOver();
    this.parts.ink.clear();
    await this.end();
  }

  /** A last gust as the spirit goes snuffs the candle, and the end card shows who came. */
  private async end(): Promise<void> {
    const { room, sound, endCard, possessor, view } = this.parts;
    const spirit = this.spirit!;
    this.setPhase("ending");
    view.depart();
    await this.parts.sleep(420);
    sound.gutter();
    sound.release();
    room.setCandles(false);
    await this.parts.sleep(1900);
    this.lastSpiritId = spirit.id;
    possessor.style = STILL_AIR;
    endCard.show(spirit, this.named, this.questions);
    this.setPhase("ended");
  }

  /** The device's seat expired mid-séance: the spirit slips away and the board locks. */
  private loseTheTable(): void {
    const { room, voice, sound, spiritLine } = this.parts;
    sound.release();
    voice.setName(null);
    voice.sitters();
    spiritLine.begin();
    this.spirit = null;
    room.setSpirit(null);
    room.setCandles(false);
    this.toLocked(HINTS.locked);
  }
}
