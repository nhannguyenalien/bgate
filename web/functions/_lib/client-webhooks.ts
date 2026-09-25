import type { Env } from "./auth";
import type { Sql } from "./db";
import { hmacSha256 } from "./security";

export async function sendClientWebhook(sql: Sql, env: Env, orderId: string, eventType: string): Promise<void> {
  const rows = await sql`SELECT o.*, c.id AS webhook_client_id, c.webhook_url, c.webhook_secret FROM orders o JOIN api_clients c ON c.id = o.client_id WHERE o.id = ${orderId}::uuid AND c.active = true AND c.webhook_url IS NOT NULL AND c.webhook_secret IS NOT NULL LIMIT 1`;
  if (!rows.length) return;
  const row = rows[0];
  const id = crypto.randomUUID();
  const payload = JSON.stringify({ id, type: eventType, created_at: new Date().toISOString(), data: { order: { id: String(row.id), product: row.product, user_id: row.user_id, provider: row.provider, status: row.status, amount: String(row.amount), currency: row.currency, mode: row.mode } } });
  try {
    await sql`INSERT INTO webhook_deliveries (id, client_id, order_id, event_type, payload, status) VALUES (${id}::uuid, ${String(row.webhook_client_id)}::uuid, ${orderId}::uuid, ${eventType}, ${payload}::jsonb, 'pending') ON CONFLICT (order_id, event_type) DO NOTHING`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await hmacSha256(String(row.webhook_secret), new TextEncoder().encode(`${timestamp}.${payload}`).buffer);
    const response = await fetch(String(row.webhook_url), { method: "POST", headers: { "content-type": "application/json", "x-bgate-event-id": id, "x-bgate-timestamp": timestamp, "x-bgate-signature": `sha256=${signature}` }, body: payload });
    await sql`UPDATE webhook_deliveries SET status = ${response.ok ? "delivered" : "failed"}, attempts = attempts + 1, response_status = ${response.status}, delivered_at = ${response.ok ? new Date().toISOString() : null} WHERE id = ${id}::uuid`;
  } catch {
    await sql`UPDATE webhook_deliveries SET status = 'failed', attempts = attempts + 1 WHERE id = ${id}::uuid`;
  }
}
