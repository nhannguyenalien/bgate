import { Env, json } from "../../../_lib/auth";
import { database, serializeOrder } from "../../../_lib/db";
import { requireApiKey } from "../../../_lib/security";

type Context = { request: Request; env: Env; params: { order_id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  if (!await requireApiKey(request, env.INTERNAL_API_KEY)) return json({ error: "unauthorized" }, 401);
  const rows = await database(env)`SELECT * FROM orders WHERE id = ${params.order_id}::uuid LIMIT 1`;
  return rows.length ? json(serializeOrder(rows[0])) : json({ error: "order not found" }, 404);
}
