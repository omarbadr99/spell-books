import { describe, expect, it } from "vitest";
import { buildLayout, chooseLayoutKind, elementById, hitTest, type LayoutKind } from "../../src/board/layout";
import { DIGITS, LETTERS } from "../../shared/text";

const kinds: LayoutKind[] = ["wide", "tall"];

describe.each(kinds)("%s layout", (kind) => {
  const layout = buildLayout(kind);

  it("has every glyph exactly once", () => {
    const ids = layout.elements.map((el) => el.id).sort();
    const expected = [...LETTERS, ...DIGITS, "YES", "NO", "GOODBYE", "ASK", "UNSAY", "CENTER"].sort();
    expect(ids).toEqual(expected);
  });

  it("keeps every hit area on the board", () => {
    for (const el of layout.elements) {
      expect(el.x - el.rx, el.id).toBeGreaterThanOrEqual(0);
      expect(el.x + el.rx, el.id).toBeLessThanOrEqual(layout.width);
      expect(el.y - el.ry, el.id).toBeGreaterThanOrEqual(0);
      expect(el.y + el.ry, el.id).toBeLessThanOrEqual(layout.height);
    }
  });

  it("never lets two hit areas overlap", () => {
    const inside = (el: (typeof layout.elements)[number], x: number, y: number) =>
      Math.hypot((x - el.x) / el.rx, (y - el.y) / el.ry) <= 1;
    for (let x = 0; x <= layout.width; x += 6) {
      for (let y = 0; y <= layout.height; y += 6) {
        const hits = layout.elements.filter((el) => inside(el, x, y)).map((el) => el.id);
        expect(hits.length, `${x},${y}: ${hits.join(" ")}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps letter targets big enough for a finger", () => {
    for (const el of layout.elements.filter((e) => e.kind === "letter")) {
      expect(el.rx, el.id).toBeGreaterThanOrEqual(44);
    }
  });

  it("rests the planchette on the center, where resting sends the question", () => {
    expect(hitTest(layout, layout.rest.x, layout.rest.y)?.id).toBe("CENTER");
  });

  it("finds each glyph at its own centre", () => {
    for (const el of layout.elements) {
      expect(hitTest(layout, el.x, el.y)?.id).toBe(el.id);
    }
  });

  it("keeps the sigil and nameplate clear of the glyphs", () => {
    const { sigil, nameplate } = layout;
    expect(hitTest(layout, sigil.x, sigil.y)).toBeNull();
    expect(hitTest(layout, nameplate.x - nameplate.w / 2, nameplate.y)).toBeNull();
    expect(hitTest(layout, nameplate.x + nameplate.w / 2, nameplate.y)).toBeNull();
  });
});

describe("layout helpers", () => {
  it("uses the tall board on portrait screens", () => {
    expect(chooseLayoutKind(390, 844)).toBe("tall");
    expect(chooseLayoutKind(1280, 800)).toBe("wide");
  });

  it("looks elements up by id", () => {
    expect(elementById(buildLayout("wide"), "GOODBYE")?.label).toBe("GOOD BYE");
  });
});
