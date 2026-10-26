/** One line of a séance, as the board saw it. */
export interface Turn {
  from: "sitters" | "spirit";
  text: string;
}

/** Spelled when Claude declines to answer. */
export const REFUSAL_REPLY = "I CANNOT SAY";

/** Most earlier turns a question may carry (seven exchanges). */
export const MAX_HISTORY = 14;
