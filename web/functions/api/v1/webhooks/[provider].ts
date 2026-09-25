import { Env, json } from "../../../_lib/auth";
import { database } from "../../../_lib/db";
import { parseProviderWebhook } from "../../../_lib/providers";
import { sendClientWebhook } from "../../../_lib/client-webhooks";

type Context = { request: Request; env: Env; params: { provider: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const provider = params.provider;
  if (!["btcpay", "whop", "gumroad"].includes(provider)) return json({ error: "unsupported provider" }, 404);
  const body = await request.arrayBuffer();
  let event;
  try { event = await parseProviderWebhook(provider, body, request.headers, env); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "invalid webhook" }, 401); }
  const sql = database(env);
  let orders = await sql`SELECT * FROM orders WHERE provider = ${provider} AND provider_payment_id = ${event.paymentId} LIMIT 1`;
  if (!orders.length && provider === "whop" && event.orderId) orders = await sql`SELECT * FROM orders WHERE provider = 'whop' AND id::text = ${event.orderId} LIMIT 1`;
  if (!orders.length && provider === "gumroad") orders = await sql`SELECT * FROM orders WHERE id::text = ${event.paymentId} LIMIT 1`;
  const order = orders[0];
  try {
    await sql`INSERT INTO webhook_events (id, provider, delivery_id, event_type, payload, order_id) VALUES (${crypto.randomUUID()}::uuid, ${provider}, ${event.deliveryId}, ${event.eventType}, ${JSON.stringify(event.payload)}::jsonb, ${order ? String(order.id) : null}::uuid)`;
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) return json({ accepted: true, processed: false, order_id: order ? String(order.id) : null }, 202);
    throw error;
  }
  if (order && event.status) {
    await sql`UPDATE orders SET status = ${event.status}::paymentstatus, updated_at = now() WHERE id = ${String(order.id)}::uuid`;
    if (event.status === "paid") {
      await sql`INSERT INTO entitlements (id, user_id, product, active, order_id) VALUES (${crypto.randomUUID()}::uuid, ${String(order.user_id)}, ${String(order.product)}, true, ${String(order.id)}::uuid) ON CONFLICT (user_id, product) DO UPDATE SET active = true, order_id = EXCLUDED.order_id, updated_at = now()`;
    } else if (["refunded", "cancelled"].includes(event.status)) {
      await sql`UPDATE entitlements SET active = false, updated_at = now() WHERE user_id = ${String(order.user_id)} AND product = ${String(order.product)}`;
    }
    await sendClientWebhook(sql, env, String(order.id), `order.${event.status}`);
  }
  return json({ accepted: true, processed: true, order_id: order ? String(order.id) : null }, 202);
}
