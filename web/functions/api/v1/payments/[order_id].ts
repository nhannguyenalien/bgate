import { Env, json } from "../../../_lib/auth";
import { database, serializeOrder } from "../../../_lib/db";
import { authenticateClient } from "../../../_lib/client-auth";
import { refreshUsdtOrder } from "../../../_lib/usdt";

type Context = { request: Request; env: Env; params: { order_id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const sql = database(env);
  let auth;
  try { auth = await authenticateClient(request, env, sql); } catch { return json({ error: "rate limit exceeded" }, 429, { "retry-after": "60" }); }
  if (!auth) return json({ error: "unauthorized" }, 401);
  const rows = auth.clientId
    ? await sql`SELECT * FROM orders WHERE id = ${params.order_id}::uuid AND client_id = ${auth.clientId}::uuid AND mode = ${auth.mode} LIMIT 1`
    : await sql`SELECT * FROM orders WHERE id = ${params.order_id}::uuid LIMIT 1`;
  if (!rows.length) return json({ error: "order not found" }, 404);
  const order = await refreshUsdtOrder(sql, rows[0], env);
  return json(serializeOrder(order));
}
