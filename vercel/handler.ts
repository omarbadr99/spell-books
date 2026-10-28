// The board's API as a Vercel Function: turns Node's request into a web Request,
// hands it to the same handleApi the Cloudflare Worker uses, and writes the answer
// back. scripts/build-vercel.ts bundles this into each function.

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApi } from "../worker/api";
import { spiritClient } from "../worker/spirit";
import { memoryLimiter } from "./limiter";

const MAX_BODY_BYTES = 64 * 1024;
const askLimiter = memoryLimiter(15, 60);
const enterLimiter = memoryLimiter(5, 60);

function env(): Env {
  return {
    BOARD_WORD: process.env.BOARD_WORD ?? "",
    COOKIE_SECRET: process.env.COOKIE_SECRET ?? "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    SPIRIT_MODEL: process.env.SPIRIT_MODEL || undefined,
    MOCK_SPIRIT: process.env.MOCK_SPIRIT === "1" ? "1" : "0",
    ASK_LIMITER: askLimiter,
    ENTER_LIMITER: enterLimiter,
  } as unknown as Env;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) break;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0];
  const url = new URL(req.url ?? "/", `${proto}://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(req));

  const response = await handleApi(new Request(url, { method, headers, body }), env(), { createClient: spiritClient });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
