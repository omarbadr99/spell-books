// A whole séance in the browser with canned spirits: the lock, words that are
// not a greeting (nothing comes), lighting the candle with a hello, asking from
// the center, rubbing out a letter and goodbye. Runs the spirits 5× faster
// than life.

import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __board: {
      phase(): string;
      spirit(): string | null;
      lens(): { x: number; y: number };
      glyph(id: string): { x: number; y: number } | null;
      lastTarget(): string | null;
      spiritLine(): string;
      ink(): string;
      speaker(): string;
      forming(): boolean;
      start(): { x: number; y: number } | null;
      visited(): number;
      since(from: number): string[];
    };
  }
}

const SPEED = 5;
/** Time for the fingers to settle, the planchette to catch up and the glass to dwell (130 ms). */
const SETTLE_MS = 120 + 300 + 130 + 250;
/** Fingers rest a little below the glass, on the planchette's body. */
const GRIP = 18;

const ink = (page: Page) => page.evaluate(() => window.__board.ink());
const lastTarget = (page: Page) => page.evaluate(() => window.__board.lastTarget());
const spiritLine = (page: Page) => page.evaluate(() => window.__board.spiritLine());
const lens = (page: Page) => page.evaluate(() => window.__board.lens());
const glyph = (page: Page, id: string) => page.evaluate((glyphId) => window.__board.glyph(glyphId), id);

async function phaseBecomes(page: Page, ...phases: string[]) {
  await page.waitForFunction((ps) => ps.includes(window.__board.phase()), phases, { timeout: 90_000 });
}

/** How many phases the séance has been through so far. */
const mark = (page: Page) => page.evaluate(() => window.__board.visited());

/**
 * Waits until the séance has passed through `phases` in order since `from`, and
 * is in the last of them now. Spirits run fast in the tests, so a phase can come
 * and go between two looks at the page.
 */
async function passesThrough(page: Page, from: number, ...phases: string[]) {
  await page.waitForFunction(
    ([start, wanted]) => {
      let i = 0;
      for (const phase of window.__board.since(start)) if (phase === wanted[i]) i++;
      return i === wanted.length && window.__board.phase() === wanted[wanted.length - 1];
    },
    [from, phases] as const,
    { timeout: 90_000 },
  );
}

/** Drags the planchette so its glass rests on each glyph in turn. */
async function spell(page: Page, ...ids: string[]) {
  const start = await lens(page);
  await page.mouse.move(start.x, start.y + GRIP);
  await page.mouse.down();
  for (const id of ids) {
    const target = await glyph(page, id);
    expect(target, id).not.toBeNull();
    await page.mouse.move(target!.x, target!.y + GRIP, { steps: 10 });
    await page.waitForTimeout(SETTLE_MS);
  }
  await page.mouse.up();
}

/** Drags the planchette back to the center and lets go at once, without resting there. */
async function flickHome(page: Page) {
  const start = await lens(page);
  const center = await glyph(page, "CENTER");
  await page.mouse.move(start.x, start.y + GRIP);
  await page.mouse.down();
  await page.mouse.move(center!.x, center!.y + GRIP, { steps: 6 });
  await page.mouse.up();
}

/** Taps START, hurries the board along with a touch as it comes down, and waits for it to settle. */
async function skipOpening(page: Page) {
  await page.getByRole("button", { name: "Begin the séance" }).click();
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => !window.__board.forming(), null, { timeout: 30_000 });
  await expect(page.locator("#play")).toBeHidden();
}

