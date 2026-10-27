import { describe, expect, it } from "vitest";
import { fbm1, noise3 } from "../../src/scene/noise";
import { seeded } from "../../src/scene/sampling";
import { BREEZE, MAX_GUSTS, Wind, type Air } from "../../src/scene/wind";

const air = (): Air => ({ x: 0, y: 0, gust: 0 });
const run = (wind: Wind, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) wind.update(1 / 60);
};

describe("noise", () => {
  it("stays in range and knows its own slope", () => {
    const n = { value: 0, dx: 0, dy: 0 };
    const h = 1e-4;
    for (const [x, y, z] of [
      [0.3, 0.7, 0.1],
      [12.25, -3.6, 4.4],
      [-7.9, 2.05, 9.3],
    ]) {
      const { value, dx, dy } = noise3(x, y, z, n);
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      expect(dx).toBeCloseTo((noise3(x + h, y, z, { ...n }).value - noise3(x - h, y, z, { ...n }).value) / (2 * h), 3);
      expect(dy).toBeCloseTo((noise3(x, y + h, z, { ...n }).value - noise3(x, y - h, z, { ...n }).value) / (2 * h), 3);
    }
    for (let x = 0; x < 50; x += 0.37) expect(Math.abs(fbm1(x))).toBeLessThanOrEqual(1);
  });
});

describe("the wind", () => {
  it("is all but still until a spirit comes, then a breeze", () => {
    const wind = new Wind(seeded(1));
    run(wind, 3);
    expect(wind.speed).toBeLessThan(10);
    wind.setPresence(true);
    run(wind, 6);
    expect(wind.speed).toBeGreaterThan(BREEZE * 0.4);
    wind.setPresence(false);
    run(wind, 15);
    expect(wind.speed).toBeLessThan(10);
  });

  it("blows harder, in more gusts, while the spirit speaks", () => {
    const calm = new Wind(seeded(2));
    const stirred = new Wind(seeded(2));
    for (const wind of [calm, stirred]) wind.setPresence(true);
    stirred.setStir(true);
    let calmGusts = 0;
    let stirredGusts = 0;
    for (let i = 0; i < 600; i++) {
      calm.update(1 / 60);
      stirred.update(1 / 60);
      calmGusts += calm.gusts.length;
      stirredGusts += stirred.gusts.length;
    }
    expect(stirred.speed).toBeGreaterThan(calm.speed);
    expect(stirredGusts).toBeGreaterThan(calmGusts);
  });

  it("carries a gust downwind and lets it go once it has crossed the board", () => {
    const wind = new Wind(seeded(3));
    wind.setBounds(0, -1100, 1600, 0);
    wind.setPresence(true);
    expect(wind.gusts).toHaveLength(1);
    const gust = wind.gusts[0];
    const from = gust.s;
    wind.update(0.5);
    expect(gust.s).toBeGreaterThan(from);
    run(wind, gust.life + 1);
    expect(wind.gusts).not.toContain(gust);
  });

  it("sends a blast through a point almost at once", () => {
    const wind = new Wind(seeded(4));
    wind.blast(100, -900, 3);
    run(wind, 0.3);
    const here = wind.at(100, -900, air());
    expect(here.gust).toBeGreaterThan(1.5);
    expect(here.x * wind.dirX + here.y * wind.dirY).toBeGreaterThan(BREEZE * 1.5);
  });

  it("swirls without piling up: its eddies have no divergence", () => {
    const wind = new Wind(seeded(5));
    wind.setPresence(true);
    run(wind, 2);
    wind.gusts.length = 0;
    const h = 0.01;
    for (const [x, y] of [
      [300, -400],
      [900, -700],
      [1400, -150],
    ]) {
      const div =
        (wind.at(x + h, y, air()).x - wind.at(x - h, y, air()).x) / (2 * h) +
        (wind.at(x, y + h, air()).y - wind.at(x, y - h, air()).y) / (2 * h);
      expect(Math.abs(div)).toBeLessThan(1e-3);
    }
  });

  it("packs at most four gusts for the shaders, and leaves empty slots harmless", () => {
    const wind = new Wind(seeded(6));
    const shape = new Float32Array(MAX_GUSTS * 4);
    const force = new Float32Array(MAX_GUSTS * 4);
    wind.blast(0, 0);
    wind.pack(shape, force);
    expect(force[0]).toBeGreaterThan(0);
    for (let i = 1; i < MAX_GUSTS; i++) {
      expect(force[i * 4]).toBe(0);
      expect(shape[i * 4 + 2]).toBeGreaterThan(0);
      expect(shape[i * 4 + 3]).toBeGreaterThan(0);
    }
    for (let i = 0; i < 10; i++) wind.blast(i * 100, 0);
    expect(wind.gusts.length).toBeLessThanOrEqual(MAX_GUSTS);
  });
});
