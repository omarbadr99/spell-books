// The board's lock: a device that spelled the right word gets a signed cookie
// (a "seat at the table") that lasts 30 days.

import { normalizeBoardWord } from "../shared/text";

const SEAT_COOKIE = "seat";
export const SEAT_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** A fresh signed seat for a new device. */
export async function issueSeat(secret: string, now = Date.now()): Promise<string> {
  const payload = `${crypto.randomUUID()}.${Math.floor(now / 1000) + SEAT_MAX_AGE}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/** The device id from a valid, unexpired seat cookie, or null. */
export async function readSeat(request: Request, secret: string, now = Date.now()): Promise<string | null> {
  const value = readCookie(request, SEAT_COOKIE);
  const [deviceId, expires, signature] = value?.split(".") ?? [];
  if (!deviceId || !expires || !signature) return null;
  if (!(Number(expires) * 1000 > now)) return null;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = fromBase64Url(signature);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(`${deviceId}.${expires}`),
  );
  return valid ? deviceId : null;
}

export function seatCookie(value: string, secure: boolean): string {
  return [`${SEAT_COOKIE}=${value}`, "Path=/", `Max-Age=${SEAT_MAX_AGE}`, "HttpOnly", "SameSite=Strict"]
    .concat(secure ? ["Secure"] : [])
    .join("; ");
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** Compares the spelled word with the secret without leaking how much matched. */
export async function wordMatches(spelled: string, secret: string): Promise<boolean> {
  const expected = normalizeBoardWord(secret);
  if (!expected) return false;
  const [a, b] = await Promise.all(
    [normalizeBoardWord(spelled), expected].map(async (w) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(w)))),
  );
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
