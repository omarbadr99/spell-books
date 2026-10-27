import { describe, expect, it } from "vitest";
import { CANDLE_COLORS, pickSpirit, SPIRITS } from "../../shared/presence";
import { isGreeting, MAX_REPLY_CHARS, normalizeBoardWord, sanitizeReply } from "../../shared/text";
import { mockReply } from "../../worker/mock";
import { buildSystemPrompt, conversation, opening, PERSONAS } from "../../worker/spirits";

const boardClean = (line: string) => {
  expect(sanitizeReply(line), line).toBe(line);
  expect(line.length, line).toBeLessThanOrEqual(MAX_REPLY_CHARS);
};

describe("spirit roster", () => {
  it("has four spirits, each named after the model it answers on", () => {
    expect(SPIRITS.map((s) => s.id)).toEqual(["haiku", "sonnet", "fable", "opus"]);
    expect(Object.fromEntries(Object.entries(PERSONAS).map(([id, p]) => [id, p.model]))).toEqual({
      haiku: "claude-haiku-5-5",
      sonnet: "claude-sonnet-5-5",
      fable: "claude-fable-5-1",
      opus: "claude-opus-5-5",
    });
  });

  it("moves every spirit at a believable pace", () => {
    for (const { id, motion } of SPIRITS) {
      expect(motion.speed, id).toBeGreaterThanOrEqual(400);
      expect(motion.speed, id).toBeLessThanOrEqual(1600);
      expect(motion.overshoot, id).toBeLessThan(30);
      expect(motion.tremor, id).toBeLessThanOrEqual(6);
    }
  });

  it("lights the candle in a different color for each spirit", () => {
    expect(SPIRITS.map((s) => s.color).sort()).toEqual(Object.values(CANDLE_COLORS).sort());
  });

  it("pairs every public spirit with a persona", () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(SPIRITS.map((s) => s.id).sort());
  });

  it.each(SPIRITS.map((s) => [s.id, s] as const))("%s is complete and board-clean", (_id, spirit) => {
    const persona = PERSONAS[spirit.id];
    expect(spirit.color).toMatch(/^#[0-9a-f]{6}$/);
    const squashedName = normalizeBoardWord(spirit.name);
    for (const word of spirit.revealWords) expect(squashedName).toContain(word);
    expect(persona.who).toContain(spirit.name.toUpperCase());

    expect(persona.examples.length).toBeGreaterThanOrEqual(5);
    for (const [question, answer] of persona.examples) {
      expect(question).toBe(normalizeBoardWord(question));
      boardClean(answer);
      expect(answer.split(" ").length, answer).toBeLessThanOrEqual(2);
    }
    // The first example answers a greeting; most of the rest are a single word.
    expect(isGreeting(persona.examples[0][0])).toBe(true);
    const oneWord = persona.examples.slice(1).filter(([, answer]) => !answer.includes(" ")).length;
    expect(oneWord, spirit.id).toBeGreaterThanOrEqual(persona.examples.length - 2);
    // A yes/no question is answered YES or NO, as the rules ask.
    expect(persona.examples.some(([, answer]) => answer === "YES" || answer === "NO")).toBe(true);
  });

  it("asks who-are-you in every persona so the name reveal is modelled", () => {
    for (const persona of Object.values(PERSONAS)) {
      expect(persona.examples.some(([q]) => q === "WHOAREYOU")).toBe(true);
    }
  });

  it("builds a stable system prompt that carries the rules and the persona", () => {
    const prompt = buildSystemPrompt(PERSONAS.opus);
    expect(prompt).toBe(buildSystemPrompt(PERSONAS.opus));
    expect(prompt).toContain("answer with ONE word");
    expect(prompt).toContain("answer YES or NO alone");
    expect(prompt).toContain("Greet them back");
    expect(prompt).toContain("OPUS");
    expect(prompt).toContain("WHOAREYOU → OPUS");
  });

  it("opens the conversation with the sitters' greeting", () => {
    expect(conversation([], "HI")).toEqual([{ role: "user", content: opening("HI") }]);
    expect(
      conversation(
        [
          { from: "sitters", text: "HI" },
          { from: "spirit", text: "WHO CALLS" },
        ],
        "OMAR",
      ),
    ).toEqual([
      { role: "user", content: opening("HI") },
      { role: "assistant", content: "WHO CALLS" },
      { role: "user", content: "OMAR" },
    ]);
  });

  it("greets back in mock mode, then answers questions", () => {
    for (const spirit of SPIRITS) {
      const greeting = mockReply(spirit, "HELLO", 0);
      boardClean(greeting);
      expect(greeting).not.toBe("GOODBYE");
      expect(mockReply(spirit, "WHOAREYOU", 2)).toBe(spirit.revealWords[0]);
    }
  });

  it("never summons the spirit that just left", () => {
    for (let i = 0; i < 200; i++) {
      expect(pickSpirit("fable").id).not.toBe("fable");
    }
    expect(pickSpirit(null, () => 0).id).toBe(SPIRITS[0].id);
  });
});
