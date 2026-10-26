// Canned replies for MOCK_SPIRIT=1: lets you (and the tests) play without an
// API key. Deterministic so the Playwright suite knows what will be spelled.

import type { PublicSpirit } from "../shared/presence";

const YES_NO = /^(ARE|IS|AM|DO|DOES|DID|CAN|COULD|WILL|WOULD|SHOULD|WAS|WERE|HAVE|HAS)/;

const MUTTERINGS = [
  "PERHAPS",
  "ASK AGAIN",
  "BEHIND YOU",
  "NOT YET",
  "THE CANDLE KNOWS",
  "SOON",
  "I REMEMBER",
  "WHO TOLD YOU?",
];

export function mockReply(spirit: PublicSpirit, question: string, turn: number): string {
  const q = question.replace(/ /g, "");
  if (q.includes("BYE")) return "GOODBYE";
  if (q.startsWith("WHO") || q.includes("NAME")) return spirit.name.toUpperCase();
  if (YES_NO.test(q)) return q.length % 2 === 0 ? "YES" : "NO";
  return MUTTERINGS[(q.length + turn) % MUTTERINGS.length];
}
