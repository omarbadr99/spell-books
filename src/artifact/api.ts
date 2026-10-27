// The board's calls when it runs as a claude.ai artifact (npm run build:artifact):
// there is no Worker and no lock (the link is already private), and the spirits
// answer through the viewer's own Claude, via the artifact's `sample` capability.
// Each spirit asks for its namesake model; if that one isn't available here, the
// call falls back to a model of a similar size.

import { spiritById } from "../../shared/presence";
import { REFUSAL_REPLY } from "../../shared/seance";
import { preferYesNo, sanitizeReply } from "../../shared/text";
import { mockReply } from "../../worker/mock";
import { buildSystemPrompt, conversation, personaFor } from "../../worker/spirits";
import type { AskBody, AskResult, EnterResult, SeatState } from "../api";

type Tier = "quick" | "default" | "complex";
type Sample = (
  input: string | { role: "user" | "assistant"; content: string }[],
  options?: { model?: string; modelTier?: Tier; effort?: "low" | "medium" | "high"; cache?: boolean },
) => Promise<{ text: string; truncated: boolean }>;

declare global {
  interface Window {
    claude?: { use(name: "sample"): Promise<Sample | null> };
  }
}

/** The size of model to fall back to when a spirit's own model can't be used. */
const TIERS: Record<string, Tier> = { haiku: "quick", sonnet: "default", fable: "complex", opus: "complex" };

const samplePromise: Promise<Sample | null> = window.claude?.use("sample").catch(() => null) ?? Promise.resolve(null);
let canned = false;

export async function checkSeat(): Promise<SeatState> {
  return "seated";
}

export async function enter(): Promise<EnterResult> {
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

  // There is no system prompt here, so the spirit's rules lead the first message.
  const rules = `${buildSystemPrompt(persona)}\n\nEvery message from the sitters is spelled on the board. Reply with only the words the planchette should spell.`;
  const input = conversation(body.history, body.question).map((line, i) =>
    i === 0 ? { ...line, content: `${rules}\n\n${line.content}` } : line,
  );

  try {
    const { text } = await sample(input, { model: persona.model, modelTier: TIERS[spirit.id], effort: "low", cache: false });
    const reply = sanitizeReply(text);
    if (!reply) return { error: "silent" };
    return { reply: body.history.length ? preferYesNo(body.question, reply) : reply };
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
