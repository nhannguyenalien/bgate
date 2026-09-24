import { Env, json, validSession } from "../../_lib/auth";
import { database, serializeEvent, serializeOrder } from "../../_lib/db";

type Context = { request: Request; env: Env; params: { path?: string | string[] } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  if (!(await validSession(request, env))) return json({ error: "unauthorized" }, 401);
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const route = parts.join("/");
  const sql = database(env);
  if (route === "dashboard") {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").slice(0, 200);
    const provider = (url.searchParams.get("provider") || "").slice(0, 30);
    const status = (url.searchParams.get("payment_status") || "").slice(0, 30);
    const pattern = `%${q}%`;
    const orders = await sql`SELECT * FROM orders WHERE (${q} = '' OR user_id ILIKE ${pattern} OR product ILIKE ${pattern}) AND (${provider} = '' OR provider = ${provider}) AND (${status} = '' OR status::text = ${status}) ORDER BY created_at DESC LIMIT 100`;
    const statusRows = await sql`SELECT status::text AS status, count(*)::int AS count FROM orders GROUP BY status`;
    const entitlementRows = await sql`SELECT count(*)::int AS count FROM entitlements WHERE active = true`;
    const webhookRows = await sql`SELECT count(*)::int AS count FROM webhook_events`;
    const counts: Record<string, number> = Object.fromEntries(statusRows.map(row => [String(row.status), Number(row.count)]));
    return json({ orders: orders.map(row => serializeOrder(row)), stats: {
      total_orders: Object.values(counts).reduce((sum, value) => sum + value, 0), paid: counts.paid || 0,
      pending: (counts.pending || 0) + (counts.processing || 0), active_entitlements: Number(entitlementRows[0]?.count || 0),
      webhook_count: Number(webhookRows[0]?.count || 0),
    } });
  }
  if (route === "entitlements") {
    const rows = await sql`SELECT * FROM entitlements ORDER BY updated_at DESC LIMIT 200`;
    return json({ items: rows.map(row => ({ ...row, id: String(row.id), order_id: row.order_id ? String(row.order_id) : null })) });
  }
  if (route === "webhooks") {
    const rows = await sql`SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT 200`;
    return json({ events: rows.map(row => serializeEvent(row)) });
  }
  if (parts[0] === "orders" && parts[1]) {
    const orders = await sql`SELECT * FROM orders WHERE id = ${parts[1]}::uuid LIMIT 1`;
    if (!orders.length) return json({ error: "order not found" }, 404);
    const events = await sql`SELECT * FROM webhook_events WHERE order_id = ${parts[1]}::uuid ORDER BY received_at DESC`;
    return json({ order: serializeOrder(orders[0]), events: events.map(row => serializeEvent(row)) });
  }
  return json({ error: "not found" }, 404);
}
