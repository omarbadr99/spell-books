import { describe, expect, it } from "vitest";
import { MAX_HISTORY, recentHistory, type Turn } from "../../shared/seance";
import {
  isGreeting,
  isYesNoQuestion,
  MAX_QUESTION_CHARS,
  MAX_REPLY_CHARS,
  normalizeBoardWord,
  preferYesNo,
  replyToMoves,
  revealsName,
  sanitizeQuestion,
  sanitizeReply,
  saysGoodbye,
} from "../../shared/text";

describe("sanitizeReply", () => {
  it("uppercases and keeps only board characters", () => {
    expect(sanitizeReply("Yes, child.")).toBe("YES CHILD");
    expect(sanitizeReply("don't  look!")).toBe("DONT LOOK");
    expect(sanitizeReply("1911…")).toBe("1911");
  });

  it("drops question marks, which the board can't spell", () => {
    expect(sanitizeReply("who are you??")).toBe("WHO ARE YOU");
    expect(sanitizeReply("? hello")).toBe("HELLO");
  });

  it("joins GOOD BYE into the board word", () => {
    expect(sanitizeReply("Good bye.")).toBe("GOODBYE");
    expect(sanitizeReply("farewell, good-bye")).toBe("FAREWELL GOODBYE");
  });

  it("keeps at most three words", () => {
    expect(sanitizeReply("the lamp is lit and the sea is calm")).toBe("THE LAMP IS");
    expect(sanitizeReply("Storm.").split(" ")).toHaveLength(1);
  });

  it("keeps a closing GOODBYE when it has to cut", () => {
    expect(sanitizeReply("you are the rudest sitters goodbye")).toBe("YOU ARE GOODBYE");
  });

  it("keeps replies short enough to spell", () => {
    const out = sanitizeReply("Supercalifragilisticexpialidocious extraordinarily");
    expect(out.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
    expect(out).toBe("SUPERCALIFRAGILISTICEXPIALIDOCIO");
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

  it("spells other words letter by letter", () => {
    expect(replyToMoves("HI 2")).toEqual([
      { type: "glyph", target: "H", text: "H" },
      { type: "glyph", target: "I", text: "I" },
      { type: "space" },
      { type: "glyph", target: "2", text: "2" },
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

describe("isGreeting", () => {
  it.each([
    "HI", "HII", "HELLO", "HELLLO", "HEY", "HEYTHERE", "HITHERE", "HIEVERYONE", "HIIMOMAR", "HISPIRITS", "HELLOOPUS",
    "ISANYONETHERE", "ISANYBODYOUTTHERE", "ANYONEHERE", "ISTHEREANYONE", "ISTHEREASPIRITHERE", "WHOSTHERE",
    "SPIRITSAREYOUWITHUS", "AREYOUTHERE", "CANYOUHEARME", "GOODEVENING", "GREETINGS", "SALAM", "ASSALAMUALAIKUM",
    "MARHABA", "HOLA", "BONJOUR", "YO", "HOWDY", "WHATSUP", "IS ANYONE THERE",
  ])("%s opens a séance", (text) => {
    expect(isGreeting(text)).toBe(true);
  });

  it.each(["", "YES", "NO", "CAT", "HIDE", "HIM", "HISTORY", "YOU", "YOUAREDEAD", "OIL", "WHOAREYOU", "WHATISYOURNAME", "DOGS", "123"])(
    "%s does not",
    (text) => {
      expect(isGreeting(text)).toBe(false);
    },
  );
});

describe("isYesNoQuestion / preferYesNo", () => {
  it("knows a yes/no question by how it starts", () => {
    for (const q of ["AREYOUREAL", "ISITTRUE", "DOYOULIKEME", "WILLIBERICH", "CANWEHEARYOU", "AMIDEAD", "IS", "DOESSHELOVEME"]) {
      expect(isYesNoQuestion(q), q).toBe(true);
    }
    for (const q of ["WHOAREYOU", "WHATISTHIS", "DOGS", "CANDLES", "ISLAND", "WILLOW", "HOWOLDAREYOU"]) {
      expect(isYesNoQuestion(q), q).toBe(false);
    }
  });

  it("cuts a reply to a yes/no question down to YES or NO", () => {
    expect(preferYesNo("AREYOUAGHOST", "YES CHILD")).toBe("YES");
    expect(preferYesNo("AREYOUAGHOST", "NO NEVER GOODBYE")).toBe("NO GOODBYE");
    expect(preferYesNo("AREYOUAGHOST", "PERHAPS")).toBe("PERHAPS");
    expect(preferYesNo("WHOAREYOU", "YES WHO ASKS")).toBe("YES WHO ASKS");
  });
});

describe("recentHistory", () => {
  it("keeps the greeting and the latest turns", () => {
    const turns: Turn[] = Array.from({ length: MAX_HISTORY + 6 }, (_, i) => ({ from: i % 2 ? "spirit" : "sitters", text: `T${i}` }));
    const kept = recentHistory(turns);
    expect(kept).toHaveLength(MAX_HISTORY);
    expect(kept.slice(0, 2).map((t) => t.text)).toEqual(["T0", "T1"]);
    expect(kept[kept.length - 1].text).toBe(`T${MAX_HISTORY + 5}`);
    expect(kept[2].from).toBe("sitters");
    expect(recentHistory(turns.slice(0, 4))).toEqual(turns.slice(0, 4));
  });
});
