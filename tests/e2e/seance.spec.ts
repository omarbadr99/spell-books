// A whole séance in the browser with canned spirits: the lock, lighting the
// candles with HI, asking from the center, rubbing out a letter and goodbye.
// Runs the spirits 5× faster than life.

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

test("a séance from the lock to goodbye", async ({ page }, testInfo) => {
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "locked");

  // A wrong word, sent by bringing the planchette back to the center: it jerks to NO.
  await spell(page, "A", "B");
  expect(await ink(page)).toBe("AB");
  await spell(page, "CENTER");
  await phaseBecomes(page, "unlocking");
  await phaseBecomes(page, "locked");
  expect(await lastTarget(page)).toBe("NO");

  // The right word unlocks the board, which stays dark.
  await spell(page, "O", "W", "L", "CENTER");
  await phaseBecomes(page, "dormant");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("dark.png") });

  // Spelling HI lights the candles and calls a spirit, which spells its opener.
  await spell(page, "H", "I", "CENTER");
  await phaseBecomes(page, "summoning");
  expect(await page.evaluate(() => window.__board.spirit())).toBeTruthy();
  await expect(page.locator("#room.candles-lit")).toHaveCount(1);
  await phaseBecomes(page, "listening");
  expect((await spiritLine(page)).trim()).not.toBe("");
  await page.screenshot({ path: testInfo.outputPath("listening.png") });

  // A yes/no question, sent from the center, lands on YES.
  await spell(page, "I", "S", "CENTER");
  await phaseBecomes(page, "answering");
  await phaseBecomes(page, "listening");
  expect(await lastTarget(page)).toBe("YES");
  expect(await spiritLine(page)).toBe("YES");

  // Letting go in the center sends too, and asking who it is writes its name under the moon.
  await spell(page, "W", "H", "O");
  await flickHome(page);
  await phaseBecomes(page, "answering");
  await phaseBecomes(page, "listening");
  await expect(page.locator(".nameplate.engraved")).toHaveCount(1);

  // Tapping the paper rubs out the last letter.
  await spell(page, "X", "Y");
  expect(await ink(page)).toBe("XY");
  await page.locator("#slip").click();
  expect(await ink(page)).toBe("X");
  await page.locator("#slip").click();
  expect(await ink(page)).toBe("");

  // Saying goodbye: the spirit spells its farewell, rests on GOOD BYE, the candles go out.
  await spell(page, "GOODBYE");
  await phaseBecomes(page, "ended");
  expect(await lastTarget(page)).toBe("GOODBYE");
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
