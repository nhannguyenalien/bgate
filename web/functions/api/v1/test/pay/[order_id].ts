import { Env, json } from "../../../../_lib/auth";
import { authenticateClient } from "../../../../_lib/client-auth";
import { sendClientWebhook } from "../../../../_lib/client-webhooks";
import { database, serializeOrder } from "../../../../_lib/db";

type Context = { request: Request; env: Env; params: { order_id: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const sql = database(env);
  let auth;
  try { auth = await authenticateClient(request, env, sql); } catch { return json({ error: "rate limit exceeded" }, 429, { "retry-after": "60" }); }
  if (!auth || !auth.clientId) return json({ error: "unauthorized" }, 401);
  if (auth.mode !== "test") return json({ error: "test key required" }, 403);
  let requested = "paid";
  try { requested = String(((await request.json()) as { status?: string }).status || "paid"); } catch { /* defaults to paid */ }
  if (!["paid", "failed", "expired", "cancelled"].includes(requested)) return json({ error: "invalid status" }, 422);
  const rows = await sql`UPDATE orders SET status = ${requested}::paymentstatus, updated_at = now() WHERE id = ${params.order_id}::uuid AND client_id = ${auth.clientId}::uuid AND mode = 'test' RETURNING *`;
  if (!rows.length) return json({ error: "order not found" }, 404);
  const order = rows[0];
  if (requested === "paid") await sql`INSERT INTO entitlements (id, user_id, product, active, order_id) VALUES (${crypto.randomUUID()}::uuid, ${String(order.user_id)}, ${String(order.product)}, true, ${String(order.id)}::uuid) ON CONFLICT (user_id, product) DO UPDATE SET active = true, order_id = EXCLUDED.order_id, updated_at = now()`;
  await sendClientWebhook(sql, env, String(order.id), `order.${requested}`);
  return json(serializeOrder(order));
}