test("a séance from the lock to goodbye", async ({ page }, testInfo) => {
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "locked");
  await skipOpening(page);

  // A wrong word, sent by bringing the planchette back to the center: it jerks to NO.
  await spell(page, "A", "B");
  expect(await ink(page)).toBe("AB");
  let from = await mark(page);
  await spell(page, "CENTER");
  await passesThrough(page, from, "unlocking", "locked");
  expect(await lastTarget(page)).toBe("NO");

  // The right word unlocks the board; the candle stays out.
  from = await mark(page);
  await spell(page, "O", "W", "L", "CENTER");
  await passesThrough(page, from, "unlocking", "dormant");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("dark.png") });

  // Words that aren't a greeting fade away, and nothing comes.
  await spell(page, "A", "B", "CENTER");
  await expect(page.locator("#hint")).toContainText("only come when greeted");
  expect(await page.evaluate(() => window.__board.phase())).toBe("dormant");
  expect(await ink(page)).toBe("");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);

  // Saying hello lights the candle and calls a spirit, which greets the sitters back above the board.
  from = await mark(page);
  await spell(page, "H", "I", "CENTER");
  await phaseBecomes(page, "summoning", "listening");
  expect(await page.evaluate(() => window.__board.spirit())).toBeTruthy();
  await expect(page.locator("#room.candles-lit")).toHaveCount(1);
  await passesThrough(page, from, "summoning", "listening");
  expect((await spiritLine(page)).trim()).not.toBe("");
  expect(await page.evaluate(() => window.__board.speaker())).toBe("spirit:The spirit");
  await page.screenshot({ path: testInfo.outputPath("listening.png") });

  // A yes/no question, sent from the center, lands on YES.
  from = await mark(page);
  await spell(page, "I", "S", "CENTER");
  await passesThrough(page, from, "asking", "answering", "listening");
  expect(await lastTarget(page)).toBe("YES");
  expect(await spiritLine(page)).toBe("YES");

  // Letting go in the center sends too, and once the spirit gives its name, its words go under it.
  await spell(page, "W", "H", "O");
  from = await mark(page);
  await flickHome(page);
  await passesThrough(page, from, "asking", "answering", "listening");
  expect(await page.evaluate(() => window.__board.speaker())).toMatch(/^spirit:(?!The spirit)/);

  // Spelling again turns the line back to the sitters' message; tapping it rubs out the last letter.
  await spell(page, "X", "Y");
  expect(await ink(page)).toBe("XY");
  expect(await page.evaluate(() => window.__board.speaker())).toBe("sitters:Your message");
  await page.locator("#voice").click();
  expect(await ink(page)).toBe("X");
  await page.locator("#voice").click();
  expect(await ink(page)).toBe("");

  // Saying goodbye: the spirit simply goes, without a word, and the candle goes out.
  from = await mark(page);
  await spell(page, "GOODBYE");
  await passesThrough(page, from, "ending", "ended");
  expect(await page.evaluate((start) => window.__board.since(start), from)).not.toContain("answering");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);
  await expect(page.locator("#endcard")).toBeVisible();
  await expect(page.locator(".endcard-stats")).toContainText("2 questions asked");
  await page.screenshot({ path: testInfo.outputPath("endcard.png") });

  // Tapping the card clears the table for another séance.
  await page.locator("#endcard").click();
  await phaseBecomes(page, "dormant");
});

test("a device that already knows the word skips the lock", async ({ page, context }) => {
  const res = await context.request.post("/api/enter", { data: { word: "owl" } });
  expect(res.ok()).toBe(true);
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "dormant");
});

test("the letters float in the dark until the planchette is brought to START", async ({ page }) => {
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "locked", "dormant");
  expect(await page.evaluate(() => window.__board.forming())).toBe(true);
  await expect(page.locator("#planchette.here")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator("#hint")).toHaveText("Bring the planchette to START.", { timeout: 30_000 });
  // Touching the dark does nothing.
  await page.mouse.click(200, 200);
  expect(await page.evaluate(() => window.__board.forming())).toBe(true);

  // Bring the glass onto START and let go.
  const from = await lens(page);
  const to = await page.evaluate(() => window.__board.start());
  expect(to).not.toBeNull();
  await page.mouse.move(from.x, from.y + GRIP);
  await page.mouse.down();
  await page.mouse.move(to!.x, to!.y + GRIP, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => !window.__board.forming(), null, { timeout: 30_000 });
  await expect(page.locator("#room.intro")).toHaveCount(0);
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#hint")).not.toHaveText("Bring the planchette to START.");
});
