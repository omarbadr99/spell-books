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

  it("knows which way each point's edge faces", () => {
    const body = sampleMask(block(), 2000, seeded(7)).filter((p) => p.kind === KIND.body);
    const left = body.filter((p) => p.x < 16.5 && p.y > 14 && p.y < 26);
    const right = body.filter((p) => p.x > 43.5 && p.y > 14 && p.y < 26);
    const top = body.filter((p) => p.y < 11.5 && p.x > 19 && p.x < 41);
    expect(left.length && right.length && top.length).toBeTruthy();
    for (const p of left) expect(p.nx, `${p.x},${p.y}`).toBeLessThan(-0.5);
    for (const p of right) expect(p.nx).toBeGreaterThan(0.5);
    for (const p of top) expect(p.ny).toBeLessThan(-0.5);
    // Deep inside the block there is no edge to face.
    for (const p of body.filter((q) => q.x > 22 && q.x < 38 && q.y > 16 && q.y < 24)) expect(Math.hypot(p.nx, p.ny)).toBe(0);
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
