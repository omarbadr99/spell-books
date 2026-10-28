// The séance itself: the lock, the greeting that lights the candle and calls
// the spirit, asking, answering and goodbye. Whatever the sitters spell is sent
// once they hold the planchette still for a moment on the last letter. While
// the spirit has the planchette it moves on its own, and then it goes back to
// the sitters' hand.
//
// locked → unlocking → dormant → summoning → listening ⇄ asking → answering → ending → ended

import { SPIRIT, type PublicSpirit } from "../../shared/presence";
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
import type { InkLine, SpiritLine, Voice } from "./lines";

const HINTS = {
  locked: "Spell the secret word, then rest on the last letter.",
  unprepared: "The board has not been prepared yet. See the README.",
  dormant: "Greet the spirit: spell HI or HELLO, then rest on the last letter.",
  notGreeting: "The board stays dark. The spirit only comes when greeted: HI, HELLO or IS ANYONE THERE.",
  unanswered: "No one answered. Rest the planchette to call again.",
  busy: "The spirit is busy. Wait a moment, then call again.",
  listening: "Spell your question, then rest on the last letter.",
  send: "Rest on the last letter to send. Tap your message to rub out a letter.",
  unlocked: "The board knows you now. Greet the spirit to light the candle.",
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
  sound: SoundScape;
  /** Waits in step with the spirit (faster in tests). */
  sleep: (ms: number) => Promise<void>;
  /** The spirit has gone: show the farewell. */
  farewell: () => void;
}

const chimeIndex = (id: string) => Math.max(0, (LETTERS + DIGITS).indexOf(id)) + id.length;

export class Seance {
  phase: Phase = "booting";
  /** The spirit, while it is here. */
  spirit: PublicSpirit | null = null;
  private history: Turn[] = [];
  private named = false;
  private taught = false;

  constructor(private readonly parts: SeanceParts) {}

  async boot(): Promise<void> {
    this.parts.room.setSpirit(null);
    const seat = await api.checkSeat();
    if (seat === "seated") this.toDormant(HINTS.dormant);
    else this.toLocked(seat === "unprepared" ? HINTS.unprepared : HINTS.locked);
  }

  /** The sitters may spell. */
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

  /** The sitters held the planchette still with something spelled: it goes. */
  send(): void {
    const { ink, sound } = this.parts;
    if (!this.sittersHaveIt || ink.empty) return;
    sound.knock();
    if (this.phase === "locked") void this.speakWord();
    else if (this.phase === "dormant") {
      if (isGreeting(ink.text)) void this.summon();
      else this.ignore();
    } else void this.ask();
  }

  /** Rubs the last letter off the paper slip. */
  unsay(): void {
    const { ink, sound } = this.parts;
    if (!this.sittersHaveIt || ink.empty) return;
    ink.unsay();
    sound.rub();
    this.showSpelling();
  }

  /** After the farewell, the board is ready for another séance. */
  restart(): void {
    if (this.phase !== "ended") return;
    const { voice, spiritLine } = this.parts;
    this.spirit = null;
    voice.setName(null);
    voice.sitters();
    spiritLine.begin();
    this.toDormant(HINTS.dormant);
  }

