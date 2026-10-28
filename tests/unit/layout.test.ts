import { describe, expect, it } from "vitest";
import { boardWidthFor, buildLayout, chooseLayoutKind, elementById, hitTest, type LayoutKind } from "../../src/board/layout";
import { DIGITS, LETTERS } from "../../shared/text";

const kinds: LayoutKind[] = ["wide", "tall"];

describe.each(kinds)("%s layout", (kind) => {
  const layout = buildLayout(kind);

  it("has every glyph exactly once", () => {
    const ids = layout.elements.map((el) => el.id).sort();
    const expected = [...LETTERS, ...DIGITS, "YES", "NO", "GOODBYE", "CENTER"].sort();
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

  it("writes START over the center, and has the planchette wait clear of every glyph", () => {
    expect(hitTest(layout, layout.start.x, layout.start.y)?.id).toBe("CENTER");
    expect(hitTest(layout, layout.waiting.x, layout.waiting.y)).toBeNull();
    const s = layout.planchetteScale;
    // The planchette's porcelain, around its window, stays on the board while it waits.
    expect(layout.waiting.x + 110 * s).toBeLessThanOrEqual(layout.width);
    expect(layout.waiting.y + 100 * s).toBeLessThanOrEqual(layout.height);
  });

  it("keeps the candle clear of the glyphs", () => {
    const { candle } = layout;
    for (let y = candle.y - candle.h * 1.2; y <= candle.y; y += 6) {
      for (const dx of [-0.25, 0, 0.25]) {
        expect(hitTest(layout, candle.x + dx * candle.h, y), `${candle.x + dx * candle.h},${y}`).toBeNull();
      }
    }
  });
});

describe("layout helpers", () => {
  it("sizes the board to fit the window", () => {
    expect(boardWidthFor(buildLayout("tall"), 390, 844)).toBe(358);
    const wide = boardWidthFor(buildLayout("wide"), 1280, 800);
    expect(wide).toBeLessThanOrEqual(1280 - 32);
    expect(wide * (1000 / 1800)).toBeLessThanOrEqual(800 - 176);
    // Big enough that the letters read from across a room.
    expect(wide).toBeGreaterThan(1050);
    expect(boardWidthFor(buildLayout("wide"), 2560, 1440)).toBe(1700);
    expect(boardWidthFor(buildLayout("tall"), 200, 300)).toBe(240);
  });

  it("uses the tall board on portrait screens", () => {
    expect(chooseLayoutKind(390, 844)).toBe("tall");
    expect(chooseLayoutKind(1280, 800)).toBe("wide");
  });

  it("looks elements up by id", () => {
    expect(elementById(buildLayout("wide"), "GOODBYE")?.label).toBe("GOODBYE");
  });
});
