# BGate

Thin billing router that normalizes BTCPay Server, Whop, and Gumroad into one API.
It never holds wallet keys or signs blockchain transactions.

## API

Authenticated application endpoints require `X-API-Key`:

- `POST /api/v1/checkout` creates an order and provider checkout.
- `GET /api/v1/payments/{order_id}` returns normalized payment state.
- `GET /api/v1/entitlements/{user_id}/{product}` checks access.
- `POST /api/v1/webhooks/{btcpay|whop|gumroad}` receives provider events.
- `GET /api/healthz` and `GET /api/readyz` are operational probes.

The read-only operations dashboard is available at `/`. Configure
`ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a long random `SESSION_SECRET` before
deployment. Its signed login cookie is HTTP-only, secure in production, and expires
after 12 hours.

## Next.js dashboard on Cloudflare Pages

The production app lives in `web/`. It is a static Next.js export using Tabler UI,
with Cloudflare Pages Functions implementing the billing API, admin session, webhook
normalization, and direct Neon access. Secrets never enter the browser bundle.

Configure these Pages variables and encrypted secrets:

- Required secrets: `DATABASE_URL`, `INTERNAL_API_KEY`, `ADMIN_USERNAME`,
  `ADMIN_PASSWORD`, `SESSION_SECRET`
- Provider secrets as enabled: `BTCPAY_URL`, `BTCPAY_STORE_ID`, `BTCPAY_API_KEY`,
  `BTCPAY_WEBHOOK_SECRET`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`,
  `GUMROAD_WEBHOOK_SECRET`

Build with `npm run build` from `web/` and publish the `out/` directory. For local
development, copy `.dev.vars.example` to `.dev.vars` and use non-production values.

Example:

```bash
curl -X POST https://billing.schoolsai.work/api/v1/checkout \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"product":"itsupport-pro","user_id":"123","provider":"crypto","amount":"19","currency":"USD"}'
```

## Local development

```bash
cd web
cp .dev.vars.example .dev.vars
npm install
npm run build
npm run pages:dev
```

The Python/Compose implementation is retained only as migration history and is not
part of the production path. PostgreSQL is external (Neon in production).

## Provider setup

### BTCPay

Create a store-scoped API key with only `btcpay.store.cancreateinvoice` and
`btcpay.store.canviewinvoices`. Do **not** grant transaction-signing permissions.
Create a webhook for `https://billing.schoolsai.work/api/v1/webhooks/btcpay`, enable
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

- Cloudflare Pages serves both the static Next.js UI and `/api/*` Functions.
- Rotate `INTERNAL_API_KEY` and provider secrets periodically.
- Backups and point-in-time recovery are managed in Neon.
- Webhook delivery IDs are unique per provider, making retries idempotent.
