// The board's calls when it runs as a claude.ai artifact (npm run build:artifact):
// there is no Worker and no lock (the link is already private), and the spirit
// answers through the viewer's own Claude, via the artifact's `sample`
// capability. It asks for the spirit's own model; if that one isn't available
// here, the call falls back to a model of the same size, and if it is slow to
// answer, a quick one answers for it so the séance never stalls.

import { REFUSAL_REPLY } from "../../shared/seance";
import { asksToSeeSpirit, preferYesNo, sanitizeReply } from "../../shared/text";
import { mockReply } from "../../worker/mock";
import { buildSystemPrompt, conversation, PERSONA } from "../../worker/spirits";
import type { AskBody, AskResult, EnterResult, SeatState } from "../api";

type Tier = "quick" | "default" | "complex";
type Input = string | { role: "user" | "assistant"; content: string }[];
interface SampleOptions {
  model?: string;
  modelTier?: Tier;
  effort?: "low" | "medium" | "high";
  cache?: boolean;
  signal?: AbortSignal;
}
type Sample = (input: Input, options?: SampleOptions) => Promise<{ text: string; truncated: boolean }>;
type PermissionState = "granted" | "prompt" | "denied" | "unavailable";
interface Permissions {
  state(name: string): Promise<PermissionState>;
  request(names?: readonly string[]): Promise<Record<string, PermissionState>>;
}

declare global {
  interface Window {
    claude?: {
      use(name: "sample"): Promise<Sample | null>;
      use(name: "permissions"): Promise<Permissions | null>;
    };
  }
}

/** How long the spirit may think before a quicker voice answers for it. */
const PATIENCE_MS = 9_000;

const samplePromise: Promise<Sample | null> = window.claude?.use("sample").catch(() => null) ?? Promise.resolve(null);
const permissionsPromise: Promise<Permissions | null> =
  window.claude?.use("permissions").catch(() => null) ?? Promise.resolve(null);
let canned = false;

/**
 * Asks the viewer, up front, to let the spirit answer through their Claude.
 * Called from START, so the question comes before the séance does instead of
 * in the middle of a greeting.
 */
export async function prepare(): Promise<void> {
  const permissions = await permissionsPromise;
  await permissions?.request(["sample"]).catch(() => undefined);
}

/** Runs one call, cut off after `ms` (if given). */
async function within(sample: Sample, input: Input, options: SampleOptions, ms: number | null): Promise<string> {
  const ctl = new AbortController();
  const timer = ms === null ? 0 : window.setTimeout(() => ctl.abort(), ms);
  try {
    return (await sample(input, { ...options, signal: ctl.signal })).text;
  } finally {
    clearTimeout(timer);
  }
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

export async function checkSeat(): Promise<SeatState> {
  return "seated";
}

export async function enter(): Promise<EnterResult> {
  return "ok";
}

export async function ask(body: AskBody): Promise<AskResult> {
  // Nobody sees the spirit: asked to, she leaves.
  if (body.history.length && asksToSeeSpirit(body.question)) return { reply: "GOODBYE" };
  const sample = canned ? null : await samplePromise;
  if (!sample) {
    return {
      reply: mockReply(body.question, body.history.length, body.mood),
      note: "Claude isn't connected here, so the spirit is using canned replies.",
    };
  }

  // There is no system prompt here, so the spirit's rules lead the first message.
  const rules = `${buildSystemPrompt(PERSONA)}\n\nEvery message from the sitters is spelled on the board. Reply with only the words the planchette should spell.`;
  const input = conversation(body.history, body.question, body.mood).map((line, i) =>
    i === 0 ? { ...line, content: `${rules}\n\n${line.content}` } : line,
  );

  // While the viewer is still deciding whether to allow Claude, wait as long as they take.
  const deciding = (await (await permissionsPromise)?.state("sample").catch(() => null)) === "prompt";
  try {
    let text: string;
    try {
      const own = { model: PERSONA.model, modelTier: "complex", effort: "low", cache: false } as const;
      text = await within(sample, input, own, deciding ? null : PATIENCE_MS);
    } catch (error) {
      if (codeOf(error) !== "cancelled") throw error;
      // The spirit's own model is slow tonight: a quicker voice answers for it.
      text = await within(sample, input, { modelTier: "quick", effort: "low", cache: false }, 12_000);
    }
    const reply = sanitizeReply(text);
    if (!reply) return { error: "silent" };
    return { reply: body.history.length ? preferYesNo(body.question, reply) : reply };
  } catch (error) {
    switch (codeOf(error)) {
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
          reply: mockReply(body.question, body.history.length, body.mood),
          note: "Claude isn't allowed for this board, so the spirit is using canned replies.",
        };
      default:
        return { error: "silent" };
    }
  }
}
