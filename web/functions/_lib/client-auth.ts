import type { Env } from "./auth";
import type { Sql } from "./db";
import { constantTimeEqual } from "./security";

const encoder = new TextEncoder();

export type ClientAuth = { clientId: string | null; mode: "test" | "live"; name: string; legacy: boolean };

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 40)}`;
}

export async function authenticateClient(request: Request, env: Env, sql: Sql): Promise<ClientAuth | null> {
  const supplied = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supplied) return null;
  if (env.INTERNAL_API_KEY && await constantTimeEqual(supplied, env.INTERNAL_API_KEY)) {
    return { clientId: null, mode: "live", name: "Legacy internal", legacy: true };
  }
  const hash = await sha256(supplied);
  const rows = await sql`SELECT id, name, mode, rate_limit_per_minute FROM api_clients WHERE key_hash = ${hash} AND active = true LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  const bucketRows = await sql`INSERT INTO api_rate_limits (client_id, bucket, request_count) VALUES (${String(row.id)}::uuid, date_trunc('minute', now()), 1) ON CONFLICT (client_id, bucket) DO UPDATE SET request_count = api_rate_limits.request_count + 1 RETURNING request_count`;
  if (Number(bucketRows[0].request_count) > Number(row.rate_limit_per_minute)) throw new Error("RATE_LIMITED");
  await sql`UPDATE api_clients SET last_used_at = now() WHERE id = ${String(row.id)}::uuid`;
  return { clientId: String(row.id), mode: String(row.mode) as "test" | "live", name: String(row.name), legacy: false };
}

export function clientWhere(auth: ClientAuth): string | null { return auth.clientId; }
