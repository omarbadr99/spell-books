import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { SPIRITS } from "../../shared/presence";
import { MAX_HISTORY, REFUSAL_REPLY } from "../../shared/seance";
import { handleApi, type ApiDeps } from "../../worker/api";
import { issueSeat, readSeat, SEAT_MAX_AGE, wordMatches } from "../../worker/auth";
import { seanceStart } from "../../worker/spirits";

const limiter = (success = true) => ({ limit: vi.fn(async () => ({ success })) });

function makeEnv(overrides: Partial<Record<string, unknown>> = {}): Env {
  return {
    BOARD_WORD: "NIGHTJAR",
    COOKIE_SECRET: "test-secret",
    ANTHROPIC_API_KEY: "sk-test",
    SPIRIT_MODEL: "claude-haiku-5-5",
    MOCK_SPIRIT: "0",
    ASK_LIMITER: limiter(),
    ENTER_LIMITER: limiter(),
    ASSETS: {},
    ...overrides,
  } as unknown as Env;
}

function message(content: unknown[], stop_reason = "end_turn"): Anthropic.Message {
  return { id: "msg_test", type: "message", role: "assistant", model: "claude-haiku-5-5", content, stop_reason } as unknown as Anthropic.Message;
}

function fakeClaude(result: Anthropic.Message | Error) {
  const create = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const deps: ApiDeps = { createClient: () => ({ messages: { create } }) as unknown as Pick<Anthropic, "messages"> };
  return { create, deps };
}

const noClaude: ApiDeps = {
  createClient: () => {
    throw new Error("Claude should not be called");
  },
};

