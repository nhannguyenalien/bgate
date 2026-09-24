import { Env, json } from "../../../_lib/auth";
import { database, serializeOrder } from "../../../_lib/db";
import { requireApiKey } from "../../../_lib/security";
import { refreshUsdtOrder } from "../../../_lib/usdt";

type Context = { request: Request; env: Env; params: { order_id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  if (!await requireApiKey(request, env.INTERNAL_API_KEY)) return json({ error: "unauthorized" }, 401);
  const sql = database(env);
  const rows = await sql`SELECT * FROM orders WHERE id = ${params.order_id}::uuid LIMIT 1`;
  if (!rows.length) return json({ error: "order not found" }, 404);
  const order = await refreshUsdtOrder(sql, rows[0], env);
  return json(serializeOrder(order));
}
