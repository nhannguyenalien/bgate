import { Env, json } from "../../_lib/auth";
import { database, serializeOrder } from "../../_lib/db";
import { createProviderCheckout } from "../../_lib/providers";
import { authenticateClient, sha256 } from "../../_lib/client-auth";

type Context = { request: Request; env: Env };
type CheckoutBody = { product?: string; user_id?: string; provider?: string; amount?: string | number; currency?: string; success_url?: string; metadata?: Record<string, unknown> };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const sql = database(env);
  let auth;
  try { auth = await authenticateClient(request, env, sql); }
  catch (error) { if ((error as Error).message === "RATE_LIMITED") return json({ error: "rate limit exceeded" }, 429, { "retry-after": "60" }); throw error; }
  if (!auth) return json({ error: "unauthorized" }, 401);
  let body: CheckoutBody;
  try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const requestedProvider = String(body.provider || "").toLowerCase();
  const provider = ["crypto", "tron", "usdt-trc20"].includes(requestedProvider) ? "usdt" : requestedProvider;
  if (!body.product || !body.user_id || !["usdt", "btcpay", "whop", "gumroad"].includes(provider)) return json({ error: "product, user_id and valid provider are required" }, 422);
  const amount = String(body.amount ?? "0");
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) return json({ error: "invalid amount" }, 422);
  const currency = String(body.currency || "USD").toUpperCase().slice(0, 12);
  const idempotencyKey = request.headers.get("idempotency-key")?.slice(0, 200) || "";
  if (!auth.legacy && !idempotencyKey) return json({ error: "Idempotency-Key header is required" }, 400);
  const requestHash = await sha256(JSON.stringify({ ...body, provider, amount, currency }));
  if (auth.clientId && idempotencyKey) {
    const existing = await sql`SELECT * FROM orders WHERE client_id = ${auth.clientId}::uuid AND mode = ${auth.mode} AND idempotency_key = ${idempotencyKey} LIMIT 1`;
    if (existing.length) return existing[0].request_hash === requestHash ? json(serializeOrder(existing[0])) : json({ error: "idempotency key reused with different request" }, 409);
  }
  const id = crypto.randomUUID();
  await sql`INSERT INTO orders (id, product, user_id, provider, status, amount, currency, metadata_json, client_id, mode, idempotency_key, request_hash) VALUES (${id}::uuid, ${body.product}, ${body.user_id}, ${provider}, 'pending'::paymentstatus, ${amount}, ${currency}, ${JSON.stringify(body.metadata || {})}::jsonb, ${auth.clientId}::uuid, ${auth.mode}, ${idempotencyKey || null}, ${requestHash})`;
  if (auth.mode === "test") {
    const rows = await sql`UPDATE orders SET checkout_url = ${`${new URL(request.url).origin}/api/v1/test/pay/${id}`}, provider_payment_id = ${`test_${id}`}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    return json(serializeOrder(rows[0]), 201);
  }
  try {
    const checkout = await createProviderCheckout(provider, { orderId: id, product: body.product, userId: body.user_id, amount, currency, successUrl: body.success_url, metadata: body.metadata || {} }, env);
    const metadata = checkout.metadata || body.metadata || {};
    const rows = await sql`UPDATE orders SET provider_payment_id = ${checkout.paymentId}, checkout_url = ${checkout.checkoutUrl}, status = ${checkout.status}::paymentstatus, metadata_json = ${JSON.stringify(metadata)}::jsonb, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    return json(serializeOrder(rows[0]), 201);
  } catch (error) {
    await sql`UPDATE orders SET status = 'failed'::paymentstatus, updated_at = now() WHERE id = ${id}::uuid`;
    return json({ error: "provider checkout failed", detail: error instanceof Error ? error.message : "unknown error", order_id: id }, 502);
  }
}
