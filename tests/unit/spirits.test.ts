import { describe, expect, it } from "vitest";
import { CANDLE_COLORS, pickSpirit, SPIRITS } from "../../shared/presence";
import { MAX_REPLY_CHARS, normalizeBoardWord, sanitizeReply } from "../../shared/text";
import { buildSystemPrompt, PERSONAS } from "../../worker/spirits";

const boardClean = (line: string) => {
  expect(sanitizeReply(line), line).toBe(line);
  expect(line.length, line).toBeLessThanOrEqual(MAX_REPLY_CHARS);
};

describe("spirit roster", () => {
  it("has twelve spirits with unique ids and sigils", () => {
    expect(SPIRITS).toHaveLength(12);
    for (const key of ["id", "sigil"] as const) {
      expect(new Set(SPIRITS.map((s) => s[key])).size, key).toBe(SPIRITS.length);
    }
  });

  it("lights the candles in each of the four colors for three spirits", () => {
    for (const color of Object.values(CANDLE_COLORS)) {
      expect(SPIRITS.filter((s) => s.color === color), color).toHaveLength(3);
    }
  });

  it("pairs every public spirit with a persona", () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(SPIRITS.map((s) => s.id).sort());
  });

  it.each(SPIRITS.map((s) => [s.id, s] as const))("%s is complete and board-clean", (_id, spirit) => {
    const persona = PERSONAS[spirit.id];
    expect(spirit.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(spirit.sigil.length).toBeGreaterThan(20);
    expect(spirit.openers.length).toBeGreaterThanOrEqual(2);
    expect(spirit.farewells.length).toBeGreaterThanOrEqual(2);
    spirit.openers.forEach(boardClean);
    spirit.farewells.forEach(boardClean);

    const squashedName = normalizeBoardWord(spirit.name);
    for (const word of spirit.revealWords) expect(squashedName).toContain(word);
    expect(persona.who).toContain(spirit.name.toUpperCase());

    expect(persona.examples.length).toBeGreaterThanOrEqual(5);
    for (const [question, answer] of persona.examples) {
      expect(question).toBe(normalizeBoardWord(question));
      boardClean(answer);
      expect(answer.split(" ").length, answer).toBeLessThanOrEqual(5);
    }
  });

  it("asks who-are-you in every persona so the name reveal is modelled", () => {
    for (const persona of Object.values(PERSONAS)) {
      expect(persona.examples.some(([q]) => q === "WHOAREYOU")).toBe(true);
    }
  });

  it("builds a stable system prompt that carries the rules and the persona", () => {
    const prompt = buildSystemPrompt(PERSONAS.silas);
    expect(prompt).toBe(buildSystemPrompt(PERSONAS.silas));
    expect(prompt).toContain("one to five words");
    expect(prompt).toContain("SILAS CRANE");
    expect(prompt).toContain("WHOAREYOU → SILAS CRANE KEEPER");
  });

  it("never summons the spirit that just left", () => {
    for (let i = 0; i < 200; i++) {
      expect(pickSpirit("pip").id).not.toBe("pip");
    }
    expect(pickSpirit(null, () => 0).id).toBe(SPIRITS[0].id);
  });
});
