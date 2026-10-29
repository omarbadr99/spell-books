// The public side of the spirit: how it looks, moves and sounds. The page uses
// this directly; the Worker keeps its voice, secret and model in
// worker/spirits.ts.

/**
 * How the spirit moves the planchette, applied by src/planchette/possess.ts. It
 * moves like fingers on wood, with its own pace, steadiness and habits.
 */
export interface MotionStyle {
  /** Typical gliding speed in board units per second. */
  speed: number;
  /** How much paths bow: 0 is straight, 0.3 a generous arc. */
  curve: number;
  /** How unsteady the fingers are, in board units. */
  tremor: number;
  /** How long the glass stays on each glyph, in ms. */
  rest: number;
  /** Pause between words, in ms. */
  wordRest: number;
  /** How far it slides past a glyph before being pulled back, in board units. */
  overshoot: number;
  /** Longest pause before it sets off, in ms: the moment before the wood gives. */
  hesitation: number;
}

export interface SpiritSound {
  /** Root of the drone chord, in Hz. */
  drone: number;
  wave: "sine" | "triangle" | "sawtooth";
}

/** Plain candlelight. */
export const CANDLELIGHT = "#ef8e34";

export interface PublicSpirit {
  /** What the spirit is called. */
  name: string;
  /** The words it spells when asked its name. */
  revealWords: string[];
  /** The candle's color while the spirit is here, which tints the room and its glows. */
  color: string;
  motion: MotionStyle;
  sound: SpiritSound;
}

/** The one spirit who answers the board. */
export const SPIRIT: PublicSpirit = {
  name: "Mavis",
  revealWords: ["MAVIS"],
  color: CANDLELIGHT,
  // Brisk and impatient: straight at each letter, a little past it, and on to the next.
  motion: { speed: 1250, curve: 0.12, tremor: 2.2, rest: 260, wordRest: 380, overshoot: 14, hesitation: 120 },
  sound: { drone: 110, wave: "triangle" },
};
