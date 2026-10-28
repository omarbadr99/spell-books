// One question to the spirit: build the conversation, ask Claude on the
// spirit's model, and clean the reply into something the planchette can spell.

import Anthropic from "@anthropic-ai/sdk";
import { REFUSAL_REPLY, type Turn } from "../shared/seance";
import { preferYesNo, sanitizeReply } from "../shared/text";
import { buildSystemPrompt, conversation, type SpiritPersona } from "./spirits";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type SpiritClient = { beta: { messages: Pick<Anthropic["beta"]["messages"], "create"> } };

export const spiritClient = (apiKey: string): SpiritClient => new Anthropic({ apiKey });

/** The quick model that answers for the spirit when its own model is too slow or too busy tonight. */
export const QUICK_MODEL = "claude-haiku-5-5";
/**
 * How long the spirit may think before the quick model answers for it. Both tries
 * together stay inside the page's own 32-second wait.
 */
const PATIENCE_MS = 12_000;
export type SpiritAnswer = { kind: "reply"; reply: string } | { kind: "silent" } | { kind: "busy" };
export type Effort = "low" | "medium" | "high";

/** The smallest model has no server-side fallback; the others do. */
export const hasServerFallback = (model: string) => !model.startsWith("claude-haiku");

/** The request every question sends. The tone sampler uses it too, so tuning matches the live board. */
export function spiritRequest(model: string, persona: SpiritPersona, history: Turn[], question: string, effort: Effort = "low"): CreateParams {
  return {
    model,
    // Thinking is on by default and counts toward this; the reply itself is a few words.
    max_tokens: 4096,
    output_config: { effort },
    cache_control: { type: "ephemeral" },
    system: buildSystemPrompt(persona),
    messages: conversation(history, question),
    // If a safety classifier declines, another model answers in the same call instead.
    ...(hasServerFallback(model) && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
  };
}

/** The words to spell from a response, or "" when there are none. */
export function replyFrom(response: Anthropic.Beta.Messages.BetaMessage, history: Turn[], question: string): string {
  if (response.stop_reason === "refusal") return REFUSAL_REPLY;
  const text = response.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ");
  const reply = sanitizeReply(text);
  // The greeting's reply may run to a few words; after that, a yes/no question gets a bare YES or NO.
  return history.length ? preferYesNo(question, reply) : reply;
}

export async function askSpirit(
  client: SpiritClient,
  model: string,
  persona: SpiritPersona,
  history: Turn[],
  question: string,
): Promise<SpiritAnswer> {
  try {
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await client.beta.messages.create(spiritRequest(model, persona, history, question), {
        timeout: PATIENCE_MS,
        maxRetries: 0,
      });
    } catch (error) {
      const slowOrBusy = error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.InternalServerError;
      if (model === QUICK_MODEL || !slowOrBusy) throw error;
      // A quicker voice answers for the spirit rather than leave the sitters waiting.
      console.warn(`${model} was too slow or busy; the quick model answered instead.`);
      response = await client.beta.messages.create(spiritRequest(QUICK_MODEL, persona, history, question), {
        timeout: PATIENCE_MS,
        maxRetries: 0,
      });
    }
    const reply = replyFrom(response, history, question);
    return reply ? { kind: "reply", reply } : { kind: "silent" };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { kind: "busy" };
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude rejected the API key; check ANTHROPIC_API_KEY.");
      return { kind: "silent" };
    }
    if (error instanceof Anthropic.BadRequestError && /retention/i.test(error.message)) {
      console.error(`${model} needs 30-day data retention on your Anthropic organization:`, error.message);
      return { kind: "silent" };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      console.error("Could not reach Claude:", error.message);
      return { kind: "silent" };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status} on ${model}:`, error.message);
      return { kind: "silent" };
    }
    throw error;
  }
}
