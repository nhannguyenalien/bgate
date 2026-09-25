import { Env, json, validSession } from "../../_lib/auth";
import { database, serializeEvent, serializeOrder } from "../../_lib/db";
import { randomToken, sha256 } from "../../_lib/client-auth";

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
  if (route === "clients") {
    const rows = await sql`SELECT id, name, mode, key_prefix, webhook_url, active, rate_limit_per_minute, last_used_at, created_at, updated_at FROM api_clients ORDER BY created_at DESC`;
    return json({ items: rows.map(row => ({ ...row, id: String(row.id) })) });
  }
  if (parts[0] === "orders" && parts[1]) {
    const orders = await sql`SELECT * FROM orders WHERE id = ${parts[1]}::uuid LIMIT 1`;
    if (!orders.length) return json({ error: "order not found" }, 404);
    const events = await sql`SELECT * FROM webhook_events WHERE order_id = ${parts[1]}::uuid ORDER BY received_at DESC`;
    return json({ order: serializeOrder(orders[0]), events: events.map(row => serializeEvent(row)) });
  }
  return json({ error: "not found" }, 404);
}

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  if (!(await validSession(request, env))) return json({ error: "unauthorized" }, 401);
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const sql = database(env);
  if (parts.join("/") === "clients") {
    const body = await request.json() as { name?: string; mode?: string; webhook_url?: string; rate_limit_per_minute?: number };
    if (!body.name || !["test", "live"].includes(String(body.mode))) return json({ error: "name and valid mode are required" }, 422);
    if (body.webhook_url && !/^https:\/\//i.test(body.webhook_url)) return json({ error: "webhook_url must use HTTPS" }, 422);
    const key = randomToken(`bg_${body.mode}_`);
    const webhookSecret = randomToken("whsec_");
    const id = crypto.randomUUID();
    await sql`INSERT INTO api_clients (id, name, mode, key_prefix, key_hash, webhook_url, webhook_secret, rate_limit_per_minute) VALUES (${id}::uuid, ${body.name.slice(0, 120)}, ${body.mode}, ${key.slice(0, 18)}, ${await sha256(key)}, ${body.webhook_url || null}, ${webhookSecret}, ${Math.max(1, Math.min(10000, Number(body.rate_limit_per_minute || 60)))})`;
    return json({ id, api_key: key, webhook_secret: webhookSecret, warning: "These secrets are shown only once." }, 201);
  }
  if (parts[0] === "clients" && parts[1] && parts[2] === "rotate") {
    const rows = await sql`SELECT mode FROM api_clients WHERE id = ${parts[1]}::uuid LIMIT 1`;
    if (!rows.length) return json({ error: "client not found" }, 404);
    const key = randomToken(`bg_${String(rows[0].mode)}_`);
    const webhookSecret = randomToken("whsec_");
    await sql`UPDATE api_clients SET key_prefix = ${key.slice(0, 18)}, key_hash = ${await sha256(key)}, webhook_secret = ${webhookSecret}, updated_at = now() WHERE id = ${parts[1]}::uuid`;
    return json({ api_key: key, webhook_secret: webhookSecret, warning: "Old secrets are now invalid." });
  }
  return json({ error: "not found" }, 404);
}

export async function onRequestPatch({ request, env, params }: Context): Promise<Response> {
  if (!(await validSession(request, env))) return json({ error: "unauthorized" }, 401);
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  if (parts[0] !== "clients" || !parts[1]) return json({ error: "not found" }, 404);
  const body = await request.json() as { active?: boolean; webhook_url?: string | null; rate_limit_per_minute?: number };
  if (body.webhook_url && !/^https:\/\//i.test(body.webhook_url)) return json({ error: "webhook_url must use HTTPS" }, 422);
  const sql = database(env);
  const rows = await sql`UPDATE api_clients SET active = COALESCE(${body.active ?? null}, active), webhook_url = CASE WHEN ${body.webhook_url === undefined} THEN webhook_url ELSE ${body.webhook_url || null} END, rate_limit_per_minute = COALESCE(${body.rate_limit_per_minute ? Math.max(1, Math.min(10000, Number(body.rate_limit_per_minute))) : null}, rate_limit_per_minute), updated_at = now() WHERE id = ${parts[1]}::uuid RETURNING id`;
  return rows.length ? json({ updated: true }) : json({ error: "client not found" }, 404);
}
