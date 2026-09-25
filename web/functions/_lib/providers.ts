import type { Env } from "./auth";
import { constantTimeEqual, hmacSha256, hmacSha256Base64 } from "./security";

export type PaymentStatus = "pending" | "processing" | "paid" | "expired" | "cancelled" | "failed" | "refunded";
export type CheckoutInput = { orderId: string; product: string; amount: string; currency: string; userId: string; successUrl?: string; metadata: Record<string, unknown> };
export type CheckoutResult = { paymentId: string; checkoutUrl: string; status: PaymentStatus; metadata?: Record<string, unknown> };
export type WebhookResult = { deliveryId: string; eventType: string; paymentId: string; orderId?: string; status: PaymentStatus | null; payload: Record<string, unknown> };

const btcpayStatus: Record<string, PaymentStatus> = { New: "pending", Processing: "processing", Settled: "paid", Expired: "expired", Invalid: "failed" };
const btcpayEvent: Record<string, PaymentStatus> = { InvoiceProcessing: "processing", InvoiceSettled: "paid", InvoiceExpired: "expired", InvoiceInvalid: "failed" };

export async function createProviderCheckout(provider: string, input: CheckoutInput, env: Env): Promise<CheckoutResult> {
  if (provider === "usdt") {
    if (!env.TRONGRID_API_KEY || !env.TRON_USDT_RECEIVE_ADDRESS) throw new Error("USDT TRON is not configured");
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(env.TRON_USDT_RECEIVE_ADDRESS)) throw new Error("invalid TRON receive address");
    if (!["USD", "USDT"].includes(input.currency)) throw new Error("USDT checkout only accepts USD or USDT amounts");
    const baseAtomic = toUsdtAtomic(input.amount);
    // Add a sub-cent discriminator so concurrent orders with the same price can
    // be matched without asking for a memo (TRC20 transfers do not carry one).
    const offset = (Number.parseInt(input.orderId.replaceAll("-", "").slice(0, 8), 16) % 9_900) + 100;
    const expectedAtomic = baseAtomic + BigInt(offset);
    const expectedAmount = formatUsdtAtomic(expectedAtomic);
    const token = crypto.randomUUID().replaceAll("-", "");
    const publicBase = (env.BILLING_PUBLIC_URL || "https://billing.schoolsai.work").replace(/\/$/, "");
    const checkoutUrl = `${publicBase}/pay/usdt/?order=${encodeURIComponent(input.orderId)}&token=${token}`;
    return {
      paymentId: input.orderId,
      checkoutUrl,
      status: "pending",
      metadata: {
        ...input.metadata,
        network: "TRON",
        asset: "USDT",
        receive_address: env.TRON_USDT_RECEIVE_ADDRESS,
        expected_amount: expectedAmount,
        expected_amount_atomic: expectedAtomic.toString(),
        checkout_token: token,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    };
  }
  if (provider === "gumroad") {
    const base = (env.GUMROAD_BASE_URL || "https://gumroad.com").replace(/\/$/, "");
    const query = new URLSearchParams({ wanted: "true", quantity: "1", order_id: input.orderId, user_id: input.userId });
    return { paymentId: input.orderId, checkoutUrl: `${base}/l/${encodeURIComponent(input.product)}?${query}`, status: "pending" };
  }
  if (provider === "btcpay") {
    if (!env.BTCPAY_URL || !env.BTCPAY_STORE_ID || !env.BTCPAY_API_KEY) throw new Error("BTCPay is not configured");
    const payload: Record<string, unknown> = { amount: input.amount, currency: input.currency, metadata: { ...input.metadata, orderId: input.orderId, itemDesc: input.product, buyerName: input.userId } };
    if (input.successUrl) payload.checkout = { redirectURL: input.successUrl, redirectAutomatically: true };
    const response = await fetch(`${env.BTCPAY_URL.replace(/\/$/, "")}/api/v1/stores/${env.BTCPAY_STORE_ID}/invoices`, {
      method: "POST", headers: { authorization: `token ${env.BTCPAY_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`BTCPay returned ${response.status}`);
    const data = await response.json() as { id: string; checkoutLink: string; status: string };
    return { paymentId: data.id, checkoutUrl: data.checkoutLink, status: btcpayStatus[data.status] || "pending" };
  }
  if (provider === "whop") {
    if (!env.WHOP_API_KEY || !env.WHOP_ACCOUNT_ID) throw new Error("Whop is not configured");
    let payload: Record<string, unknown>;
    if (input.product.startsWith("plan_")) {
      payload = { account_id: env.WHOP_ACCOUNT_ID, plan_id: input.product };
    } else if (input.product.startsWith("prod_")) {
      payload = {
        account_id: env.WHOP_ACCOUNT_ID,
        plan: {
          account_id: env.WHOP_ACCOUNT_ID,
          product_id: input.product,
          plan_type: "one_time",
          initial_price: Number(input.amount),
          currency: input.currency.toLowerCase(),
          release_method: "buy_now",
        },
      };
    } else {
      throw new Error("Whop product must be a plan_ or prod_ ID");
    }
    payload.metadata = { ...input.metadata, order_id: input.orderId, user_id: input.userId, product: input.product };
    if (input.successUrl) payload.redirect_url = input.successUrl;
    const response = await fetch(`${(env.WHOP_API_URL || "https://api.whop.com/api/v1").replace(/\/$/, "")}/checkout_configurations`, {
      method: "POST", headers: { authorization: `Bearer ${env.WHOP_API_KEY}`, "content-type": "application/json", "api-version-date": env.WHOP_API_VERSION_DATE || "2026-08-14" }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Whop returned ${response.status}`);
    const data = await response.json() as { id: string; purchase_url?: string; checkout_url?: string };
    return { paymentId: String(data.id), checkoutUrl: data.purchase_url || data.checkout_url || "", status: "pending" };
  }
  throw new Error("unsupported provider");
}

function toUsdtAtomic(amount: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) throw new Error("USDT amount must have at most 6 decimals");
  const [whole, fraction = ""] = amount.split(".");
  const atomic = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (atomic <= 0n) throw new Error("USDT amount must be greater than zero");
  return atomic;
}

function formatUsdtAtomic(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formPayload(body: ArrayBuffer): Record<string, unknown> {
  return Object.fromEntries(new URLSearchParams(new TextDecoder().decode(body)).entries());
}

export async function parseProviderWebhook(provider: string, body: ArrayBuffer, headers: Headers, env: Env): Promise<WebhookResult> {
  const text = new TextDecoder().decode(body);
  if (provider === "btcpay") {
    if (!env.BTCPAY_WEBHOOK_SECRET) throw new Error("BTCPay webhook secret is not configured");
    const expected = `sha256=${await hmacSha256(env.BTCPAY_WEBHOOK_SECRET, body)}`;
    if (!await constantTimeEqual(headers.get("btcpay-sig") || "", expected)) throw new Error("invalid BTCPay signature");
    const data = JSON.parse(text) as Record<string, unknown>;
    return { deliveryId: String(data.deliveryId), eventType: String(data.type), paymentId: String(data.invoiceId || ""), status: btcpayEvent[String(data.type)] || null, payload: data };
  }
  if (provider === "whop") {
    if (!env.WHOP_WEBHOOK_SECRET) throw new Error("Whop webhook secret is not configured");
    const deliveryId = headers.get("webhook-id") || "";
    const timestamp = headers.get("webhook-timestamp") || "";
    const signatures = (headers.get("webhook-signature") || "").split(" ").map(value => value.trim());
    const timestampSeconds = Number(timestamp);
    if (!deliveryId || !Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) throw new Error("invalid Whop timestamp");
    const expected = `v1,${await hmacSha256Base64(env.WHOP_WEBHOOK_SECRET, `${deliveryId}.${timestamp}.${text}`)}`;
    let validSignature = false;
    for (const signature of signatures) validSignature ||= await constantTimeEqual(signature, expected);
    if (!validSignature) throw new Error("invalid Whop signature");
    const data = JSON.parse(text) as Record<string, unknown>;
    const object = (typeof data.data === "object" && data.data ? data.data : data) as Record<string, unknown>;
    const metadata = (typeof object.metadata === "object" && object.metadata ? object.metadata : {}) as Record<string, unknown>;
    const event = String(data.type || "unknown");
    const paymentId = String(object.checkout_configuration_id || object.payment_id || object.id || "");
    let status: PaymentStatus | null = event === "payment.succeeded" ? "paid" : null;
    if (event === "payment.failed") status = "failed";
    if (event === "payment.canceled") status = "cancelled";
    return { deliveryId, eventType: event, paymentId, orderId: metadata.order_id ? String(metadata.order_id) : undefined, status, payload: data };
  }
  if (provider === "gumroad") {
    if (!env.GUMROAD_WEBHOOK_SECRET) throw new Error("Gumroad webhook secret is not configured");
    if (!await constantTimeEqual(headers.get("x-bgate-signature") || "", await hmacSha256(env.GUMROAD_WEBHOOK_SECRET, body))) throw new Error("invalid Gumroad signature");
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = formPayload(body); }
    const event = headers.get("x-gumroad-event") || "sale";
    const paymentId = String(data.sale_id || data.id || data.order_id || "");
    return { deliveryId: paymentId, eventType: event, paymentId, status: ["refund", "dispute"].includes(event) ? "refunded" : "paid", payload: data };
  }
  throw new Error("unsupported provider");
}
