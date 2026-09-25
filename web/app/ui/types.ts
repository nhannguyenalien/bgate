export type Order = {
  id: string;
  product: string;
  user_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount: string;
  currency: string;
  checkout_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Webhook = {
  id: string;
  provider: string;
  delivery_id: string;
  event_type: string;
  order_id: string | null;
  received_at: string;
};

export type Entitlement = {
  id: string;
  user_id: string;
  product: string;
  active: boolean;
  order_id: string | null;
  updated_at: string;
};

export type DashboardData = {
  orders: Order[];
  stats: {
    total_orders: number;
    paid: number;
    pending: number;
    active_entitlements: number;
    webhook_count: number;
  };
};

export type ApiClient = { id: string; name: string; mode: "test" | "live"; key_prefix: string; webhook_url: string | null; active: boolean; rate_limit_per_minute: number; last_used_at: string | null; created_at: string };

export type Section = "orders" | "entitlements" | "webhooks" | "clients";
