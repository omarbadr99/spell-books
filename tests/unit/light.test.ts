import { describe, expect, it } from "vitest";
import { CandleLight } from "../../src/scene/light";
import { seeded } from "../../src/scene/sampling";

describe("the candle", () => {
  it("leans with the wind and stays sane through long, slow frames", () => {
    const light = new CandleLight(seeded(1));
    light.set(true);
    // A strong gust, and a device managing four frames a second.
    for (let i = 0; i < 200; i++) light.update(0.25, { x: 400, y: 30, gust: 3 });
    expect(Number.isFinite(light.lean)).toBe(true);
    expect(light.lean).toBeGreaterThan(0.5);
    expect(light.lean).toBeLessThanOrEqual(1.31);
    expect(Number.isFinite(light.position.x) && Number.isFinite(light.power)).toBe(true);
  });

  it("flares while a spirit speaks and settles after", () => {
    const light = new CandleLight(seeded(2));
    light.set(true);
    const calm = { x: 0, y: 0, gust: 0 };
    for (let i = 0; i < 120; i++) light.update(1 / 60, calm);
    const before = light.power;
    light.setFlare(true);
    for (let i = 0; i < 60; i++) light.update(1 / 60, calm);
    expect(light.power).toBeGreaterThan(before * 1.4);
    light.setFlare(false);
    for (let i = 0; i < 600; i++) light.update(1 / 60, calm);
    expect(light.flare).toBeLessThan(0.01);
  });
});
