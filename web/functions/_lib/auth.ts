export interface Env {
  DATABASE_URL: string;
  INTERNAL_API_KEY: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  BTCPAY_URL?: string;
  BTCPAY_STORE_ID?: string;
  BTCPAY_API_KEY?: string;
  BTCPAY_WEBHOOK_SECRET?: string;
  WHOP_API_URL?: string;
  WHOP_API_VERSION_DATE?: string;
  WHOP_API_KEY?: string;
  WHOP_ACCOUNT_ID?: string;
  WHOP_WEBHOOK_SECRET?: string;
  GUMROAD_BASE_URL?: string;
  GUMROAD_WEBHOOK_SECRET?: string;
  TRONGRID_API_KEY?: string;
  TRON_USDT_RECEIVE_ADDRESS?: string;
  TRON_USDT_CONTRACT?: string;
  BILLING_PUBLIC_URL?: string;
}

const COOKIE = "bgate_pages_admin";
const MAX_AGE = 12 * 60 * 60;
const encoder = new TextEncoder();

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export async function safeEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  const leftBytes = new Uint8Array(a);
  const rightBytes = new Uint8Array(b);
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) mismatch |= leftBytes[index] ^ rightBytes[index];
  return mismatch === 0;
}

async function signature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function createSession(username: string, secret: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${username}:${expires}`;
  return `${payload}:${await signature(payload, secret)}`;
}

function cookieValue(request: Request): string {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : "";
}

export async function validSession(request: Request, env: Env): Promise<boolean> {
  const token = cookieValue(request);
  const parts = token.split(":");
  if (parts.length !== 3 || !env.SESSION_SECRET) return false;
  const [username, expiresText, actualSignature] = parts;
  const expires = Number(expiresText);
  if (username !== env.ADMIN_USERNAME || !Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  return safeEqual(actualSignature, await signature(`${username}:${expiresText}`, env.SESSION_SECRET));
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export const json = (value: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});
