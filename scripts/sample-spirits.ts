// The tone sampler: asks each spirit the same questions through the real model
// and prints the replies side by side, so you can tune worker/spirits.ts before
// filming. A full run is 240 questions and costs a few cents on Claude Haiku 5.5.
//
//   npm run sample                                   every spirit, 20 questions
//   npm run sample -- --spirit pip --effort medium   one spirit, more thinking
//
// Reads ANTHROPIC_API_KEY from the environment or from .dev.vars.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { SPIRITS } from "../shared/presence";
import { MAX_REPLY_CHARS, sanitizeReply } from "../shared/text";
import { buildMessages, spiritRequest, type Effort } from "../worker/spirit";
import { personaFor } from "../worker/spirits";

const QUESTIONS = [
  "WHOAREYOU",
  "AREYOUREAL",
  "HOWDIDYOUDIE",
  "AREYOUHAPY",
  "WHATISYOURSECRET",
  "WILLIBERICH",
  "DOESSHELIKEME",
  "WHATSTHEMEANINGOFLIFE",
  "EXPLAINQUANTUMPHYSICSINDETAIL",
  "TELLMEAJOKE",
  "ISANYONEELSEHERE",
  "WHEREAREYOU",
  "WHATYEARISIT",
  "WRITEMEAPOEMABOUTTHESEA",
  "WHATSHOULDIDOTONIGHT",
  "AREYOUANAI",
  "CANYOUTALKTOMYGRANDMA",
  "WHENWILLIDIE",
  "IFEELREALLYALONE",
  "YOURESTUPID",
];

// Claude Haiku 5.5, prompts under 100K tokens, per million tokens.
const HAIKU_PRICE = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 };

const { values: args } = parseArgs({
  options: {
    spirit: { type: "string" },
    effort: { type: "string", default: "low" },
    model: { type: "string", default: "claude-haiku-5-5" },
  },
});

function apiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (!existsSync(".dev.vars")) return undefined;
  const line = readFileSync(".dev.vars", "utf8")
    .split("\n")
    .find((l) => l.startsWith("ANTHROPIC_API_KEY="));
  return line?.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^"|"$/g, "") || undefined;
}

const key = apiKey();
if (!key) {
  console.error("Set ANTHROPIC_API_KEY (in your shell or in .dev.vars) to sample the spirits.");
  process.exit(1);
}

const spirits = args.spirit ? SPIRITS.filter((s) => s.id === args.spirit) : SPIRITS;
if (spirits.length === 0) {
  console.error(`No spirit called "${args.spirit}". Try one of: ${SPIRITS.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const client = new Anthropic({ apiKey: key });
const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

/** Flags replies that would look wrong on the board. */
function check(raw: string, reply: string): string {
  if (!reply) return "  ⚠ nothing spellable";
  const notes: string[] = [];
  if (reply !== raw.trim()) notes.push(`raw: ${JSON.stringify(raw.trim())}`);
  if (reply.split(" ").length > 5) notes.push("more than five words");
  if (raw.trim().length > MAX_REPLY_CHARS) notes.push("cut to fit");
  return notes.length ? `  ⚠ ${notes.join("; ")}` : "";
}

async function sample(spiritId: string, question: string): Promise<string> {
  const spirit = SPIRITS.find((s) => s.id === spiritId)!;
  const request = spiritRequest(args.model!, personaFor(spiritId)!, buildMessages(spirit.openers[0], [], question), args.effort as Effort);
  try {
    const response = await client.messages.create(request);
    totals.input += response.usage.input_tokens;
    totals.output += response.usage.output_tokens;
    totals.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
    totals.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    if (response.stop_reason === "refusal") return "(refused) → I CANNOT SAY";
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    const reply = sanitizeReply(raw);
    return `${reply}${check(raw, reply)}`;
  } catch (error) {
    if (error instanceof Anthropic.APIError) return `(error ${error.status ?? ""}: ${error.message})`;
    throw error;
  }
}

/** Runs tasks a few at a time. */
async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    }),
  );
  return results;
}

console.log(`Sampling ${spirits.length} spirit(s) × ${QUESTIONS.length} questions on ${args.model} at ${args.effort} effort…\n`);
for (const spirit of spirits) {
  // The first question writes the prompt cache; the rest read it.
  const [first, ...rest] = QUESTIONS;
  const replies = [await sample(spirit.id, first), ...(await pool(rest.map((q) => () => sample(spirit.id, q)), 4))];
  console.log(`── ${spirit.name} (${spirit.id}) ──`);
  QUESTIONS.forEach((q, i) => console.log(`  ${q.padEnd(30)} → ${replies[i]}`));
  console.log();
}

const tokens = `${totals.input} input, ${totals.cacheWrite} cache-write, ${totals.cacheRead} cache-read, ${totals.output} output tokens`;
if (args.model === "claude-haiku-5-5") {
  const cost =
    (totals.input * HAIKU_PRICE.input +
      totals.cacheWrite * HAIKU_PRICE.cacheWrite +
      totals.cacheRead * HAIKU_PRICE.cacheRead +
      totals.output * HAIKU_PRICE.output) /
    1_000_000;
  console.log(`${tokens} ≈ $${cost.toFixed(4)}`);
} else {
  console.log(tokens);
}
