// What the board can spell. Shared by the page (to move the planchette) and the
// Worker (to clean up whatever the model or the sitters send).

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DIGITS = "1234567890";

/** Longest reply a spirit may spell. Longer replies are cut at a word boundary. */
export const MAX_REPLY_CHARS = 48;
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

const GOODBYE_PATTERN = /\bGOOD ?BYE\b\??/g;

/**
 * Turns anything a model might say into something the board can spell:
 * capitals, digits, single spaces and an optional "?" after a word, at most
 * MAX_REPLY_CHARS long. A closing GOODBYE survives truncation.
 */
export function sanitizeReply(raw: string): string {
  let text = raw
    .toUpperCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^A-Z0-9?]+/g, " ")
    .replace(/(^|\s)\?+/g, "$1")
    .replace(/\?+/g, "?")
    .replace(/\?(?=[A-Z0-9])/g, "? ")
    .replace(GOODBYE_PATTERN, "GOODBYE")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= MAX_REPLY_CHARS) return text;

  const endsWithGoodbye = text.endsWith(" GOODBYE");
  if (endsWithGoodbye) text = text.slice(0, -" GOODBYE".length);
  const limit = MAX_REPLY_CHARS - (endsWithGoodbye ? " GOODBYE".length : 0);
  if (text.length > limit) {
    const cut = text.lastIndexOf(" ", limit);
    text = cut > 0 ? text.slice(0, cut) : text.slice(0, limit);
  }
  return endsWithGoodbye ? `${text} GOODBYE` : text;
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
      for (const ch of word) {
        moves.push({ type: "glyph", target: ch === "?" ? "ASK" : ch, text: ch });
      }
    });
  return moves;
}

export function saysGoodbye(reply: string): boolean {
  return reply.split(" ").includes("GOODBYE");
}

/** True when the reply names the spirit (any of its reveal words, or the whole name run together). */
export function revealsName(reply: string, revealWords: readonly string[], fullName: string): boolean {
  const words = reply.split(" ");
  if (revealWords.some((w) => words.includes(w))) return true;
  const squashedName = normalizeBoardWord(fullName);
  return squashedName.length > 0 && normalizeBoardWord(reply).includes(squashedName);
}
