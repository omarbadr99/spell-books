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

/** True when the reply names the spirit (any of its reveal words, or the whole name run together). */
export function revealsName(reply: string, revealWords: readonly string[], fullName: string): boolean {
  const words = reply.split(" ");
  if (revealWords.some((w) => words.includes(w))) return true;
  const squashedName = normalizeBoardWord(fullName);
  return squashedName.length > 0 && normalizeBoardWord(reply).includes(squashedName);
}
