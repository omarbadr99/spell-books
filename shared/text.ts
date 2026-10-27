// What the board can spell. Shared by the page (to move the planchette) and the
// Worker (to clean up whatever the model or the sitters send).

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "1234567890";

/** Most words a spirit may spell. Most replies should be one word. */
export const MAX_REPLY_WORDS = 3;
/** Longest reply a spirit may spell. */
export const MAX_REPLY_CHARS = 32;
/** Longest question the sitters can spell. */
export const MAX_QUESTION_CHARS = 60;

/** Board words the planchette visits as a whole instead of spelling letter by letter. */
export const BOARD_WORDS = ["YES", "NO", "GOODBYE"] as const;
export type BoardWord = (typeof BOARD_WORDS)[number];

/**
 * One step of a spirit's reply: glide to a place on the board and add `text`
 * to the spirit's line, or pause between words.
 */
export type SpiritMove =
  | { type: "glyph"; target: string; text: string }
  | { type: "space" };

/**
 * Turns anything a model might say into something the board can spell:
 * capitals, digits and single spaces, at most MAX_REPLY_WORDS words and
 * MAX_REPLY_CHARS long. A closing GOODBYE survives the cut.
 */
export function sanitizeReply(raw: string): string {
  const words = raw
    .toUpperCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\bGOOD BYE\b/g, "GOODBYE")
    .trim()
    .split(" ")
    .filter(Boolean);

  const goodbye = words.length > 1 && words[words.length - 1] === "GOODBYE";
  const room = MAX_REPLY_WORDS - (goodbye ? 1 : 0);
  const kept: string[] = [];
  for (const word of goodbye ? words.slice(0, -1) : words) {
    if (kept.length === room || [...kept, word].join(" ").length > MAX_REPLY_CHARS - (goodbye ? 8 : 0)) break;
    kept.push(word);
  }
  if (kept.length === 0 && words.length > 0 && !goodbye) kept.push(words[0].slice(0, MAX_REPLY_CHARS));
  if (goodbye) kept.push("GOODBYE");
  return kept.join(" ");
}

/** Cleans up a question spelled by the sitters (letters, digits, spaces). */
export function sanitizeQuestion(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUESTION_CHARS)
    .trim();
}

/** The unlock word as it can be spelled on the board: letters and digits only. */
export function normalizeBoardWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** Splits a sanitized reply into planchette moves. */
export function replyToMoves(reply: string): SpiritMove[] {
  const moves: SpiritMove[] = [];
  reply
    .split(" ")
    .filter(Boolean)
    .forEach((word, i) => {
      if (i > 0) moves.push({ type: "space" });
      if ((BOARD_WORDS as readonly string[]).includes(word)) {
        moves.push({ type: "glyph", target: word, text: word });
        return;
      }
      for (const ch of word) moves.push({ type: "glyph", target: ch, text: ch });
    });
  return moves;
}

export function saysGoodbye(reply: string): boolean {
  return reply.split(" ").includes("GOODBYE");
}

