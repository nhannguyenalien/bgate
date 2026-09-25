import { Env, json } from "../../../../_lib/auth";
import { database } from "../../../../_lib/db";
import { authenticateClient } from "../../../../_lib/client-auth";

type Context = { request: Request; env: Env; params: { user_id: string; product: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const sql = database(env);
  let auth;
  try { auth = await authenticateClient(request, env, sql); } catch { return json({ error: "rate limit exceeded" }, 429, { "retry-after": "60" }); }
  if (!auth) return json({ error: "unauthorized" }, 401);
  const rows = auth.clientId
    ? await sql`SELECT e.active FROM entitlements e JOIN orders o ON o.id = e.order_id WHERE e.user_id = ${params.user_id} AND e.product = ${params.product} AND o.client_id = ${auth.clientId}::uuid AND o.mode = ${auth.mode} LIMIT 1`
    : await sql`SELECT active FROM entitlements WHERE user_id = ${params.user_id} AND product = ${params.product} LIMIT 1`;
  return json({ user_id: params.user_id, product: params.product, active: Boolean(rows[0]?.active) });
}
