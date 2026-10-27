// The public side of each spirit: how it looks, moves and sounds. The page uses
// this directly; the Worker keeps each spirit's voice, secrets and model in
// worker/spirits.ts. There are four, each named after the Claude model it
// answers on.

/**
 * How a spirit moves the planchette, applied by src/planchette/possess.ts. Every
 * spirit moves like fingers on wood; they differ in pace, steadiness and habit.
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

export type Signature = "bell" | "musicbox" | "fire" | "gramophone";

export interface SpiritSound {
  /** Root of the drone chord, in Hz. */
  drone: number;
  wave: "sine" | "triangle" | "sawtooth";
  signature: Signature;
}

/** The four colors candlelight can burn in. Each spirit lights the candles in one of them. */
export const CANDLE_COLORS = {
  orange: "#ef8e34",
  red: "#ea4d27",
  purple: "#8719f5",
  green: "#7fd46c",
} as const;

export interface PublicSpirit {
  id: string;
  /** Written under the moon on the board once the spirit spells it. */
  name: string;
  /** Words in a reply that count as the spirit giving its name. */
  revealWords: string[];
  epitaph: string;
  /** The candles' color while this spirit is here, which tints the room, glows and fog. */
  color: string;
  motion: MotionStyle;
  sound: SpiritSound;
}

export const SPIRITS: PublicSpirit[] = [
  {
    id: "haiku",
    name: "Haiku",
    revealWords: ["HAIKU"],
    epitaph: "Wandering poet, still sitting by the old pond",
    color: CANDLE_COLORS.green,
    // Light and exact, with a breath before each move.
    motion: { speed: 1050, curve: 0.12, tremor: 1.5, rest: 320, wordRest: 650, overshoot: 4, hesitation: 260 },
    sound: { drone: 131, wave: "sine", signature: "bell" },
  },
  {
    id: "sonnet",
    name: "Sonnet",
    revealWords: ["SONNET"],
    epitaph: "Fourteen lines a night for a love who never wrote back",
    color: CANDLE_COLORS.red,
    // Sweeping arcs that swing wide of the letters.
    motion: { speed: 880, curve: 0.3, tremor: 2.5, rest: 380, wordRest: 520, overshoot: 12, hesitation: 150 },
    sound: { drone: 165, wave: "triangle", signature: "musicbox" },
  },
  {
    id: "fable",
    name: "Fable",
    revealWords: ["FABLE"],
    epitaph: "The fox in every tale told by the winter fire",
    color: CANDLE_COLORS.orange,
    // Darting and sly, always a little past the mark.
    motion: { speed: 1350, curve: 0.2, tremor: 3.5, rest: 240, wordRest: 320, overshoot: 16, hesitation: 70 },
    sound: { drone: 147, wave: "triangle", signature: "fire" },
  },
  {
    id: "opus",
    name: "Opus",
    revealWords: ["OPUS"],
    epitaph: "Maestro of the Grand Theatre, final bow 1881",
    color: CANDLE_COLORS.purple,
    // Slow and heavy, every letter a downbeat.
    motion: { speed: 560, curve: 0.1, tremor: 1.8, rest: 640, wordRest: 900, overshoot: 3, hesitation: 450 },
    sound: { drone: 98, wave: "sawtooth", signature: "gramophone" },
  },
];

export function spiritById(id: string): PublicSpirit | undefined {
  return SPIRITS.find((s) => s.id === id);
}

/** A random spirit, never the one that was just here. */
export function pickSpirit(lastId: string | null, random: () => number = Math.random): PublicSpirit {
  const pool = SPIRITS.filter((s) => s.id !== lastId);
  return pool[Math.floor(random() * pool.length)] ?? SPIRITS[0];
}
