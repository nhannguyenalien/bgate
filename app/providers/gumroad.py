import hashlib
import hmac
import json
from decimal import Decimal
from typing import Any
from urllib.parse import urlencode

from app.config import Settings
from app.models import PaymentStatus
from app.providers.base import BillingProvider, CheckoutResult, WebhookResult


class GumroadProvider(BillingProvider):
    name = "gumroad"

    def __init__(self, settings: Settings):
        self.settings = settings

    async def create_checkout(
        self,
        *,
        order_id: str,
        product: str,
        amount: Decimal,
        currency: str,
        user_id: str,
        success_url: str | None,
        metadata: dict[str, Any],
    ) -> CheckoutResult:
        # Gumroad products own their price. `product` is the Gumroad permalink/short product ID.
        query = urlencode({"wanted": "true", "quantity": 1, "order_id": order_id, "user_id": user_id})
        return CheckoutResult(order_id, f"{self.settings.gumroad_base_url.rstrip('/')}/l/{product}?{query}")

    async def get_payment(self, payment_id: str) -> CheckoutResult:
        raise NotImplementedError("Gumroad payment state is webhook-driven")

    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> WebhookResult:
        # Optional shared-secret HMAC for a reverse proxy/webhook relay under our control.
        secret = self.settings.gumroad_webhook_secret.get_secret_value()
        if secret:
            supplied = headers.get("x-bgate-signature", "")
            expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(supplied, expected):
                raise ValueError("invalid Gumroad relay signature")
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            from urllib.parse import parse_qs

            data = {key: values[-1] for key, values in parse_qs(body.decode()).items()}
        event = headers.get("x-gumroad-event", "sale")
        status = PaymentStatus.refunded if event in {"refund", "dispute"} else PaymentStatus.paid
        payment_id = str(data.get("sale_id") or data.get("id") or data.get("order_id") or "")
        return WebhookResult(payment_id, event, payment_id, status, data)