  private showSpelling(): void {
    const { ink, room, voice } = this.parts;
    voice.sitters();
    room.hint(ink.empty ? this.restingHint() : this.phase === "listening" && this.taught ? "" : HINTS.send);
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

  /** The spirit (or the board) takes the planchette out of the sitters' hand. */
  private takeOver(): void {
    const { planchette, dwell, view } = this.parts;
    planchette.driven = true;
    dwell.release();
    view.setDwell(0);
    view.setSend(0);
    view.hover(null);
  }

  /** And brings it back to their hand, which takes it again. */
  private async giveBack(): Promise<void> {
    const { planchette, possessor } = this.parts;
    if (!planchette.driven) return;
    await possessor.home();
    planchette.driven = false;
  }

  private toLocked(hint: string): void {
    this.setPhase("locked");
    this.parts.dwell.reset();
    this.parts.room.hint(hint);
  }

  private toDormant(hint: string): void {
    const { room, possessor, dwell } = this.parts;
    this.setPhase("dormant");
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
      await this.giveBack();
      this.toDormant(HINTS.unlocked);
      return;
    }
    await possessor.lunge("NO", (id) => view.flash(id, 1500));
    await this.parts.sleep(700);
    await this.giveBack();
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
   * The sitters' greeting lights the candle and calls the spirit. It starts
   * thinking at once, while the candle catches, and answers the greeting.
   */
  private async summon(): Promise<void> {
    const { room, voice, possessor, sound, ink, spiritLine, dwell } = this.parts;
    this.setPhase("summoning");
    this.takeOver();
    const greeting = ink.soak();
    this.spirit = SPIRIT;
    this.history = [];
    this.named = false;
    spiritLine.begin();
    voice.setName(null);
    dwell.reset();
    room.hint("");
    const answer = api.ask({ history: [], question: greeting });

    await this.parts.sleep(500);
    room.setSpirit(SPIRIT);
    room.setCandles(true);
    possessor.style = SPIRIT.motion;
    sound.summon(SPIRIT.sound);
    await this.parts.sleep(1100);
    await possessor.jolt();
    const release = possessor.hold();
    const result = await answer;
    await release();
    if (!("reply" in result)) return this.unanswered(greeting, result.error);

    if (result.note) room.hint(result.note);
    this.history.push({ from: "sitters", text: greeting }, { from: "spirit", text: result.reply });
    await this.answer(result.reply);
  }

  /** No spirit came after all: the candle goes out and the greeting comes back, to be sent again. */
  private async unanswered(greeting: string, error: "slow" | "silent" | "locked" | "unprepared"): Promise<void> {
    const { sound, ink, possessor } = this.parts;
    if (error === "locked") return this.loseTheTable();
    sound.release(1.2);
    sound.gutter();
    this.spirit = null;
    await possessor.tremble();
    await this.giveBack();
    this.toDormant(error === "slow" ? HINTS.busy : error === "unprepared" ? HINTS.unprepared : HINTS.unanswered);
    ink.restore(greeting);
  }

  private async listen(): Promise<void> {
    const { ink, room } = this.parts;
    await this.giveBack();
    this.setPhase("listening");
    room.hint(ink.empty ? this.restingHint() : HINTS.send);
  }

  private async ask(): Promise<void> {
    const { ink, possessor, room } = this.parts;
    this.setPhase("asking");
    this.takeOver();
    this.taught = true;
    room.hint("");
    const question = ink.soak();
    // No show while the spirit thinks: the planchette rests where it was left, and then it moves.
    const release = possessor.hold();
    const result = await api.ask({ history: recentHistory(this.history), question });
    await release();

    if ("reply" in result) {
      if (result.note) room.hint(result.note);
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
    }
    ink.restore(question);
    await this.listen();
  }

  /** The spirit spells its reply; a GOODBYE in it ends the séance. */
  private async answer(reply: string): Promise<void> {
    this.setPhase("answering");
    await this.spell(reply);
    if (!this.named && revealsName(reply, SPIRIT.revealWords, SPIRIT.name)) {
      this.named = true;
      this.parts.voice.setName(SPIRIT.name);
    }
    if (saysGoodbye(reply)) return this.end();
    await this.listen();
  }

  /** The planchette spells a reply glyph by glyph. */
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
  }

  /** The sitters say goodbye, and the spirit simply goes, without a word. */
  private async sittersLeave(): Promise<void> {
    this.takeOver();
    this.parts.ink.clear();
    await this.end();
  }

  /** A last gust as the spirit goes snuffs the candle, and the board breaks up into the farewell. */
  private async end(): Promise<void> {
    const { room, sound, possessor, view } = this.parts;
    this.setPhase("ending");
    view.depart();
    await this.parts.sleep(420);
    sound.gutter();
    sound.release();
    room.setCandles(false);
    await this.parts.sleep(1200);
    possessor.style = STILL_AIR;
    await this.giveBack();
    this.spirit = null;
    this.setPhase("ended");
    room.hint("");
    this.parts.farewell();
  }

  /** The device's seat expired mid-séance: the spirit slips away and the board locks. */
  private async loseTheTable(): Promise<void> {
    const { room, voice, sound, spiritLine } = this.parts;
    sound.release();
    voice.setName(null);
    voice.sitters();
    spiritLine.begin();
    this.spirit = null;
    room.setSpirit(null);
    room.setCandles(false);
    await this.giveBack();
    this.toLocked(HINTS.locked);
  }
}
