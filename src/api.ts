// Calls to the Worker. Every failure maps to something the board can act out.

import type { Turn } from "../shared/seance";

export type SeatState = "seated" | "locked" | "unprepared";
export type EnterResult = "ok" | "wrong" | "slow" | "unprepared";
export type AskResult = { reply: string } | { error: "slow" | "silent" | "locked" | "unprepared" };

export interface AskBody {
  spiritId: string;
  openerIndex: number;
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
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return null;
  }
}

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
