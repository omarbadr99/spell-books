import { describe, expect, it } from "vitest";
import {
  MAX_QUESTION_CHARS,
  MAX_REPLY_CHARS,
  normalizeBoardWord,
  replyToMoves,
  revealsName,
  sanitizeQuestion,
  sanitizeReply,
  saysGoodbye,
} from "../../shared/text";

describe("sanitizeReply", () => {
  it("uppercases and keeps only board characters", () => {
    expect(sanitizeReply("Yes, child.")).toBe("YES CHILD");
    expect(sanitizeReply("don't  look\nbehind you!")).toBe("DONT LOOK BEHIND YOU");
    expect(sanitizeReply("I died in 1911…")).toBe("I DIED IN 1911");
  });

  it("keeps a question mark only at the end of a word", () => {
    expect(sanitizeReply("who are you??")).toBe("WHO ARE YOU?");
    expect(sanitizeReply("? hello")).toBe("HELLO");
    expect(sanitizeReply("what?why")).toBe("WHAT? WHY");
  });

  it("joins GOOD BYE into the board word", () => {
    expect(sanitizeReply("Good bye.")).toBe("GOODBYE");
    expect(sanitizeReply("farewell, goodbye?")).toBe("FAREWELL GOODBYE");
  });

  it("cuts long replies at a word boundary", () => {
    const long = "THE LAMP IS LIT AND THE SEA IS CALM AND I AM COUNTING EVERY WAVE";
    const out = sanitizeReply(long);
    expect(out.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(long.startsWith(out)).toBe(true);
    expect(out.endsWith(" ")).toBe(false);
  });

  it("keeps a closing GOODBYE when it has to cut", () => {
    const out = sanitizeReply("YOU ARE THE RUDEST SITTERS I HAVE MET IN TWO HUNDRED YEARS GOODBYE");
    expect(out.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(out.endsWith(" GOODBYE")).toBe(true);
  });

  it("returns an empty string when nothing is spellable", () => {
    expect(sanitizeReply("…!!")).toBe("");
  });
});

describe("sanitizeQuestion", () => {
  it("keeps letters, digits and single spaces", () => {
    expect(sanitizeQuestion("whatisyourname")).toBe("WHATISYOURNAME");
    expect(sanitizeQuestion("are  you? YES")).toBe("ARE YOU YES");
  });

  it("caps the length", () => {
    expect(sanitizeQuestion("A".repeat(200))).toHaveLength(MAX_QUESTION_CHARS);
  });
});

describe("normalizeBoardWord", () => {
  it("drops everything the board cannot spell", () => {
    expect(normalizeBoardWord(" night-jar 9 ")).toBe("NIGHTJAR9");
  });
});

describe("replyToMoves", () => {
  it("sends YES, NO and GOODBYE to their board words", () => {
    expect(replyToMoves("YES")).toEqual([{ type: "glyph", target: "YES", text: "YES" }]);
    expect(replyToMoves("NO GOODBYE")).toEqual([
      { type: "glyph", target: "NO", text: "NO" },
      { type: "space" },
      { type: "glyph", target: "GOODBYE", text: "GOODBYE" },
    ]);
  });

  it("spells other words letter by letter, with ? on the ASK mark", () => {
    expect(replyToMoves("HI 2?")).toEqual([
      { type: "glyph", target: "H", text: "H" },
      { type: "glyph", target: "I", text: "I" },
      { type: "space" },
      { type: "glyph", target: "2", text: "2" },
      { type: "glyph", target: "ASK", text: "?" },
    ]);
  });

  it("spells words that only contain a board word", () => {
    expect(replyToMoves("NOT").map((m) => (m.type === "glyph" ? m.target : " "))).toEqual(["N", "O", "T"]);
  });
});

describe("saysGoodbye / revealsName", () => {
  it("detects a goodbye anywhere in the reply", () => {
    expect(saysGoodbye("MIND YOUR MANNERS GOODBYE")).toBe(true);
    expect(saysGoodbye("GOODBYES ARE HARD")).toBe(false);
  });

  it("detects the spirit naming itself", () => {
    expect(revealsName("SILAS CRANE KEEPER", ["SILAS", "CRANE"], "Silas Crane")).toBe(true);
    expect(revealsName("I AM SILASCRANE", ["SILAS", "CRANE"], "Silas Crane")).toBe(true);
    expect(revealsName("MY BROTHER KNEW", ["ANSELM"], "Brother Anselm")).toBe(false);
  });
});
