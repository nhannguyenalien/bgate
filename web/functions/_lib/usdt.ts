import type { Env } from "./auth";
import type { Sql } from "./db";

const DEFAULT_USDT_CONTRACT = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

type Transfer = {
  transaction_id?: string;
  block_timestamp?: number;
  to?: string;
  value?: string;
  token_info?: { address?: string; decimals?: number; symbol?: string };
};

export async function refreshUsdtOrder(sql: Sql, order: Record<string, unknown>, env: Env): Promise<Record<string, unknown>> {
  if (String(order.provider) !== "usdt" || String(order.status) === "paid") return order;
  if (!env.TRONGRID_API_KEY || !env.TRON_USDT_RECEIVE_ADDRESS) throw new Error("USDT TRON is not configured");
  const metadata = (order.metadata_json || {}) as Record<string, unknown>;
  const expiresAt = Date.parse(String(metadata.expires_at || ""));
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
    const rows = await sql`UPDATE orders SET status = 'expired'::paymentstatus, updated_at = now() WHERE id = ${String(order.id)}::uuid AND status IN ('pending', 'processing') RETURNING *`;
    return rows[0] || order;
  }
  const expected = String(metadata.expected_amount_atomic || "");
  if (!/^\d+$/.test(expected)) throw new Error("USDT order has no expected amount");
  const contract = env.TRON_USDT_CONTRACT || DEFAULT_USDT_CONTRACT;
  const createdAt = new Date(String(order.created_at)).getTime();
  const params = new URLSearchParams({
    only_confirmed: "true",
    only_to: "true",
    contract_address: contract,
    min_timestamp: String(Math.max(0, createdAt - 60_000)),
    limit: "200",
    order_by: "block_timestamp,desc",
  });
  const response = await fetch(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(env.TRON_USDT_RECEIVE_ADDRESS)}/transactions/trc20?${params}`, {
    headers: { "TRON-PRO-API-KEY": env.TRONGRID_API_KEY, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`TronGrid returned ${response.status}`);
  const payload = await response.json() as { data?: Transfer[] };
  const transfer = (payload.data || []).find(item =>
    item.to === env.TRON_USDT_RECEIVE_ADDRESS &&
    item.value === expected &&
    item.token_info?.address === contract &&
    Number(item.token_info?.decimals) === 6 &&
    Number(item.block_timestamp || 0) >= createdAt - 60_000
  );
  if (!transfer?.transaction_id) return order;

  const updatedMetadata = { ...metadata, transaction_id: transfer.transaction_id, confirmed_at: new Date(Number(transfer.block_timestamp)).toISOString() };
  const rows = await sql`UPDATE orders SET status = 'paid'::paymentstatus, provider_payment_id = ${transfer.transaction_id}, metadata_json = ${JSON.stringify(updatedMetadata)}::jsonb, updated_at = now() WHERE id = ${String(order.id)}::uuid AND status IN ('pending', 'processing') RETURNING *`;
  if (!rows.length) return order;
  try {
    await sql`INSERT INTO webhook_events (id, provider, delivery_id, event_type, payload, order_id) VALUES (${crypto.randomUUID()}::uuid, 'usdt', ${transfer.transaction_id}, 'transfer.confirmed', ${JSON.stringify(transfer)}::jsonb, ${String(order.id)}::uuid)`;
  } catch (error) {
    if (!(error instanceof Error && /unique|duplicate/i.test(error.message))) throw error;
  }
  await sql`INSERT INTO entitlements (id, user_id, product, active, order_id) VALUES (${crypto.randomUUID()}::uuid, ${String(order.user_id)}, ${String(order.product)}, true, ${String(order.id)}::uuid) ON CONFLICT (user_id, product) DO UPDATE SET active = true, order_id = EXCLUDED.order_id, updated_at = now()`;
  return rows[0];
}
