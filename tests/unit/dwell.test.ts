import { describe, expect, it } from "vitest";
import { DwellDetector } from "../../src/planchette/dwell";

// Two glyphs on a line: A around x=100, B around x=300.
const hit = (x: number) => (Math.abs(x - 100) < 40 ? "A" : Math.abs(x - 300) < 40 ? "B" : null);
const make = () => new DwellDetector((x) => hit(x), { dwellMs: 700, maxSpeed: 250 });

/** Holds the glass still at x from t0 for ms, sampling every 16 ms; returns the selections. */
function hold(d: DwellDetector, x: number, t0: number, ms: number): string[] {
  const picked: string[] = [];
  for (let t = t0; t <= t0 + ms; t += 16) {
    const s = d.update(t, x, 0);
    if (s.selected) picked.push(s.selected);
  }
  return picked;
}

describe("DwellDetector", () => {
  it("selects a glyph after the glass rests on it", () => {
    const d = make();
    expect(hold(d, 100, 0, 600)).toEqual([]);
    expect(hold(d, 100, 616, 200)).toEqual(["A"]);
  });

  it("reports progress while waiting", () => {
    const d = make();
    d.update(0, 100, 0);
    expect(d.update(350, 100, 0).progress).toBeCloseTo(0.5, 1);
  });

  it("never selects empty board", () => {
    expect(hold(make(), 200, 0, 3000)).toEqual([]);
  });

  it("does not select while the glass sweeps across glyphs", () => {
    const d = make();
    const picked: string[] = [];
    // 600 units per second, back and forth over A for two seconds.
    for (let t = 0; t < 2000; t += 16) {
      const x = 100 + 30 * Math.sin(t / 40);
      const s = d.update(t, x, 0);
      if (s.selected) picked.push(s.selected);
    }
    expect(picked).toEqual([]);
  });

  it("won't repeat a letter until the glass leaves it", () => {
    const d = make();
    expect(hold(d, 100, 0, 3000)).toEqual(["A"]);
    // Nudge off and back on: now it counts again.
    hold(d, 200, 3016, 100);
    expect(hold(d, 100, 3200, 800)).toEqual(["A"]);
  });

  it("moves on to the next glyph", () => {
    const d = make();
    expect(hold(d, 100, 0, 800)).toEqual(["A"]);
    expect(hold(d, 300, 816, 800)).toEqual(["B"]);
  });

  it("ignores a glyph the planchette is only trailing over", () => {
    const d = make();
    const picked: string[] = [];
    for (let t = 0; t <= 2000; t += 16) {
      const s = d.update(t, 100, 0, false);
      if (s.selected) picked.push(s.selected);
    }
    expect(picked).toEqual([]);
    expect(hold(d, 100, 2016, 800)).toEqual(["A"]);
  });

  it("acts on a glyph with no wait as soon as the glass stops on it, not while it passes", () => {
    const d = new DwellDetector((x) => hit(x), { dwellMs: 700, dwellFor: (id) => (id === "B" ? 0 : 700), maxSpeed: 250 });
    const picked: string[] = [];
    // Sweeping across B at 500 units a second.
    for (let t = 0; t <= 320; t += 16) {
      const s = d.update(t, 220 + t * 0.5, 0);
      if (s.selected) picked.push(s.selected);
    }
    expect(picked).toEqual([]);
    // Stopping on it: chosen within a few frames.
    expect(hold(d, 300, 336, 100)).toEqual(["B"]);
    // While the planchette still trails the fingers, it waits.
    const trailing = new DwellDetector((x) => hit(x), { dwellMs: 700, dwellFor: () => 0, maxSpeed: 250 });
    expect(trailing.update(0, 300, 0, false).selected).toBeNull();
    expect(trailing.update(16, 300, 0, true).selected).toBe("B");
  });

  it("keeps the last letter blocked across a release, but not across a reset", () => {
    const d = make();
    hold(d, 100, 0, 800);
    d.release();
    expect(hold(d, 100, 900, 1000)).toEqual([]);
    d.reset();
    expect(hold(d, 100, 2000, 800)).toEqual(["A"]);
  });
});
