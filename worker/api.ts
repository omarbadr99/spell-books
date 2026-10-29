// The board's four endpoints. Kept free of Workers-only globals so the tests
// can drive it in Node with a fake Claude client.

import { MAX_HISTORY, MOOD_COUNT, type Turn } from "../shared/seance";
import { asksToSeeSpirit, isGreeting, MAX_QUESTION_CHARS, sanitizeQuestion, sanitizeReply } from "../shared/text";
import { issueSeat, readSeat, seatCookie, wordMatches } from "./auth";
import { mockReply } from "./mock";
import { askSpirit, type SpiritClient } from "./spirit";
import { PERSONA } from "./spirits";

export interface ApiDeps {
  createClient: (apiKey: string) => SpiritClient;
}

/**
 * A question for the spirit. The séance's first question is the sitters'
 * greeting, with no history; `mood` is the spirit's mood for the séance.
 */
interface AskBody {
  history: Turn[];
  question: string;
  mood: number;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function handleApi(request: Request, env: Env, deps: ApiDeps): Promise<Response> {
  const url = new URL(request.url);
  if (!env.BOARD_WORD || !env.COOKIE_SECRET) {
    console.error("Set BOARD_WORD and COOKIE_SECRET (see README).");
    return json({ error: "unprepared" }, 503);
  }

  switch (`${request.method} ${url.pathname}`) {
    case "GET /api/me": {
      const seat = await readSeat(request, env.COOKIE_SECRET);
      return seat ? json({ ok: true }) : json({ error: "locked" }, 401);
    }

    case "POST /api/enter": {
      const ip = clientIp(request);
      if (!(await env.ENTER_LIMITER.limit({ key: ip })).success) return json({ error: "slow" }, 429);
      const body = await readJson<{ word?: unknown }>(request);
      const word = typeof body?.word === "string" ? body.word.slice(0, MAX_QUESTION_CHARS) : "";
      if (!(await wordMatches(word, env.BOARD_WORD))) return json({ error: "wrong" }, 401);
      const seat = await issueSeat(env.COOKIE_SECRET);
      return json({ ok: true }, 200, { "Set-Cookie": seatCookie(seat, url.protocol === "https:") });
    }

    case "POST /api/ask": {
      const deviceId = await readSeat(request, env.COOKIE_SECRET);
      if (!deviceId) return json({ error: "locked" }, 401);
      const ask = parseAsk(await readJson(request));
      if (!ask) return json({ error: "bad request" }, 400);
      if (!(await env.ASK_LIMITER.limit({ key: deviceId })).success) return json({ error: "slow" }, 429);

      // Nobody sees the spirit: asked to, she leaves.
      if (ask.history.length && asksToSeeSpirit(ask.question)) return json({ reply: "GOODBYE" });
      if (env.MOCK_SPIRIT === "1") return json({ reply: mockReply(ask.question, ask.history.length, ask.mood) });
      if (!env.ANTHROPIC_API_KEY) {
        console.error("Set ANTHROPIC_API_KEY, or MOCK_SPIRIT=1 to play with a canned spirit.");
        return json({ error: "silent" }, 502);
      }

      // The spirit answers on its own model, unless SPIRIT_MODEL says otherwise.
      const answer = await askSpirit(
        deps.createClient(env.ANTHROPIC_API_KEY),
        env.SPIRIT_MODEL || PERSONA.model,
        PERSONA,
        ask.history,
        ask.question,
        ask.mood,
      );
      if (answer.kind === "busy") return json({ error: "slow" }, 429);
      if (answer.kind === "silent") return json({ error: "silent" }, 502);
      return json({ reply: answer.reply });
    }

    default:
      return json({ error: "not found" }, 404);
  }
}

/** The caller's address, from Cloudflare's header or the usual proxy headers (Vercel). */
function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Real-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    "local"
  );
}

async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Validates an ask body. Sitters' turns must alternate with the spirit's,
 * sitters first, and the séance must have opened with a greeting.
 */
export function parseAsk(body: unknown): AskBody | null {
  if (!body || typeof body !== "object") return null;
  const { history, question, mood } = body as Record<string, unknown>;
  if (!Array.isArray(history) || history.length > MAX_HISTORY || history.length % 2 !== 0) return null;
  if (typeof question !== "string") return null;

  const turns: Turn[] = [];
  for (const [i, raw] of history.entries()) {
    const expected = i % 2 === 0 ? "sitters" : "spirit";
    if (!raw || typeof raw !== "object") return null;
    const { from, text } = raw as Record<string, unknown>;
    if (from !== expected || typeof text !== "string") return null;
    const clean = expected === "sitters" ? sanitizeQuestion(text) : sanitizeReply(text);
    if (!clean) return null;
    turns.push({ from: expected, text: clean });
  }

  const cleanQuestion = sanitizeQuestion(question);
  if (!cleanQuestion || !isGreeting(turns[0]?.text ?? cleanQuestion)) return null;
  // A mood the page doesn't know (or none, from an older page) is the first.
  const knownMood = Number.isInteger(mood) && (mood as number) >= 0 && (mood as number) < MOOD_COUNT;
  return { history: turns, question: cleanQuestion, mood: knownMood ? (mood as number) : 0 };
}
