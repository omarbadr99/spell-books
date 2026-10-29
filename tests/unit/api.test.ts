import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { MAX_HISTORY, REFUSAL_REPLY } from "../../shared/seance";
import { handleApi, type ApiDeps } from "../../worker/api";
import { issueSeat, readSeat, SEAT_MAX_AGE, wordMatches } from "../../worker/auth";
import { opening } from "../../worker/spirits";

const limiter = (success = true) => ({ limit: vi.fn(async () => ({ success })) });

function makeEnv(overrides: Partial<Record<string, unknown>> = {}): Env {
  return {
    BOARD_WORD: "NIGHTJAR",
    COOKIE_SECRET: "test-secret",
    ANTHROPIC_API_KEY: "sk-test",
    MOCK_SPIRIT: "0",
    ASK_LIMITER: limiter(),
    ENTER_LIMITER: limiter(),
    ASSETS: {},
    ...overrides,
  } as unknown as Env;
}

type Message = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

function message(content: unknown[], stop_reason = "end_turn"): Message {
  return { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason } as unknown as Message;
}

function fakeClaude(result: Message | Error) {
  const create = vi.fn(async (_params: Params) => {
    if (result instanceof Error) throw result;
    return result;
  });
  const deps = { createClient: () => ({ beta: { messages: { create } } }) } as unknown as ApiDeps;
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

const goodAsk = {
  history: [
    { from: "sitters", text: "hello" },
    { from: "spirit", text: "WHAT NOW" },
  ],
  question: "areyoudead",
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

describe("asking the spirit", () => {
  it("needs a seat", async () => {
    const res = await handleApi(req("POST", "/api/ask", goodAsk), makeEnv(), noClaude);
    expect(res.status).toBe(401);
  });

  it("asks Opus, with the spirit's prompt and the whole séance", async () => {
    const env = makeEnv();
    const { create, deps } = fakeClaude(
      message([
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Yes, obviously." },
      ]),
    );
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(res.status).toBe(200);
    // A yes/no question gets a bare YES.
    expect(await res.json()).toEqual({ reply: "YES" });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.cache_control).toEqual({ type: "ephemeral" });
    expect(params.max_tokens).toBe(4096);
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("thinking");
    expect(params.system).toContain("MAVIS");
    expect(params.messages).toEqual([
      { role: "user", content: opening("HELLO") },
      { role: "assistant", content: "WHAT NOW" },
      { role: "user", content: "AREYOUDEAD" },
    ]);
  });

  it("carries the spirit's mood for the séance, or the first mood for one it doesn't know", async () => {
    const env = makeEnv();
    for (const [mood, expected] of [[3, 3], [99, 0], ["sad", 0]] as const) {
      const { create, deps } = fakeClaude(message([{ type: "text", text: "NO" }]));
      await handleApi(req("POST", "/api/ask", { ...goodAsk, mood }, await seatFor(env)), env, deps);
      expect(create.mock.calls[0][0].messages[0]).toEqual({ role: "user", content: opening("HELLO", expected) });
    }
  });

  it("leaves when asked to show herself, without asking Claude", async () => {
    const env = makeEnv();
    const res = await handleApi(req("POST", "/api/ask", { ...goodAsk, question: "show your face" }, await seatFor(env)), env, noClaude);
    expect(await res.json()).toEqual({ reply: "GOODBYE" });
  });

  it("says no plainly", async () => {
    const env = makeEnv();
    const { deps } = fakeClaude(message([{ type: "text", text: "Nope." }]));
    const res = await handleApi(req("POST", "/api/ask", { ...goodAsk, question: "will i be rich" }, await seatFor(env)), env, deps);
    expect(await res.json()).toEqual({ reply: "NO" });
  });

  it("lets the quick model answer when the spirit's own is too slow", async () => {
    const env = makeEnv();
    const create = vi
      .fn(async (_params: Params) => message([{ type: "text", text: "YES" }]))
      .mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError());
    const deps = { createClient: () => ({ beta: { messages: { create } } }) } as unknown as ApiDeps;
    const res = await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(await res.json()).toEqual({ reply: "YES" });
    expect(create.mock.calls.map(([params]) => params.model)).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]);
    expect(create.mock.calls[1][0].fallbacks).toBeUndefined();
  });

  it("answers on another model when SPIRIT_MODEL is set", async () => {
    const env = makeEnv({ SPIRIT_MODEL: "claude-haiku-5-5" });
    const { create, deps } = fakeClaude(message([{ type: "text", text: "NO" }]));
    await handleApi(req("POST", "/api/ask", goodAsk, await seatFor(env)), env, deps);
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-5-5");
    expect(create.mock.calls[0][0].fallbacks).toBeUndefined();
  });

  it("lets the greeting's reply run to a few words", async () => {
    const env = makeEnv();
    const { create, deps } = fakeClaude(message([{ type: "text", text: "Yes. Who asks?" }]));
    const res = await handleApi(
      req("POST", "/api/ask", { history: [], question: "is anyone there" }, await seatFor(env)),
      env,
      deps,
    );
    expect(await res.json()).toEqual({ reply: "YES WHO ASKS" });
    expect(create.mock.calls[0][0].messages).toEqual([{ role: "user", content: opening("IS ANYONE THERE") }]);
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
    ["an empty question", { ...goodAsk, question: "?!" }],
    ["a séance that opens without a greeting", { ...goodAsk, history: [], question: "whoareyou" }],
    ["history that opens without a greeting", { ...goodAsk, history: [{ from: "sitters", text: "cat" }, goodAsk.history[1]] }],
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

  it("answers from the canned spirit in mock mode", async () => {
    const env = makeEnv({ MOCK_SPIRIT: "1", ANTHROPIC_API_KEY: "" });
    const seat = await seatFor(env);
    const ask = (question: string) =>
      handleApi(req("POST", "/api/ask", { ...goodAsk, question }, seat), env, noClaude).then((r) => r.json());
    expect(await ask("IS")).toEqual({ reply: "YES" });
    expect(await ask("WHOAREYOU")).toEqual({ reply: "MAVIS" });
    expect(await ask("BYE")).toEqual({ reply: "GOODBYE" });
    const greeted = await handleApi(req("POST", "/api/ask", { history: [], question: "HI" }, seat), env, noClaude);
    expect(await greeted.json()).toEqual({ reply: "WHAT NOW" });
  });
});
