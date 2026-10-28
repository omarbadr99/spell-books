// A whole séance in the browser with the canned spirit: START, the lock, words
// that are not a greeting (nothing comes), lighting the candle with a hello,
// asking, rubbing out a letter, goodbye and the farewell, and back to START.
// The planchette is the pointer: the tests spell by resting the mouse on each
// glyph, and send by resting a little longer. The spirit runs 5× faster than life.

import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __board: {
      phase(): string;
      scene(): string;
      spirit(): string | null;
      lens(): { x: number; y: number };
      glyph(id: string): { x: number; y: number } | null;
      lastTarget(): string | null;
      spiritLine(): string;
      ink(): string;
      speaker(): string;
      forming(): boolean;
      start(): { x: number; y: number };
      visited(): number;
      since(from: number): string[];
    };
  }
}

const SPEED = 5;
/** Long enough for the glass to settle on a glyph and choose it (it rests 300 ms), and well short of sending. */
const PICK_MS = 750;
/** Long enough, resting, for what was spelled to be sent (two seconds). */
const SEND_MS = 2600;

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
 * is in the last of them now. The spirit runs fast in the tests, so a phase can
 * come and go between two looks at the page.
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

/**
 * Rests the planchette's glass on each glyph in turn, long enough to choose it.
 * It comes to each from just below, so a glyph the glass already sits on (and
 * that therefore won't be chosen until it moves off) is left and come back to.
 */
async function spell(page: Page, ...ids: string[]) {
  for (const id of ids) {
    const target = await glyph(page, id);
    expect(target, id).not.toBeNull();
    await page.mouse.move(target!.x, target!.y + 70, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.move(target!.x, target!.y, { steps: 3 });
    await page.waitForTimeout(PICK_MS);
  }
}

/** Keeps the glass still until what was spelled goes. */
const rest = (page: Page) => page.waitForTimeout(SEND_MS);

/** Presses START once it has gathered, hurries the board along with a click as it forms, and waits for it to settle. */
async function begin(page: Page) {
  await page.waitForFunction(() => window.__board.scene() === "start");
  await page.getByRole("button", { name: "Begin the séance" }).click();
  await page.mouse.click(8, 8);
  await page.waitForFunction(() => !window.__board.forming(), null, { timeout: 30_000 });
  await expect(page.locator("#play")).toBeHidden();
}

test("a séance from START to the farewell and back", async ({ page }, testInfo) => {
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "locked");
  await begin(page);

  // A wrong word, sent by resting on its last letter: the planchette jerks to NO.
  await spell(page, "A", "B");
  expect(await ink(page)).toBe("AB");
  let from = await mark(page);
  await rest(page);
  await passesThrough(page, from, "unlocking", "locked");
  expect(await lastTarget(page)).toBe("NO");

  // The right word unlocks the board; the candle stays out.
  from = await mark(page);
  await spell(page, "O", "W", "L");
  await rest(page);
  await passesThrough(page, from, "unlocking", "dormant");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("dark.png") });

  // Words that aren't a greeting fade away, and nothing comes.
  await spell(page, "A", "B");
  await rest(page);
  await expect(page.locator("#hint")).toContainText("only comes when greeted");
  expect(await page.evaluate(() => window.__board.phase())).toBe("dormant");
  expect(await ink(page)).toBe("");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);

  // Saying hello lights the candle and calls the spirit, which greets the sitters back above the board.
  from = await mark(page);
  await spell(page, "H", "I");
  await rest(page);
  await phaseBecomes(page, "summoning", "listening");
  expect(await page.evaluate(() => window.__board.spirit())).toBeTruthy();
  await expect(page.locator("#room.candles-lit")).toHaveCount(1);
  await passesThrough(page, from, "summoning", "listening");
  expect((await spiritLine(page)).trim()).toBe("WHAT NOW");
  expect(await page.evaluate(() => window.__board.speaker())).toBe("spirit:The spirit");
  await page.screenshot({ path: testInfo.outputPath("listening.png") });

  // A yes/no question lands on YES. While the spirit has the planchette, the pointer can't move it;
  // once it is done, the planchette comes back to the pointer.
  from = await mark(page);
  await spell(page, "I", "S");
  await page.waitForFunction(() => window.__board.phase() !== "listening", null, { timeout: 10_000 });
  await page.mouse.move(40, 40, { steps: 4 });
  const held = await lens(page);
  expect(Math.hypot(held.x - 40, held.y - 40)).toBeGreaterThan(60);
  await passesThrough(page, from, "asking", "answering", "listening");
  expect(await lastTarget(page)).toBe("YES");
  expect(await spiritLine(page)).toBe("YES");
  await page.waitForFunction(() => {
    const at = window.__board.lens();
    return Math.hypot(at.x - 40, at.y - 40) < 12;
  });

  // A click chooses a glyph at once; and once the spirit gives its name, its words go under it.
  for (const id of ["W", "H", "O"]) {
    const g = (await glyph(page, id))!;
    await page.mouse.click(g.x, g.y);
  }
  expect(await ink(page)).toBe("WHO");
  from = await mark(page);
  await rest(page);
  await passesThrough(page, from, "asking", "answering", "listening");
  expect(await page.evaluate(() => window.__board.speaker())).toBe("spirit:Mavis");

  // Spelling again turns the line back to the sitters' message; tapping it rubs out the last letter.
  await spell(page, "X", "Y");
  expect(await ink(page)).toBe("XY");
  expect(await page.evaluate(() => window.__board.speaker())).toBe("sitters:Your message");
  await page.locator("#voice").click();
  expect(await ink(page)).toBe("X");
  await page.locator("#voice").click();
  expect(await ink(page)).toBe("");

  // Saying goodbye: the spirit simply goes, without a word, the candle goes out, and the board
  // breaks up into the farewell.
  from = await mark(page);
  await spell(page, "GOODBYE");
  await passesThrough(page, from, "ending", "ended");
  expect(await page.evaluate((start) => window.__board.since(start), from)).not.toContain("answering");
  await expect(page.locator("#room.candles-lit")).toHaveCount(0);
  await expect(page.locator("#farewell")).toBeVisible();
  await expect(page.locator("#farewell")).toContainText("It was nice to meet you.");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath("farewell.png") });

  // Restart flies the farewell back into START, and START begins another séance.
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.locator("#farewell")).toBeHidden();
  await expect(page.locator("#play")).toBeVisible();
  await begin(page);
  await phaseBecomes(page, "dormant");
});

test("a device that already knows the word skips the lock", async ({ page, context }) => {
  const res = await context.request.post("/api/enter", { data: { word: "owl" } });
  expect(res.ok()).toBe(true);
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "dormant");
});

test("the dust gathers into START, which waits to be pressed", async ({ page }) => {
  await page.goto(`/?speed=${SPEED}`);
  await phaseBecomes(page, "locked", "dormant");
  await expect(page.locator("#hint")).toHaveText("Press START to begin.", { timeout: 30_000 });
  // Clicking the dark does nothing, and the planchette, as the pointer, follows the mouse.
  await page.mouse.click(200, 200);
  expect(await page.evaluate(() => window.__board.scene())).toBe("start");
  await page.waitForFunction(() => {
    const at = window.__board.lens();
    return Math.hypot(at.x - 200, at.y - 200) < 12;
  });

  const start = await page.evaluate(() => window.__board.start());
  await page.mouse.click(start.x, start.y);
  await page.waitForFunction(() => !window.__board.forming(), null, { timeout: 30_000 });
  await expect(page.locator("#room.intro")).toHaveCount(0);
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#hint")).not.toHaveText("Press START to begin.");
});
