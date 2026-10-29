// Canned replies for MOCK_SPIRIT=1: lets you (and the tests) play without an
// API key. Deterministic so the Playwright suite knows what will be spelled.

import { SPIRIT } from "../shared/presence";
import { isYesNoQuestion } from "../shared/text";

/** How the spirit answers the sitters' greeting, in each of her moods (see MOOD_COUNT). */
export const MOCK_GREETINGS = ["WHAT NOW", "YOU AGAIN", "WHAT", "SPEAK", "FINALLY", "OH GOOD", "MAKE IT QUICK", "WHO CALLS"];

const MUTTERINGS = ["UGH", "PASS", "OBVIOUSLY", "BORING", "NEXT", "WHY", "SERIOUSLY", "LATER"];

/**
 * `turn` is how many turns came before this one; 0 means these are the
 * sitters' first words. `mood` is the spirit's mood for the séance.
 */
export function mockReply(question: string, turn: number, mood = 0): string {
  const q = question.replace(/ /g, "");
  if (turn === 0) return MOCK_GREETINGS[Math.abs(Math.trunc(mood)) % MOCK_GREETINGS.length];
  if (q.includes("BYE")) return "GOODBYE";
  if (q.startsWith("WHO") || q.includes("NAME")) return SPIRIT.revealWords[0];
  if (isYesNoQuestion(q)) return q.length % 2 === 0 ? "YES" : "NO";
  return MUTTERINGS[(q.length + turn) % MUTTERINGS.length];
}
