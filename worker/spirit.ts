// One question to one spirit: build the conversation, ask Claude, and clean the
// reply into something the planchette can spell.

import Anthropic from "@anthropic-ai/sdk";
import { REFUSAL_REPLY, type Turn } from "../shared/seance";
import { sanitizeReply } from "../shared/text";
import { buildSystemPrompt, seanceStart, type SpiritPersona } from "./spirits";

export type SpiritAnswer = { kind: "reply"; reply: string } | { kind: "silent" } | { kind: "busy" };

export function buildMessages(opener: string, history: Turn[], question: string, greeting = ""): Anthropic.MessageParam[] {
  return [
    { role: "user", content: seanceStart(greeting) },
    { role: "assistant", content: opener },
    ...history.map((turn): Anthropic.MessageParam => ({
      role: turn.from === "sitters" ? "user" : "assistant",
      content: turn.text,
    })),
    { role: "user", content: question },
  ];
}

export type Effort = NonNullable<Anthropic.OutputConfig["effort"]>;

/** The request every question sends. The tone sampler uses it too, so tuning matches the live board. */
export function spiritRequest(
  model: string,
  persona: SpiritPersona,
  messages: Anthropic.MessageParam[],
  effort: Effort = "low",
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    // Thinking is on by default and counts toward this; the reply itself is a few words.
    max_tokens: 1024,
    output_config: { effort },
    cache_control: { type: "ephemeral" },
    system: buildSystemPrompt(persona),
    messages,
  };
}

export async function askSpirit(
  client: Pick<Anthropic, "messages">,
  model: string,
  persona: SpiritPersona,
  messages: Anthropic.MessageParam[],
): Promise<SpiritAnswer> {
  try {
    const response = await client.messages.create(spiritRequest(model, persona, messages));
    if (response.stop_reason === "refusal") return { kind: "reply", reply: REFUSAL_REPLY };
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join(" ");
    const reply = sanitizeReply(text);
    return reply ? { kind: "reply", reply } : { kind: "silent" };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { kind: "busy" };
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude rejected the API key; check ANTHROPIC_API_KEY.");
      return { kind: "silent" };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      console.error("Could not reach Claude:", error.message);
      return { kind: "silent" };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}:`, error.message);
      return { kind: "silent" };
    }
    throw error;
  }
}
