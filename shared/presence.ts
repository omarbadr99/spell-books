// The public side of each spirit: how it looks, moves and sounds, plus the
// lines it spells on arrival and departure. The page uses this directly; the
// Worker keeps each spirit's voice and secrets in worker/spirits.ts.

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

export type Signature =
  | "musicbox"
  | "waves"
  | "hum"
  | "telegraph"
  | "bell"
  | "whispers"
  | "clock"
  | "gramophone"
  | "fire"
  | "pages"
  | "creak"
  | "chiptune";

export interface SpiritSound {
  /** Root of the drone chord, in Hz. */
  drone: number;
  wave: "sine" | "triangle" | "sawtooth" | "square";
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
  /** Spelled when the spirit arrives: a word or two. Board characters only. */
  openers: string[];
  /** Spelled when the sitters say goodbye. */
  farewells: string[];
}

export const SPIRITS: PublicSpirit[] = [
  {
    id: "edwina",
    name: "Edwina Vale",
    revealWords: ["EDWINA", "VALE"],
    epitaph: "Spirit medium of Brook Street, departed 1889",
    color: CANDLE_COLORS.purple,
    motion: { speed: 900, curve: 0.22, tremor: 2.5, rest: 380, wordRest: 500, overshoot: 10, hesitation: 140 },
    sound: { drone: 147, wave: "triangle", signature: "musicbox" },
    openers: ["WELCOME", "AT LAST", "DEARS"],
    farewells: ["MANNERS", "FAREWELL"],
  },
  {
    id: "silas",
    name: "Silas Crane",
    revealWords: ["SILAS", "CRANE"],
    epitaph: "Keeper of Hollow Point Light, drowned 1911",
    color: CANDLE_COLORS.green,
    motion: { speed: 700, curve: 0.16, tremor: 3.5, rest: 460, wordRest: 700, overshoot: 6, hesitation: 380 },
    sound: { drone: 110, wave: "sine", signature: "waves" },
    openers: ["AHOY", "STORM", "LAMP"],
    farewells: ["TIDE", "KEEP WATCH"],
  },
  {
    id: "pip",
    name: "Pip",
    revealWords: ["PIP"],
    epitaph: "Still hiding, since 1903",
    color: CANDLE_COLORS.orange,
    motion: { speed: 1400, curve: 0.2, tremor: 4.5, rest: 220, wordRest: 280, overshoot: 16, hesitation: 60 },
    sound: { drone: 196, wave: "triangle", signature: "hum" },
    openers: ["HEHE", "HELLO", "FOUND YOU"],
    farewells: ["TAG", "BYE BYE"],
  },
  {
    id: "ada",
    name: "Ada Quill",
    revealWords: ["ADA", "QUILL"],
    epitaph: "Telegraph operator at Dunmore Station, struck 1902",
    color: CANDLE_COLORS.red,
    motion: { speed: 1250, curve: 0.05, tremor: 1.5, rest: 260, wordRest: 320, overshoot: 4, hesitation: 90 },
    sound: { drone: 165, wave: "triangle", signature: "telegraph" },
    openers: ["RECEIVED", "LISTENING", "READY STOP"],
    farewells: ["OUT", "STOP"],
  },
  {
    id: "anselm",
    name: "Brother Anselm",
    revealWords: ["ANSELM"],
    epitaph: "Bell-ringer of St Hild's, bound to brevity, 1340",
    color: CANDLE_COLORS.red,
    motion: { speed: 450, curve: 0.08, tremor: 1.5, rest: 760, wordRest: 1000, overshoot: 2, hesitation: 500 },
    sound: { drone: 98, wave: "sine", signature: "bell" },
    openers: ["PEACE", "SPEAK", "BRIEFLY"],
    farewells: ["PEACE", "VESPERS"],
  },
  {
    id: "lune",
    name: "Lune",
    revealWords: ["LUNE"],
    epitaph: "Older than the house. Older than the town.",
    color: CANDLE_COLORS.purple,
    motion: { speed: 600, curve: 0.32, tremor: 3, rest: 520, wordRest: 760, overshoot: 8, hesitation: 300 },
    sound: { drone: 123, wave: "sine", signature: "whispers" },
    openers: ["WAITING", "AWAKE", "WARM ONES"],
    farewells: ["MOONSET", "REMEMBER"],
  },
  {
    id: "morrow",
    name: "Doctor Morrow",
    revealWords: ["MORROW"],
    epitaph: "Physician to the plague town of Saltmarsh, 1665",
    color: CANDLE_COLORS.green,
    motion: { speed: 820, curve: 0.12, tremor: 2, rest: 400, wordRest: 520, overshoot: 4, hesitation: 420 },
    sound: { drone: 131, wave: "triangle", signature: "clock" },
    openers: ["NEXT", "SYMPTOMS", "PATIENTS"],
    farewells: ["REST", "LEECHES"],
  },
  {
    id: "marguerite",
    name: "Marguerite Duval",
    revealWords: ["MARGUERITE", "DUVAL"],
    epitaph: "Torch singer of the Blue Lantern Club, last bow 1927",
    color: CANDLE_COLORS.orange,
    motion: { speed: 900, curve: 0.28, tremor: 3, rest: 340, wordRest: 480, overshoot: 12, hesitation: 160 },
    sound: { drone: 175, wave: "triangle", signature: "gramophone" },
    openers: ["DARLINGS", "HELLO", "ENCORE"],
    farewells: ["KISSES", "CURTAIN"],
  },
  {
    id: "grimsby",
    name: "Old Grimsby",
    revealWords: ["GRIMSBY"],
    epitaph: "Landlord of the Crooked Lantern Inn, 1858",
    color: CANDLE_COLORS.orange,
    motion: { speed: 1100, curve: 0.1, tremor: 3.5, rest: 320, wordRest: 600, overshoot: 10, hesitation: 250 },
    sound: { drone: 117, wave: "sawtooth", signature: "fire" },
    openers: ["CLOSED", "MUD", "WHO"],
    farewells: ["OUT", "DOOR"],
  },
  {
    id: "hazel",
    name: "Hazel Finch",
    revealWords: ["HAZEL", "FINCH"],
    epitaph: "Head librarian of the Wexley Free Library, 1974",
    color: CANDLE_COLORS.green,
    motion: { speed: 1000, curve: 0.04, tremor: 1, rest: 300, wordRest: 400, overshoot: 2, hesitation: 120 },
    sound: { drone: 156, wave: "sine", signature: "pages" },
    openers: ["SHH", "QUIET", "CLOSED"],
    farewells: ["SHH", "OVERDUE"],
  },
  {
    id: "ferro",
    name: "Captain Ferro",
    revealWords: ["FERRO"],
    epitaph: "Captain of the Red Widow, lost with all hands, 1717",
    color: CANDLE_COLORS.red,
    motion: { speed: 1050, curve: 0.3, tremor: 3, rest: 320, wordRest: 440, overshoot: 18, hesitation: 140 },
    sound: { drone: 104, wave: "sawtooth", signature: "creak" },
    openers: ["AHOY", "SWABS", "ARRR"],
    farewells: ["FAIR WINDS", "ANCHORS"],
  },
  {
    id: "kevin",
    name: "Kevin",
    revealWords: ["KEVIN"],
    epitaph: "Arcade legend of the Starlite Mall, game over 1997",
    color: CANDLE_COLORS.purple,
    motion: { speed: 1500, curve: 0.08, tremor: 2.5, rest: 220, wordRest: 280, overshoot: 12, hesitation: 50 },
    sound: { drone: 220, wave: "square", signature: "chiptune" },
    openers: ["DUDE", "WHOA", "PLAYER 2"],
    farewells: ["LATER", "GAME OVER"],
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