/** Greetings that are words in their own right, written with each run of a letter squeezed to one (HELLO is HELO). */
const HELLOS = [
  "HELO", "HALO", "HULO", "HEY", "HEYA", "HEYO", "HIYA", "HOWDY", "HOLA", "WASUP", "WHATSUP", "GRETINGS", "WELCOME",
  "GODMORNING", "GODAFTERNON", "GODEVENING", "GODAY", "GDAY", "SALUT", "CIAO", "ALOHA", "NAMASTE", "SHALOM", "SALAM",
  "ASALAM", "MARHABA", "AHLAN", "BONJOUR", "BONSOIR", "KONICHIWA", "AHOY", "HOWAREYOU", "HOWDOYOUDO",
];
/** Short greetings that begin plenty of other words (HIDE, YOUR, OIL), so only count with nothing or a greeting's usual words after them. */
const SHORT_HELLOS = ["HI", "HAI", "HOI", "YO", "OI", "OLA", "SUP"];
const AFTER_HELLO = [
  "THERE", "EVERY", "AL", "YOU", "YA", "YAL", "SPIRIT", "GHOST", "GUYS", "FOLKS", "FRIEND", "BOARD", "IM", "IAM", "ITS",
  "ME", "WE", "AGAIN", "ANY", "SOME", "MY", "DEAR", "SIR", "MADAM", "MIS", "MR", "MS", "BRO", "MATE", "PAL", "HAIKU",
  "SONET", "FABLE", "OPUS", "HI", "HEY", "HELO", "IS", "ARE", "WHO", "CAN",
];
/** The old questions every séance opens with: IS ANYONE THERE, WHO IS HERE, SPIRITS ARE YOU WITH US. */
const PRESENCE =
  /(ANY|SOME)(ONE|BODY)(THERE|HERE|OUT|AROUND|LISTEN|AWAKE|PRESENT|WITHUS|HEAR|$)|(IS|ARE)THERE(A|ANY|SOME)?(ONE|BODY|SPIRIT|GHOST|SOUL|PRESENCE)|WHO(S|IS)?(THERE|HERE)|AREYOU(THERE|HERE|WITHUS|AWAKE|LISTENING|PRESENT)|(SPIRIT|GHOST)S?(ARE|IS)?(YOU|ANY)?(THERE|HERE|PRESENT|WITHUS)|CANYOUHEAR(ME|US)|(SPEAK|TALK)TO(ME|US)|SUMON|COMEFORTH|SHOWYOURSELF/;

/** A word as a pattern that also matches it typed with held keys: HELO matches HELLLO. */
const loosely = (word: string) => word.replace(/./g, "$&+");
const GREETING = new RegExp(
  `^(?:(?:${HELLOS.map(loosely).join("|")})|(?:${SHORT_HELLOS.map(loosely).join("|")})(?:$|${AFTER_HELLO.map(loosely).join("|")}))`,
);

/**
 * True when the sitters' words are a greeting: a hello in some language, or a
 * call into the dark like IS ANYONE THERE. Only a greeting opens a séance.
 */
export function isGreeting(text: string): boolean {
  const letters = normalizeBoardWord(text).replace(/[0-9]/g, "");
  return GREETING.test(letters) || PRESENCE.test(letters.replace(/(.)\1+/g, "$1"));
}

/** Questions that start like ARE YOU, IS IT, CAN I or WILL WE expect a YES or a NO. */
const YES_NO =
  /^(ARE|IS|AM|DO|DOES|DID|CAN|COULD|WILL|WOULD|SHOULD|SHALL|WAS|WERE|HAVE|HAS|HAD|MAY|MIGHT|MUST|WONT|CANT|DONT|DOESNT|DIDNT|ISNT|ARENT|WASNT)(YOU|U|I|WE|THEY|HE|SHE|IT|THERE|THIS|THAT|THESE|THOSE|MY|YOUR|OUR|HIS|HER|THEIR|ANY|SOME|A|AN|THE|$)/;

export function isYesNoQuestion(question: string): boolean {
  return YES_NO.test(normalizeBoardWord(question));
}

/**
 * A yes/no question gets a bare YES or NO: when the reply opens with one, the
 * rest is dropped (but a closing GOODBYE stays, since the spirit is leaving).
 */
export function preferYesNo(question: string, reply: string): string {
  const [first] = reply.split(" ");
  if (!isYesNoQuestion(question) || (first !== "YES" && first !== "NO")) return reply;
  return saysGoodbye(reply) ? `${first} GOODBYE` : first;
}

/** True when the reply names the spirit (any of its reveal words, or the whole name run together). */
export function revealsName(reply: string, revealWords: readonly string[], fullName: string): boolean {
  const words = reply.split(" ");
  if (revealWords.some((w) => words.includes(w))) return true;
  const squashedName = normalizeBoardWord(fullName);
  return squashedName.length > 0 && normalizeBoardWord(reply).includes(squashedName);
}
