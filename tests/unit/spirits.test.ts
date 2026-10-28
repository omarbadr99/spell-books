import { describe, expect, it } from "vitest";
import { CANDLELIGHT, SPIRIT } from "../../shared/presence";
import { isGreeting, MAX_REPLY_CHARS, normalizeBoardWord, sanitizeReply } from "../../shared/text";
import { mockReply } from "../../worker/mock";
import { buildSystemPrompt, conversation, opening, PERSONA } from "../../worker/spirits";

const boardClean = (line: string) => {
  expect(sanitizeReply(line), line).toBe(line);
  expect(line.length, line).toBeLessThanOrEqual(MAX_REPLY_CHARS);
};

describe("the spirit", () => {
  it("answers on Opus by candlelight", () => {
    expect(PERSONA.model).toBe("claude-opus-5-5");
    expect(SPIRIT.color).toBe(CANDLELIGHT);
    expect(SPIRIT.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("moves at a believable pace", () => {
    const { motion } = SPIRIT;
    expect(motion.speed).toBeGreaterThanOrEqual(400);
    expect(motion.speed).toBeLessThanOrEqual(1600);
    expect(motion.overshoot).toBeLessThan(30);
    expect(motion.tremor).toBeLessThanOrEqual(6);
  });

  it("is complete and board-clean", () => {
    const squashedName = normalizeBoardWord(SPIRIT.name);
    for (const word of SPIRIT.revealWords) expect(squashedName).toContain(word);
    expect(PERSONA.who).toContain(SPIRIT.name.toUpperCase());

    expect(PERSONA.examples.length).toBeGreaterThanOrEqual(5);
    for (const [question, answer] of PERSONA.examples) {
      expect(question).toBe(normalizeBoardWord(question));
      boardClean(answer);
      expect(answer.split(" ").length, answer).toBeLessThanOrEqual(2);
    }
    // The first example answers a greeting; most of the rest are a single word.
    expect(isGreeting(PERSONA.examples[0][0])).toBe(true);
    const oneWord = PERSONA.examples.slice(1).filter(([, answer]) => !answer.includes(" ")).length;
    expect(oneWord).toBeGreaterThanOrEqual(PERSONA.examples.length - 2);
    // A yes/no question is answered YES or NO, as the rules ask, and who-are-you gives the name.
    expect(PERSONA.examples.some(([, answer]) => answer === "YES" || answer === "NO")).toBe(true);
    expect(PERSONA.examples).toContainEqual(["WHOAREYOU", SPIRIT.revealWords[0]]);
  });

  it("builds a stable system prompt that carries the rules and the persona", () => {
    const prompt = buildSystemPrompt(PERSONA);
    expect(prompt).toBe(buildSystemPrompt(PERSONA));
    expect(prompt).toContain("answer with ONE word");
    expect(prompt).toContain("answer YES or NO alone");
    expect(prompt).toContain("Answer the greeting");
    expect(prompt).toContain("Answer at once, without deliberating.");
    expect(prompt).toContain("MAVIS");
    expect(prompt).toContain("WHOAREYOU → MAVIS");
  });

  it("opens the conversation with the sitters' greeting", () => {
    expect(conversation([], "HI")).toEqual([{ role: "user", content: opening("HI") }]);
    expect(
      conversation(
        [
          { from: "sitters", text: "HI" },
          { from: "spirit", text: "WHAT NOW" },
        ],
        "OMAR",
      ),
    ).toEqual([
      { role: "user", content: opening("HI") },
      { role: "assistant", content: "WHAT NOW" },
      { role: "user", content: "OMAR" },
    ]);
  });

  it("greets back in mock mode, then answers questions", () => {
    const greeting = mockReply("HELLO", 0);
    boardClean(greeting);
    expect(greeting).not.toBe("GOODBYE");
    expect(mockReply("WHOAREYOU", 2)).toBe("MAVIS");
    expect(mockReply("GOODBYE", 2)).toBe("GOODBYE");
    for (const q of ["WHATSFORDINNER", "TELLMESOMETHING", "HMM"]) boardClean(mockReply(q, 4));
  });
});
