import type { Env } from "./auth";
import { constantTimeEqual, hmacSha256 } from "./security";

export type PaymentStatus = "pending" | "processing" | "paid" | "expired" | "cancelled" | "failed" | "refunded";
export type CheckoutInput = { orderId: string; product: string; amount: string; currency: string; userId: string; successUrl?: string; metadata: Record<string, unknown> };
export type CheckoutResult = { paymentId: string; checkoutUrl: string; status: PaymentStatus };
export type WebhookResult = { deliveryId: string; eventType: string; paymentId: string; status: PaymentStatus | null; payload: Record<string, unknown> };

const btcpayStatus: Record<string, PaymentStatus> = { New: "pending", Processing: "processing", Settled: "paid", Expired: "expired", Invalid: "failed" };
const btcpayEvent: Record<string, PaymentStatus> = { InvoiceProcessing: "processing", InvoiceSettled: "paid", InvoiceExpired: "expired", InvoiceInvalid: "failed" };

export async function createProviderCheckout(provider: string, input: CheckoutInput, env: Env): Promise<CheckoutResult> {
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
    if (!env.WHOP_API_KEY) throw new Error("Whop is not configured");
    const payload: Record<string, unknown> = { plan_id: input.product, metadata: { ...input.metadata, order_id: input.orderId, user_id: input.userId } };
    if (input.successUrl) payload.redirect_url = input.successUrl;
    const response = await fetch(`${(env.WHOP_API_URL || "https://api.whop.com/api/v5").replace(/\/$/, "")}/checkout_configurations`, {
      method: "POST", headers: { authorization: `Bearer ${env.WHOP_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Whop returned ${response.status}`);
    const data = await response.json() as { id: string; purchase_url?: string; checkout_url?: string };
    return { paymentId: String(data.id), checkoutUrl: data.purchase_url || data.checkout_url || "", status: "pending" };
  }
  throw new Error("unsupported provider");
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
    if (!await constantTimeEqual(headers.get("x-bgate-signature") || "", await hmacSha256(env.WHOP_WEBHOOK_SECRET, body))) throw new Error("invalid Whop signature");
    const data = JSON.parse(text) as Record<string, unknown>;
    const object = (typeof data.data === "object" && data.data ? data.data : data) as Record<string, unknown>;
    const event = String(data.type || "unknown");
    const paymentId = String(object.checkout_configuration_id || object.payment_id || object.id || "");
    let status: PaymentStatus | null = ["payment.succeeded", "membership.activated"].includes(event) ? "paid" : null;
    if (["payment.failed", "membership.deactivated"].includes(event)) status = "failed";
    return { deliveryId: String(data.id || paymentId), eventType: event, paymentId, status, payload: data };
  }
  if (provider === "gumroad") {
    if (env.GUMROAD_WEBHOOK_SECRET && !await constantTimeEqual(headers.get("x-bgate-signature") || "", await hmacSha256(env.GUMROAD_WEBHOOK_SECRET, body))) throw new Error("invalid Gumroad signature");
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = formPayload(body); }
    const event = headers.get("x-gumroad-event") || "sale";
    const paymentId = String(data.sale_id || data.id || data.order_id || "");
    return { deliveryId: paymentId, eventType: event, paymentId, status: ["refund", "dispute"].includes(event) ? "refunded" : "paid", payload: data };
  }
  throw new Error("unsupported provider");
}
