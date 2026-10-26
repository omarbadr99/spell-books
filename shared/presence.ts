// The public side of each spirit: how it looks, moves and sounds, plus the
// lines it spells on arrival and departure. The page uses this directly; the
// Worker keeps each spirit's voice and secrets in worker/spirits.ts.

/** Signature motion habits, applied by src/planchette/possess.ts. */
export type Tic =
  | "flourish" // sweeping arcs that swing slightly past the letter
  | "listen" // stops halfway, as if listening to the sea
  | "feint" // darts to a wrong letter first, then backs off
  | "tap" // taps the letter like a telegraph key
  | "heavy" // slow, deliberate, no hurry
  | "spiral" // circles the letter before settling
  | "hesitate" // stops just short, then commits
  | "sway" // swings in time, like dancing
  | "jerk" // lurches off and stops dead
  | "precise" // neat straight lines
  | "swagger" // big swooping curves
  | "glitch"; // sometimes skips straight to the letter

export interface MotionStyle {
  /** Gliding speed in board units per second. */
  speed: number;
  /** 0 = straight lines, ~0.45 = generous arcs. */
  curve: number;
  /** Sideways tremble while moving, in board units. */
  wobble: number;
  wobbleHz: number;
  /** How long the glass lingers on each glyph, in ms. */
  rest: number;
  /** Pause between words, in ms. */
  wordRest: number;
  /** 0 = stops cleanly; higher swings past the glyph and settles back. */
  overshoot: number;
  tic: Tic;
  /** Chance per glyph that the tic shows. */
  ticChance: number;
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

export interface PublicSpirit {
  id: string;
  /** Engraved on the brass plate once the spirit spells it. */
  name: string;
  /** Words in a reply that count as the spirit giving its name. */
  revealWords: string[];
  epitaph: string;
  /** Candle, glow and fog color. */
  color: string;
  /** Stroke-only SVG path in a 100×100 box centred on 0,0. */
  sigil: string;
  motion: MotionStyle;
  sound: SpiritSound;
  /** Spelled when the spirit arrives. Board characters only. */
  openers: string[];
  /** Spelled when the sitters say goodbye. */
  farewells: string[];
}

const circle = (cx: number, cy: number, r: number) =>
  `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;

export const SPIRITS: PublicSpirit[] = [
  {
    id: "edwina",
    name: "Edwina Vale",
    revealWords: ["EDWINA", "VALE"],
    epitaph: "Spirit medium of Brook Street, departed 1889",
    color: "#b892ff",
    sigil: [
      "M 30 -34 A 44 44 0 1 0 30 34 A 34 34 0 1 1 30 -34",
      "M -2 0 Q 18 -16 38 0 Q 18 16 -2 0 Z",
      circle(18, 0, 6),
    ].join(" "),
    motion: { speed: 1040, curve: 0.32, wobble: 6, wobbleHz: 1.4, rest: 340, wordRest: 420, overshoot: 1.2, tic: "flourish", ticChance: 0.3 },
    sound: { drone: 147, wave: "triangle", signature: "musicbox" },
    openers: ["WHO DARES SIT AT MY TABLE", "AT LAST A PROPER CIRCLE", "FINGERS LIGHTLY DEARS"],
    farewells: ["MIND YOUR MANNERS", "UNTIL THE NEXT SITTING", "GOOD EVENING DEARS"],
  },
  {
    id: "silas",
    name: "Silas Crane",
    revealWords: ["SILAS", "CRANE"],
    epitaph: "Keeper of Hollow Point Light, drowned 1911",
    color: "#4fd8c4",
    sigil: [
      "M -14 34 L -9 -14 L 9 -14 L 14 34",
      "M -11 -14 L -11 -26 L 11 -26 L 11 -14",
      "M -13 -26 L 0 -36 L 13 -26",
      "M -15 -22 L -42 -32 M -15 -18 L -42 -10 M 15 -22 L 42 -32 M 15 -18 L 42 -10",
      "M -12 6 L 12 6 M -13 20 L 13 20",
      "M -44 42 Q -33 35 -22 42 Q -11 49 0 42 Q 11 35 22 42 Q 33 49 44 42",
    ].join(" "),
    motion: { speed: 800, curve: 0.22, wobble: 9, wobbleHz: 0.6, rest: 420, wordRest: 640, overshoot: 0, tic: "listen", ticChance: 0.3 },
    sound: { drone: 110, wave: "sine", signature: "waves" },
    openers: ["IS THE LAMP LIT", "WHO RINGS THE BELL", "STORM COMING"],
    farewells: ["KEEP THE LIGHT", "THE TIDE CALLS ME", "MIND THE ROCKS"],
  },
  {
    id: "pip",
    name: "Pip",
    revealWords: ["PIP"],
    epitaph: "Still hiding, since 1903",
    color: "#ffd166",
    sigil: [
      "M 0 38 L -26 4 Q -28 -6 -18 -10 L 18 -10 Q 28 -6 26 4 Z",
      "M -4 -10 L -4 -26 L 4 -26 L 4 -10",
      "M -25 0 L 25 0",
      "M -40 -4 Q -45 10 -36 22 M 40 -4 Q 45 10 36 22",
      "M -14 46 L 14 46",
    ].join(" "),
    motion: { speed: 1720, curve: 0.3, wobble: 14, wobbleHz: 3.5, rest: 190, wordRest: 240, overshoot: 1.4, tic: "feint", ticChance: 0.35 },
    sound: { drone: 196, wave: "triangle", signature: "hum" },
    openers: ["HEHE HELLO", "PLAY WITH ME?", "FOUND YOU"],
    farewells: ["TAG YOU ARE IT", "BYE BYE", "COUNT TO 100"],
  },
  {
    id: "ada",
    name: "Ada Quill",
    revealWords: ["ADA", "QUILL"],
    epitaph: "Telegraph operator at Dunmore Station, struck 1902",
    color: "#6cb8ff",
    sigil: [
      "M -46 -14 Q 0 -2 46 -14",
      "M -40 -26 L -40 42 M 40 -26 L 40 42",
      "M -48 -22 L -32 -22 M 32 -22 L 48 -22",
      "M 6 -44 L -10 -2 L 4 -2 L -8 40 L 16 -8 L 2 -8 L 14 -44 Z",
    ].join(" "),
    motion: { speed: 1490, curve: 0.04, wobble: 2, wobbleHz: 8, rest: 240, wordRest: 290, overshoot: 0, tic: "tap", ticChance: 0.6 },
    sound: { drone: 165, wave: "triangle", signature: "telegraph" },
    openers: ["LINE OPEN STOP", "MESSAGE RECEIVED STOP", "WHO IS SENDING STOP"],
    farewells: ["LINE CLOSED STOP", "END TRANSMISSION", "OVER AND OUT STOP"],
  },
  {
    id: "anselm",
    name: "Brother Anselm",
    revealWords: ["ANSELM"],
    epitaph: "Bell-ringer of St Hild's, bound to brevity, 1340",
    color: "#f3e3bf",
    sigil: [
      "M -30 24 Q -28 -6 -20 -14 Q -12 -26 0 -26 Q 12 -26 20 -14 Q 28 -6 30 24 Z",
      "M -38 24 L 38 24",
      "M 0 24 L 0 32",
      circle(0, 37, 5),
      "M 0 -26 L 0 -46 M -8 -38 L 8 -38",
    ].join(" "),
    motion: { speed: 480, curve: 0.08, wobble: 3, wobbleHz: 0.5, rest: 720, wordRest: 960, overshoot: 0, tic: "heavy", ticChance: 1 },
    sound: { drone: 98, wave: "sine", signature: "bell" },
    openers: ["PEACE", "WHO RINGS", "SPEAK BRIEFLY"],
    farewells: ["PEACE BE", "VESPERS", "SILENCE NOW"],
  },
  {
    id: "lune",
    name: "Lune",
    revealWords: ["LUNE"],
    epitaph: "Older than the house. Older than the town.",
    color: "#cdd6ff",
    sigil: [
      circle(0, 0, 44),
      circle(0, 0, 30),
      "M 8 -18 A 20 20 0 1 0 8 18 A 15 15 0 1 1 8 -18",
      circle(0, -37, 2.5),
      circle(37, 0, 2.5),
      circle(0, 37, 2.5),
      circle(-37, 0, 2.5),
    ].join(" "),
    motion: { speed: 690, curve: 0.45, wobble: 10, wobbleHz: 0.8, rest: 480, wordRest: 720, overshoot: 0.4, tic: "spiral", ticChance: 0.4 },
    sound: { drone: 123, wave: "sine", signature: "whispers" },
    openers: ["I WAS WAITING", "SMALL WARM ONES", "YOU WOKE THE DARK"],
    farewells: ["THE MOON TURNS", "UNTIL THE NEXT DARK", "I WILL REMEMBER YOU"],
  },
  {
    id: "morrow",
    name: "Doctor Morrow",
    revealWords: ["MORROW"],
    epitaph: "Physician to the plague town of Saltmarsh, 1665",
    color: "#c6dd5c",
    sigil: [
      "M -42 -20 L 22 -20",
      "M -30 -20 L -26 -44 L 6 -44 L 10 -20",
      "M -26 -20 Q -36 2 -22 24 Q -6 32 2 20",
      "M 6 -18 Q 30 -4 48 28 Q 24 22 2 20",
      circle(-6, -6, 7),
    ].join(" "),
    motion: { speed: 920, curve: 0.18, wobble: 4, wobbleHz: 1, rest: 380, wordRest: 480, overshoot: 0, tic: "hesitate", ticChance: 0.4 },
    sound: { drone: 131, wave: "triangle", signature: "clock" },
    openers: ["WHO IS UNWELL", "OPEN WIDE", "NEXT PATIENT"],
    farewells: ["TAKE TWO LEECHES", "REST AND DRINK WATER", "THE DOCTOR IS OUT"],
  },
  {
    id: "marguerite",
    name: "Marguerite Duval",
    revealWords: ["MARGUERITE", "DUVAL"],
    epitaph: "Torch singer of the Blue Lantern Club, last bow 1927",
    color: "#ff80b5",
    sigil: [
      "M 0 -6 Q 6 -10 8 -4 Q 10 4 0 6 Q -10 6 -10 -4 Q -10 -16 2 -18 Q 16 -18 18 -4 Q 20 12 2 16 Q -18 18 -20 0",
      "M -20 0 Q -26 -22 -6 -28 Q 10 -34 22 -20 Q 30 -6 24 10 Q 16 26 0 24",
      "M 0 24 Q -4 36 2 48",
      "M -1 38 Q -16 32 -22 42 Q -12 48 -1 40 M 1 32 Q 14 24 22 32 Q 14 40 1 34",
    ].join(" "),
    motion: { speed: 980, curve: 0.35, wobble: 12, wobbleHz: 1.1, rest: 320, wordRest: 450, overshoot: 0.8, tic: "sway", ticChance: 0.5 },
    sound: { drone: 175, wave: "triangle", signature: "gramophone" },
    openers: ["HELLO DARLINGS", "WHO WANTS A SONG", "LIGHTS LOWER PLEASE"],
    farewells: ["KISSES DARLINGS", "CURTAIN CALL", "SAVE ME A DANCE"],
  },
  {
    id: "grimsby",
    name: "Old Grimsby",
    revealWords: ["GRIMSBY"],
    epitaph: "Landlord of the Crooked Lantern Inn, 1858",
    color: "#ff8c42",
    sigil: [
      "M -6 -40 A 6 6 0 1 1 6 -40",
      "M -16 -30 L 16 -30 L 10 -40 L -10 -40 Z",
      "M -18 -30 L -18 26 M 18 -30 L 18 26 M -6 -30 L -6 26 M 6 -30 L 6 26",
      "M 0 12 Q -9 2 0 -14 Q 9 2 0 12 Z",
      "M -22 26 L 22 26 L 16 36 L -16 36 Z",
    ].join(" "),
    motion: { speed: 1260, curve: 0.1, wobble: 5, wobbleHz: 2, rest: 300, wordRest: 560, overshoot: 0, tic: "jerk", ticChance: 0.5 },
    sound: { drone: 117, wave: "sawtooth", signature: "fire" },
    openers: ["WHO TRACKED MUD IN", "WE ARE CLOSED", "WIPE YOUR FEET"],
    farewells: ["AND STAY OUT", "MIND THE DOOR", "ROOMS ARE FULL"],
  },
  {
    id: "hazel",
    name: "Hazel Finch",
    revealWords: ["HAZEL", "FINCH"],
    epitaph: "Head librarian of the Wexley Free Library, 1974",
    color: "#5fd38d",
    sigil: [
      "M 0 -20 Q -20 -30 -44 -24 L -44 26 Q -20 20 0 30 Q 20 20 44 26 L 44 -24 Q 20 -30 0 -20 Z M 0 -20 L 0 30",
      "M -36 -12 Q -20 -16 -8 -10 M -36 2 Q -20 -2 -8 4 M 8 -10 Q 20 -16 36 -12 M 8 4 Q 20 -2 36 2",
      "M 14 27 L 14 46 L 20 40 L 26 46 L 26 25",
    ].join(" "),
    motion: { speed: 1150, curve: 0.02, wobble: 1, wobbleHz: 1, rest: 290, wordRest: 380, overshoot: 0, tic: "precise", ticChance: 1 },
    sound: { drone: 156, wave: "sine", signature: "pages" },
    openers: ["SHH WHO IS THERE", "QUIET PLEASE", "THE LIBRARY IS CLOSED"],
    farewells: ["RETURN ON TIME", "SHH GOODNIGHT", "MIND THE FINES"],
  },
  {
    id: "ferro",
    name: "Captain Ferro",
    revealWords: ["FERRO"],
    epitaph: "Captain of the Red Widow, lost with all hands, 1717",
    color: "#ff5a5f",
    sigil: [
      circle(0, 0, 38),
      "M 0 -48 L 8 -8 L 48 0 L 8 8 L 0 48 L -8 8 L -48 0 L -8 -8 Z",
      "M -24 -24 L 24 24 M 24 -24 L -24 24",
    ].join(" "),
    motion: { speed: 1150, curve: 0.42, wobble: 10, wobbleHz: 0.9, rest: 300, wordRest: 420, overshoot: 1.6, tic: "swagger", ticChance: 0.4 },
    sound: { drone: 104, wave: "sawtooth", signature: "creak" },
    openers: ["AHOY SWABS", "WHO WAKES THE CAPTAIN", "ALL HANDS ON DECK"],
    farewells: ["FAIR WINDS", "DEAD MEN TELL NO TALES", "X MARKS NOTHING"],
  },
  {
    id: "kevin",
    name: "Kevin",
    revealWords: ["KEVIN"],
    epitaph: "Arcade legend of the Starlite Mall, game over 1997",
    color: "#ff4df0",
    sigil: [
      "M -36 20 L 36 20 L 30 40 L -30 40 Z",
      "M 0 20 L 10 -12",
      circle(12, -22, 10),
      circle(-24, 12, 4),
      circle(24, 12, 4),
      "M -42 -32 L -36 -32 L -36 -26 L -42 -26 Z M 34 -44 L 40 -44 L 40 -38 L 34 -38 Z M -30 -46 L -26 -46 L -26 -42 L -30 -42 Z",
    ].join(" "),
    motion: { speed: 1840, curve: 0.05, wobble: 3, wobbleHz: 6, rest: 210, wordRest: 260, overshoot: 0, tic: "glitch", ticChance: 0.3 },
    sound: { drone: 220, wave: "square", signature: "chiptune" },
    openers: ["PLAYER 2 HAS JOINED", "INSERT COIN", "WHOA REAL HUMANS"],
    farewells: ["GAME OVER", "LATER DUDES", "SAVE MY HIGH SCORE"],
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