const req = (method: string, path: string, body?: unknown, cookie?: string, origin = "http://localhost") =>
  new Request(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seatFor(env: Env) {
  return `seat=${await issueSeat(env.COOKIE_SECRET)}`;
}

const silas = SPIRITS.find((s) => s.id === "silas")!;
const goodAsk = {
  spiritId: "silas",
  openerIndex: 0,
  greeting: "hi",
  history: [
    { from: "sitters", text: "areyoudead" },
    { from: "spirit", text: "SINCE 1911" },
  ],
  question: "whoareyou",
};

describe("the lock", () => {
  it("rejects a wrong word without a cookie", async () => {
    const res = await handleApi(req("POST", "/api/enter", { word: "OWL" }), makeEnv(), noClaude);
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("accepts the word however it was spelled and seats the device", async () => {
    const env = makeEnv();
    const res = await handleApi(req("POST", "/api/enter", { word: "night jar" }), env, noClaude);
    expect(res.status).toBe(200);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^seat=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Strict$/);

    const me = await handleApi(req("GET", "/api/me", undefined, cookie.split(";")[0]), env, noClaude);
    expect(me.status).toBe(200);
  });

  it("marks the cookie Secure over https", async () => {
    const res = await handleApi(req("POST", "/api/enter", { word: "NIGHTJAR" }, undefined, "https://board.example"), makeEnv(), noClaude);
    expect(res.headers.get("Set-Cookie")).toContain("; Secure");
  });

  it("slows down repeated guesses", async () => {
    const res = await handleApi(req("POST", "/api/enter", { word: "NIGHTJAR" }), makeEnv({ ENTER_LIMITER: limiter(false) }), noClaude);
    expect(res.status).toBe(429);
  });

  it("rejects tampered and expired seats", async () => {
    const env = makeEnv();
    const seat = await issueSeat(env.COOKIE_SECRET);
    const [id, expires, sig] = seat.split(".");
    const tampered = `seat=${id}.${Number(expires) + 999}.${sig}`;
    expect((await handleApi(req("GET", "/api/me", undefined, tampered), env, noClaude)).status).toBe(401);
    expect(await readSeat(req("GET", "/", undefined, `seat=${seat}`), "other-secret")).toBeNull();

    const later = Date.now() + (SEAT_MAX_AGE + 60) * 1000;
    expect(await readSeat(req("GET", "/", undefined, `seat=${seat}`), env.COOKIE_SECRET, later)).toBeNull();
    expect(await readSeat(req("GET", "/", undefined, `seat=${seat}`), env.COOKIE_SECRET)).toBe(id);
  });

  it("refuses everything when the board was never given a word", async () => {
    const res = await handleApi(req("GET", "/api/me"), makeEnv({ BOARD_WORD: "" }), noClaude);
    expect(res.status).toBe(503);
  });

  it("never matches an empty secret", async () => {
    expect(await wordMatches("", "")).toBe(false);
    expect(await wordMatches("anything", "!!")).toBe(false);
  });
});

describe("asking a spirit", () => {
  it("needs a seat", async () => {
    const res = await handleApi(req("POST", "/api/ask", goodAsk), makeEnv(), noClaude);
    expect(res.status).toBe(401);
  });

  it("asks Claude Haiku 5.5 with the spirit's prompt and the whole séance", async () => {
    const env = makeEnv();
    const { create, deps } = fakeClaude(
      message([
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Silas Crane, keeper." },
      ]),
    );
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "SILAS CRANE KEEPER" });

    expect(create).toHaveBeenCalledTimes(1);
    const params = (create.mock.calls[0] as unknown[])[0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.cache_control).toEqual({ type: "ephemeral" });
    expect(params.max_tokens).toBe(1024);
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("thinking");
    expect(params.system).toContain("SILAS CRANE");
    expect(params.messages).toEqual([
      { role: "user", content: seanceStart("HI") },
      { role: "assistant", content: silas.openers[0] },
      { role: "user", content: "AREYOUDEAD" },
      { role: "assistant", content: "SINCE 1911" },
      { role: "user", content: "WHOAREYOU" },
    ]);
  });

  it("spells I CANNOT SAY when Claude refuses", async () => {
    const env = makeEnv();
    const { deps } = fakeClaude(message([], "refusal"));
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(await res.json()).toEqual({ reply: REFUSAL_REPLY });
  });

  it("falls silent when there is nothing to spell", async () => {
    const env = makeEnv();
    const { deps } = fakeClaude(message([{ type: "text", text: "…" }], "max_tokens"));
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(res.status).toBe(502);
  });

  it("says WAIT-worthy 429 when Claude is rate limited", async () => {
    const env = makeEnv();
    const { deps } = fakeClaude(new Anthropic.RateLimitError(429, {}, "slow down", new Headers()));
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(res.status).toBe(429);
  });

  it("falls silent on other API errors", async () => {
    const env = makeEnv();
    const { deps } = fakeClaude(new Anthropic.InternalServerError(500, {}, "oops", new Headers()));
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(res.status).toBe(502);
  });

  it("rate limits each device", async () => {
    const env = makeEnv({ ASK_LIMITER: limiter(false) });
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, noClaude);
    expect(res.status).toBe(429);
  });

  it.each([
    ["an unknown spirit", { ...goodAsk, spiritId: "casper" }],
    ["an opener the spirit never spelled", { ...goodAsk, openerIndex: 9 }],
    ["an empty question", { ...goodAsk, question: "?!" }],
    ["a greeting that isn't text", { ...goodAsk, greeting: 7 }],
    ["turns out of order", { ...goodAsk, history: [goodAsk.history[1], goodAsk.history[0]] }],
    ["an unanswered turn", { ...goodAsk, history: [goodAsk.history[0]] }],
    [
      "too much history",
      { ...goodAsk, history: Array.from({ length: MAX_HISTORY + 2 }, (_, i) => goodAsk.history[i % 2]) },
    ],
  ])("rejects %s", async (_label, body) => {
    const env = makeEnv();
    const res = await handleApi(req("POST", "/api/ask", body, await seatFor(env)), env, noClaude);
    expect(res.status).toBe(400);
  });

  it("answers from the canned spirits in mock mode", async () => {
    const env = makeEnv({ MOCK_SPIRIT: "1", ANTHROPIC_API_KEY: "" });
    const seat = await seatFor(env);
    const ask = (question: string) =>
      handleApi(req("POST", "/api/ask", { ...goodAsk, question }, seat), env, noClaude).then((r) => r.json());
    expect(await ask("IS")).toEqual({ reply: "YES" });
    expect(await ask("WHOAREYOU")).toEqual({ reply: "SILAS CRANE" });
    expect(await ask("BYE")).toEqual({ reply: "GOODBYE" });
  });
});
