import { Env, json } from "../../../../_lib/auth";
import { database, serializeOrder } from "../../../../_lib/db";
import { safeEqual } from "../../../../_lib/auth";
import { refreshUsdtOrder } from "../../../../_lib/usdt";

type Context = { request: Request; env: Env; params: { order_id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const sql = database(env);
  const rows = await sql`SELECT * FROM orders WHERE id = ${params.order_id}::uuid AND provider = 'usdt' LIMIT 1`;
  if (!rows.length) return json({ error: "order not found" }, 404);
  const metadata = (rows[0].metadata_json || {}) as Record<string, unknown>;
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token || !await safeEqual(token, String(metadata.checkout_token || ""))) return json({ error: "unauthorized" }, 401);
  const order = await refreshUsdtOrder(sql, rows[0], env);
  const serialized = serializeOrder(order);
  const publicMetadata = serialized.metadata as Record<string, unknown>;
  delete publicMetadata.checkout_token;
  return json(serialized);
}
