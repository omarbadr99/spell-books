// Calls to the Worker. Every failure maps to something the board can act out.

import type { Turn } from "../shared/seance";

export type SeatState = "seated" | "locked" | "unprepared";
export type EnterResult = "ok" | "wrong" | "slow" | "unprepared";
export type AskResult =
  | { reply: string; /** Shown as a hint, e.g. when replies come from a fallback. */ note?: string }
  | { error: "slow" | "silent" | "locked" | "unprepared" };

/** A question for a spirit. The first of a séance is the sitters' greeting, with no history. */
export interface AskBody {
  spiritId: string;
  history: Turn[];
  question: string;
}

async function call(path: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      // The server gives up on Claude well before this.
      signal: AbortSignal.timeout(32_000),
    });
  } catch {
    return null;
  }
}

/** Anything to settle before the séance starts. The Worker needs nothing; the artifact build asks for Claude here. */
export async function prepare(): Promise<void> {}

export async function checkSeat(): Promise<SeatState> {
  const res = await call("/api/me");
  if (res?.status === 503) return "unprepared";
  return res?.ok ? "seated" : "locked";
}

export async function enter(word: string): Promise<EnterResult> {
  const res = await call("/api/enter", { word });
  if (!res) return "wrong";
  if (res.ok) return "ok";
  if (res.status === 429) return "slow";
  if (res.status === 503) return "unprepared";
  return "wrong";
}

export async function ask(body: AskBody): Promise<AskResult> {
  const res = await call("/api/ask", body);
  if (!res) return { error: "silent" };
  if (res.status === 401) return { error: "locked" };
  if (res.status === 429) return { error: "slow" };
  if (res.status === 503) return { error: "unprepared" };
  if (!res.ok) return { error: "silent" };
  try {
    const data = (await res.json()) as { reply?: unknown };
    return typeof data.reply === "string" && data.reply ? { reply: data.reply } : { error: "silent" };
  } catch {
    return { error: "silent" };
  }
}
