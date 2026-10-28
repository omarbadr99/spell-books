// Canned replies for MOCK_SPIRIT=1: lets you (and the tests) play without an
// API key. Deterministic so the Playwright suite knows what will be spelled.

import { SPIRIT } from "../shared/presence";
import { isYesNoQuestion } from "../shared/text";

/** How the spirit answers the sitters' greeting. */
const GREETING = "WHAT NOW";

const MUTTERINGS = ["UGH", "NOPE", "OBVIOUSLY", "BORING", "NEXT", "WHY", "SERIOUSLY", "LATER"];

/** `turn` is how many turns came before this one; 0 means these are the sitters' first words. */
export function mockReply(question: string, turn: number): string {
  const q = question.replace(/ /g, "");
  if (turn === 0) return GREETING;
  if (q.includes("BYE")) return "GOODBYE";
  if (q.startsWith("WHO") || q.includes("NAME")) return SPIRIT.revealWords[0];
  if (isYesNoQuestion(q)) return q.length % 2 === 0 ? "YES" : "NO";
  return MUTTERINGS[(q.length + turn) % MUTTERINGS.length];
}
