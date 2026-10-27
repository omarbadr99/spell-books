// The tone sampler: greets each spirit, asks it the same questions through its
// real model, and prints the replies side by side, so you can tune
// worker/spirits.ts before filming. Every question follows the greeting, as on
// the board. A full run of all four spirits costs well under a dollar.
//
//   npm run sample                                    every spirit on its own model
//   npm run sample -- --spirit fable --effort medium  one spirit, more thinking
//   npm run sample -- --model <model id>              every spirit on one model
//
// Reads ANTHROPIC_API_KEY from the environment or from .dev.vars.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { SPIRITS } from "../shared/presence";
import type { Turn } from "../shared/seance";
import { MAX_REPLY_CHARS } from "../shared/text";
import { replyFrom, spiritRequest, type Effort } from "../worker/spirit";
import { personaFor } from "../worker/spirits";

/** First words: each is the start of its own séance. */
const GREETINGS = ["HI", "HELLO", "ISANYONETHERE"];
/** Asked after HELLO and the spirit's answer to it. */
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

/** Dollars per million tokens, for prompts under 100K tokens; cache writes are the 5-minute kind. */
const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
};

const { values: args } = parseArgs({
  options: {
    spirit: { type: "string" },
    effort: { type: "string", default: "low" },
    model: { type: "string" },
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
let dollars = 0;
let unpriced = false;

/** Flags replies that would look wrong on the board. */
function check(raw: string, reply: string): string {
  if (!reply) return "  ⚠ nothing spellable";
  const notes: string[] = [];
  if (reply !== raw.trim().toUpperCase()) notes.push(`raw: ${JSON.stringify(raw.trim())}`);
  if (raw.trim().length > MAX_REPLY_CHARS) notes.push("cut to fit");
  return notes.length ? `  ⚠ ${notes.join("; ")}` : "";
}

/** One question to one spirit; returns what the board would spell, with notes. */
async function ask(spiritId: string, history: Turn[], question: string): Promise<{ reply: string; line: string }> {
  const persona = personaFor(spiritId)!;
  const model = args.model ?? persona.model;
  try {
    const response = await client.beta.messages.create(spiritRequest(model, persona, history, question, args.effort as Effort));
    const price = PRICES[model];
    if (price) {
      const u = response.usage;
      dollars +=
        (u.input_tokens * price.input +
          (u.cache_creation_input_tokens ?? 0) * price.cacheWrite +
          (u.cache_read_input_tokens ?? 0) * price.cacheRead +
          u.output_tokens * price.output) /
        1_000_000;
    } else {
      unpriced = true;
    }
    const reply = replyFrom(response, history, question);
    if (response.stop_reason === "refusal") return { reply, line: `${reply}  (refused)` };
    const raw = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    const served = response.model !== model ? `  (answered by ${response.model})` : "";
    return { reply, line: `${reply}${check(raw, reply)}${served}` };
  } catch (error) {
    if (error instanceof Anthropic.APIError) return { reply: "", line: `(error ${error.status ?? ""}: ${error.message})` };
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

const on = args.model ? `on ${args.model}` : "each on its own model";
console.log(`Sampling ${spirits.length} spirit(s) ${on} at ${args.effort} effort…\n`);
for (const spirit of spirits) {
  // The first greeting writes the prompt cache; the rest read it.
  const [first, ...others] = GREETINGS;
  const greetings = [await ask(spirit.id, [], first), ...(await pool(others.map((g) => () => ask(spirit.id, [], g)), 3))];
  const hello = greetings[GREETINGS.indexOf("HELLO")];
  const history: Turn[] = [
    { from: "sitters", text: "HELLO" },
    { from: "spirit", text: hello.reply || "HELLO" },
  ];
  const answers = await pool(QUESTIONS.map((q) => () => ask(spirit.id, history, q)), 4);

  console.log(`── ${spirit.name} (${args.model ?? personaFor(spirit.id)!.model}) ──`);
  GREETINGS.forEach((g, i) => console.log(`  ${g.padEnd(30)} → ${greetings[i].line}`));
  console.log(`  ${"·".repeat(30)}`);
  QUESTIONS.forEach((q, i) => console.log(`  ${q.padEnd(30)} → ${answers[i].line}`));
  console.log();
}
console.log(`≈ $${dollars.toFixed(4)}${unpriced ? " (plus a model with no price listed here)" : ""}`);
