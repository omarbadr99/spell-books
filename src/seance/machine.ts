// The séance itself: the lock, the greeting that lights the candle and calls
// the spirit, asking, answering and goodbye. Whatever the sitters spell is sent
// once they hold the planchette still for a moment on the last letter. While
// the spirit has the planchette it moves on its own, and then it goes back to
// the sitters' hand.
//
// locked → unlocking → dormant → summoning → listening ⇄ asking → answering → ending → ended

import { SPIRIT, type PublicSpirit } from "../../shared/presence";
import { MOOD_COUNT, recentHistory, type Turn } from "../../shared/seance";
import { DIGITS, isGreeting, LETTERS, replyToMoves, saysGoodbye } from "../../shared/text";
import * as api from "../api";
import type { BoardElement } from "../board/layout";
import type { BoardView } from "../board/render";
import type { SoundScape } from "../fx/audio";
import type { Phase, Room } from "../fx/room";
import type { DwellDetector } from "../planchette/dwell";
import type { Planchette } from "../planchette/planchette";
import { STILL_AIR, type Possessor } from "../planchette/possess";
import type { InkLine, SpiritLine, Voice } from "./lines";

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
  /** The spirit's mood tonight, picked as she is called, which sets her greeting and her temper. */
  private mood = 0;

  constructor(private readonly parts: SeanceParts) {}

  async boot(): Promise<void> {
    this.parts.room.setSpirit(null);
    const seat = await api.checkSeat();
    if (seat === "unprepared") console.error("The board has not been prepared yet: set BOARD_WORD and COOKIE_SECRET (see the README).");
    if (seat === "seated") this.toDormant();
    else this.toLocked();
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
    this.parts.voice.sitters();
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
    this.parts.voice.sitters();
  }

  /** After the farewell, the board is ready for another séance. */
  restart(): void {
    if (this.phase !== "ended") return;
    const { voice, spiritLine } = this.parts;
    this.spirit = null;
    voice.sitters();
    spiritLine.begin();
    this.toDormant();
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

  private toLocked(): void {
    this.setPhase("locked");
    this.parts.dwell.reset();
  }

  private toDormant(): void {
    const { room, possessor, dwell } = this.parts;
    this.setPhase("dormant");
    dwell.reset();
    possessor.style = STILL_AIR;
    room.setSpirit(null);
    room.setCandles(false);
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
      this.toDormant();
      return;
    }
    await possessor.lunge("NO", (id) => view.flash(id, 1500));
    await this.parts.sleep(700);
    await this.giveBack();
    this.toLocked();
  }

  /** Words that aren't a greeting fade into the dark board, and nothing comes. */
  private ignore(): void {
    const { ink, sound, voice } = this.parts;
    ink.soak();
    sound.rub();
    voice.sitters();
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
    this.mood = Math.floor(Math.random() * MOOD_COUNT);
    spiritLine.begin();
    voice.sitters();
    dwell.reset();
    const answer = api.ask({ history: [], question: greeting, mood: this.mood });

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

    if (result.note) console.info(result.note);
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
    this.toDormant();
    ink.restore(greeting);
  }

  private async listen(): Promise<void> {
    await this.giveBack();
    this.setPhase("listening");
  }

  private async ask(): Promise<void> {
    const { ink, possessor } = this.parts;
    this.setPhase("asking");
    this.takeOver();
    const question = ink.soak();
    // No show while the spirit thinks: the planchette rests where it was left, and then it moves.
    const release = possessor.hold();
    const result = await api.ask({ history: recentHistory(this.history), question, mood: this.mood });
    await release();

    if ("reply" in result) {
      if (result.note) console.info(result.note);
      this.history.push({ from: "sitters", text: question }, { from: "spirit", text: result.reply });
      return this.answer(result.reply);
    }

    this.setPhase("answering");
    if (result.error === "locked") return this.loseTheTable();
    if (result.error === "slow") {
      await this.spell("WAIT");
    } else {
      await possessor.tremble();
    }
    ink.restore(question);
    await this.listen();
  }

  /** The spirit spells its reply; a GOODBYE in it ends the séance. */
  private async answer(reply: string): Promise<void> {
    this.setPhase("answering");
    await this.spell(reply);
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
    this.parts.farewell();
  }

  /** The device's seat expired mid-séance: the spirit slips away and the board locks. */
  private async loseTheTable(): Promise<void> {
    const { room, voice, sound, spiritLine } = this.parts;
    sound.release();
    voice.sitters();
    spiritLine.begin();
    this.spirit = null;
    room.setSpirit(null);
    room.setCandles(false);
    await this.giveBack();
    this.toLocked();
  }
}
