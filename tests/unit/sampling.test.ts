import { describe, expect, it } from "vitest";
import { coverage, KIND, sampleMask, seeded, type Mask } from "../../src/scene/sampling";

/** A 60×40 mask with a solid 30×20 block in the middle. */
function block(): Mask {
  const width = 60;
  const height = 40;
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 10; y < 30; y++) for (let x = 15; x < 45; x++) alpha[y * width + x] = 255;
  return { alpha, width, height };
}

const inBlock = (x: number, y: number) => x >= 15 && x < 45 && y >= 10 && y < 30;

describe("sampleMask", () => {
  it("makes as many points as asked", () => {
    expect(sampleMask(block(), 400, seeded(1))).toHaveLength(400);
  });

  it("keeps the strokes' points inside the shape", () => {
    for (const p of sampleMask(block(), 600, seeded(2))) {
      if (p.kind === KIND.body || p.kind === KIND.thread || p.kind === KIND.haze) {
        expect(inBlock(Math.floor(p.x), Math.floor(p.y)), `${p.x},${p.y}`).toBe(true);
      }
    }
  });

  it("crowds points toward the edges", () => {
    const body = sampleMask(block(), 2000, seeded(3)).filter((p) => p.kind === KIND.body);
    const nearEdge = body.filter((p) => p.x < 18 || p.x >= 42 || p.y < 13 || p.y >= 27).length;
    // The band three pixels wide around the edge is 48% of the block's area.
    expect(nearEdge / body.length).toBeGreaterThan(0.6);
  });

  it("scatters a little dust around the shape", () => {
    const dust = sampleMask(block(), 1000, seeded(4)).filter((p) => p.kind === KIND.dust);
    expect(dust.length).toBeGreaterThan(40);
    expect(dust.some((p) => !inBlock(Math.floor(p.x), Math.floor(p.y)))).toBe(true);
  });

  it("is the same every time for the same seed", () => {
    expect(sampleMask(block(), 300, seeded(5))).toEqual(sampleMask(block(), 300, seeded(5)));
  });

  it("returns nothing for an empty mask", () => {
    const empty = { alpha: new Uint8ClampedArray(100), width: 10, height: 10 };
    expect(coverage(empty)).toBe(0);
    expect(sampleMask(empty, 50, seeded(6))).toEqual([]);
  });
});
