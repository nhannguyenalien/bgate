import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import type { Env } from "./auth";

export type Sql = NeonQueryFunction<false, false>;

export function database(env: Env): Sql {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(env.DATABASE_URL);
}

export function serializeOrder(row: Record<string, unknown>) {
  return {
    id: String(row.id), product: row.product, user_id: row.user_id, provider: row.provider,
    provider_payment_id: row.provider_payment_id, status: row.status, amount: String(row.amount),
    currency: row.currency, checkout_url: row.checkout_url, metadata: row.metadata_json || {},
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

export function serializeEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id), provider: row.provider, delivery_id: row.delivery_id,
    event_type: row.event_type, order_id: row.order_id ? String(row.order_id) : null,
    received_at: row.received_at,
  };
}
