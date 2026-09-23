# BGate

Thin billing router that normalizes BTCPay Server, Whop, and Gumroad into one API.
It never holds wallet keys or signs blockchain transactions.

## API

Authenticated application endpoints require `X-API-Key`:

- `POST /v1/checkout` creates an order and provider checkout.
- `GET /v1/payments/{order_id}` returns normalized payment state.
- `GET /v1/entitlements/{user_id}/{product}` checks access.
- `POST /v1/webhooks/{btcpay|whop|gumroad}` receives provider events.
- `GET /healthz` and `GET /readyz` are operational probes.

Example:

```bash
curl -X POST https://billing.schoolsai.work/v1/checkout \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"product":"itsupport-pro","user_id":"123","provider":"crypto","amount":"19","currency":"USD"}'
```

## Run

```bash
cp .env.example .env
# Fill secrets in .env; never commit it.
docker compose up -d --build
curl http://127.0.0.1:8000/readyz
```

The Compose stack intentionally contains only the API and a one-shot migration job.
PostgreSQL is external (Neon in production).

## Provider setup

### BTCPay

Create a store-scoped API key with only `btcpay.store.cancreateinvoice` and
`btcpay.store.canviewinvoices`. Do **not** grant transaction-signing permissions.
Create a webhook for `https://billing.schoolsai.work/v1/webhooks/btcpay`, enable
automatic redelivery, and put its secret in `BTCPAY_WEBHOOK_SECRET`.

### Whop and Gumroad

Their product/plan owns pricing; `amount` is recorded for normalization but is not
trusted to change provider pricing. Their webhook authentication formats can change
independently of this service. Route those webhooks through a small verifier at the
edge (for example Cloudflare Worker), then have it attach
`X-BGate-Signature: HMAC-SHA256(secret, raw_body)`. Set the same secret in
`WHOP_WEBHOOK_SECRET` or `GUMROAD_WEBHOOK_SECRET`. Do not expose an unsigned relay.

Before enabling either provider, validate its current endpoint and event payload in
the provider dashboard sandbox. BTCPay is implemented directly against Greenfield v1.

## Deployment notes

- Terminate TLS at Caddy/Nginx/Cloudflare and proxy to `127.0.0.1:8000`.
- Rotate `INTERNAL_API_KEY` and provider secrets periodically.
- Backups and point-in-time recovery are managed in Neon.
- Webhook delivery IDs are unique per provider, making retries idempotent.

