// The board's calls when it runs as a claude.ai artifact (npm run build:artifact):
// there is no Worker, so the lock is kept in this browser and the spirits
// answer through the viewer's own Claude, via the artifact's `sample` capability.

import { spiritById } from "../../shared/presence";
import { REFUSAL_REPLY } from "../../shared/seance";
import { normalizeBoardWord, sanitizeReply } from "../../shared/text";
import { mockReply } from "../../worker/mock";
import { buildSystemPrompt, personaFor } from "../../worker/spirits";
import type { AskBody, AskResult, EnterResult, SeatState } from "../api";

const BOARD_WORD = "OWL";
export const LOCK_HINT = `The board answers only to those who know the word. In this preview, the word is ${BOARD_WORD}.`;
const SEAT_KEY = "spirit-board:seat";
const SEAT_MS = 30 * 24 * 60 * 60 * 1000;

type Turn = { role: "user" | "assistant"; content: string };
type Sample = (
  input: string | Turn[],
  options?: { model?: string; modelTier?: "quick" | "default" | "complex"; effort?: "low" | "medium" | "high"; cache?: boolean },
) => Promise<{ text: string; truncated: boolean }>;

declare global {
  interface Window {
    claude?: { use(name: "sample"): Promise<Sample | null> };
  }
}

const samplePromise: Promise<Sample | null> = window.claude?.use("sample").catch(() => null) ?? Promise.resolve(null);
let canned = false;

export async function checkSeat(): Promise<SeatState> {
  try {
    return Number(localStorage.getItem(SEAT_KEY)) > Date.now() ? "seated" : "locked";
  } catch {
    return "locked";
  }
}

export async function enter(word: string): Promise<EnterResult> {
  if (normalizeBoardWord(word) !== BOARD_WORD) return "wrong";
  try {
    localStorage.setItem(SEAT_KEY, String(Date.now() + SEAT_MS));
  } catch {
    // Not remembered; the board asks again next visit.
  }
  return "ok";
}

export async function ask(body: AskBody): Promise<AskResult> {
  const spirit = spiritById(body.spiritId);
  const persona = personaFor(body.spiritId);
  if (!spirit || !persona) return { error: "silent" };

  const sample = canned ? null : await samplePromise;
  if (!sample) {
    return {
      reply: mockReply(spirit, body.question, body.history.length),
      note: "Claude isn't connected here, so the spirits are using canned replies.",
    };
  }

  const opener = spirit.openers[body.openerIndex] ?? spirit.openers[0];
  const rules =
    `${buildSystemPrompt(persona)}\n\nThe séance has begun. You opened it by spelling: ${opener}\n` +
    "Every message after this one is the sitters' next question as spelled on the board. " +
    "Reply with only the words the planchette should spell.";
  const input: Turn[] = [
    { role: "user", content: rules },
    ...body.history.map((t): Turn => ({ role: t.from === "sitters" ? "user" : "assistant", content: t.text })),
    { role: "user", content: body.question },
  ];

  try {
    const { text } = await sample(input, { model: "claude-haiku-5-5", modelTier: "quick", effort: "low", cache: false });
    const reply = sanitizeReply(text);
    return reply ? { reply } : { error: "silent" };
  } catch (error) {
    switch ((error as { code?: string } | null)?.code) {
      case "rate_limited":
        return { error: "slow" };
      case "refused":
        return { reply: REFUSAL_REPLY };
      case "not_granted":
      case "sampling_disabled":
      case "not_declared":
      case "capability_disabled":
      case "capability_removed":
        canned = true;
        return {
          reply: mockReply(spirit, body.question, body.history.length),
          note: "Claude isn't allowed for this board, so the spirits are using canned replies.",
        };
      default:
        return { error: "silent" };
    }
  }
}
