/** One line of a séance, as the board saw it. */
export interface Turn {
  from: "sitters" | "spirit";
  text: string;
}

/** Most earlier turns a question may carry (seven exchanges). */
export const MAX_HISTORY = 14;
