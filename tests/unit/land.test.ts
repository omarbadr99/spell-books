import { describe, expect, it } from "vitest";
import { scatter, SITTER, SPIRIT, within } from "../../src/scene/figure";
import { finish, FRAME, framing, ground, layOutFarewell, project, ROLE, type FarewellLayout } from "../../src/scene/land";
import { seeded } from "../../src/scene/sampling";

const N = 12000;
const M = 8000;
const layout: FarewellLayout = finish(layOutFarewell(N, M, 1.6, seeded(5)));

/** Each point of the layout: where it is in land space, what it is, and how it shows. */
function points(role?: number) {
  const out: { x: number; y: number; f: number; role: number; look: number[] }[] = [];
  for (let i = 0; i < N; i++) {
    const [x, y, f, r] = layout.end.subarray(i * 4, i * 4 + 4);
    if (role === undefined || r === role) out.push({ x, y, f, role: r, look: [...layout.look.subarray(i * 4, i * 4 + 4)] });
  }
  return out;
}

describe("the figures", () => {
  it("scatter their points inside themselves", () => {
    for (const fig of [SITTER, SPIRIT]) {
      for (const p of scatter(fig, 300, seeded(1))) expect(within(fig, p.x, p.y)).toBeGreaterThan(-0.05);
    }
  });

  it("reach out with a hand at the end of an arm", () => {
    expect(within(SITTER, SITTER.hand[0] + 0.01, SITTER.hand[1])).toBeGreaterThan(0);
    expect(within(SPIRIT, SPIRIT.hand[0] - 0.01, SPIRIT.hand[1])).toBeGreaterThan(0);
    // The sitter reaches back to the left, the spirit out to the right.
    expect(SITTER.hand[0]).toBeLessThan(-0.4);
    expect(SPIRIT.hand[0]).toBeGreaterThan(0.4);
  });
});

describe("the farewell's layout", () => {
  it("places every point, and the extra dust", () => {
    expect(layout.end).toHaveLength(N * 4);
    expect(layout.look).toHaveLength(N * 4);
    expect(layout.dust).toHaveLength(M * 4);
  });

  it("gives every part of the picture its share of the points", () => {
    const counts = Object.values(ROLE).map((role) => points(role).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(N);
    for (const count of counts) expect(count).toBeGreaterThan(N * 0.01);
    // The sitter is drawn solid: there are more of them than of the spirit.
    expect(points(ROLE.sitter).length).toBeGreaterThan(points(ROLE.spirit).length);
  });

  it("stands the sitter on the ground where the view puts them", () => {
    const sitter = points(ROLE.sitter);
    const feet = sitter.reduce((low, p) => (p.y < low.y ? p : low));
    const head = sitter.reduce((top, p) => (p.y > top.y ? p : top));
    expect(Math.abs(feet.y - ground(feet.x, feet.f))).toBeLessThan(0.05);
    const shownFeet = project(feet.x, feet.y, feet.f);
    const shownHead = project(head.x, head.y, head.f);
    expect(shownFeet.y).toBeCloseTo(FRAME.feet, 1);
    expect(shownHead.y - shownFeet.y).toBeCloseTo(FRAME.tall, 1);
    expect(shownFeet.x).toBeCloseTo(FRAME.x, 1);
  });

  it("joins the sitter's hand and the spirit's", () => {
    const leftmost = (ps: { x: number; y: number; f: number }[]) => ps.reduce((a, p) => (p.x < a.x ? p : a));
    const rightmost = (ps: { x: number; y: number; f: number }[]) => ps.reduce((a, p) => (p.x > a.x ? p : a));
    // The sitter's hand is their leftmost point, and the spirit's hand its rightmost, high up where the arms are.
    const hand = leftmost(points(ROLE.sitter));
    const theirs = rightmost(points(ROLE.spirit).filter((p) => p.y > 0.7));
    expect(Math.hypot(hand.x - theirs.x, hand.y - theirs.y, hand.f - theirs.f)).toBeLessThan(0.12);
  });

  it("keeps the land in front of the eye, and the stream flowing to the right", () => {
    for (const p of points()) expect(p.f).toBeGreaterThan(1);
    for (const p of points(ROLE.stream)) {
      expect(Math.abs(p.look[0])).toBeLessThan(Math.PI / 2);
      expect(p.look[2]).toBeGreaterThan(0);
    }
  });

  it("lays the dust on the ground, lit", () => {
    let lit = 0;
    for (let i = 0; i < M; i++) {
      const [x, y, f, light] = layout.dust.subarray(i * 4, i * 4 + 4);
      if (light === 0) continue;
      lit++;
      expect(Math.abs(y - ground(x, f))).toBeLessThan(0.01);
    }
    expect(lit).toBeGreaterThan(M * 0.95);
  });

  it("works a little at a time", () => {
    const work = layOutFarewell(20000, 20000, 1.6, seeded(6));
    let steps = 0;
    while (!work.next().done) steps++;
    expect(steps).toBeGreaterThan(10);
  });
});

describe("framing", () => {
  it("leaves a wide view as it is", () => {
    expect(framing(1.6)).toEqual({ zoom: 1, across: 0, aspect: 1.6 });
  });

  it("draws the farewell smaller on a phone, with the figures moved to the middle", () => {
    const phone = framing(390 / 844);
    expect(phone.zoom).toBeLessThan(1);
    expect(phone.zoom).toBeGreaterThan(0.6);
    expect(phone.across).toBeGreaterThan(0);
    // It is laid out for the wider stretch of land a phone then shows.
    expect(phone.aspect).toBeGreaterThan(390 / 844);
  });
});
