/** One line of a séance, as the board saw it. */
export interface Turn {
  from: "sitters" | "spirit";
  text: string;
}

/** Spelled when Claude declines to answer. */
export const REFUSAL_REPLY = "I CANNOT SAY";

/**
 * How many moods the spirit can be in. The page picks one when the séance
 * begins and sends it with every question, so her greeting and her temper
 * change from one séance to the next (the moods are in worker/spirits.ts).
 */
export const MOOD_COUNT = 8;

/** Most earlier turns a question may carry (twelve exchanges, the greeting among them). */
export const MAX_HISTORY = 24;

/** What a question carries: the greeting that opened the séance, then as many of the latest turns as fit. */
export function recentHistory(history: Turn[]): Turn[] {
  if (history.length <= MAX_HISTORY) return history;
  return [...history.slice(0, 2), ...history.slice(2 - MAX_HISTORY)];
}
