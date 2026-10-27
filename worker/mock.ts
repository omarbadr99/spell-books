// Canned replies for MOCK_SPIRIT=1: lets you (and the tests) play without an
// API key. Deterministic so the Playwright suite knows what will be spelled.

import type { PublicSpirit } from "../shared/presence";
import { isYesNoQuestion } from "../shared/text";

/** How each spirit answers the sitters' greeting. */
const GREETINGS: Record<string, string> = {
  haiku: "WHO CALLS",
  sonnet: "HELLO STRANGER",
  fable: "COME CLOSER",
  opus: "WHO DARES",
};

const MUTTERINGS = ["PERHAPS", "SOON", "BEHIND", "NEVER", "CANDLES", "REMEMBER", "LATER", "WHY"];

/** `turn` is how many turns came before this one; 0 means these are the sitters' first words. */
export function mockReply(spirit: PublicSpirit, question: string, turn: number): string {
  const q = question.replace(/ /g, "");
  if (turn === 0) return GREETINGS[spirit.id] ?? "HELLO";
  if (q.includes("BYE")) return "GOODBYE";
  if (q.startsWith("WHO") || q.includes("NAME")) return spirit.revealWords[0];
  if (isYesNoQuestion(q)) return q.length % 2 === 0 ? "YES" : "NO";
  return MUTTERINGS[(q.length + turn) % MUTTERINGS.length];
}
