import hashlib
import hmac
import json
from decimal import Decimal
from typing import Any

import httpx

from app.config import Settings
from app.models import PaymentStatus
from app.providers.base import BillingProvider, CheckoutResult, WebhookResult


class WhopProvider(BillingProvider):
    name = "whop"

    def __init__(self, settings: Settings):
        self.settings = settings

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.settings.whop_api_key.get_secret_value()}"}

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
        # Product is a Whop plan ID; pricing remains controlled in Whop.
        payload = {"plan_id": product, "metadata": {**metadata, "order_id": order_id, "user_id": user_id}}
        if success_url:
            payload["redirect_url"] = success_url
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{self.settings.whop_api_url.rstrip('/')}/checkout_configurations",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
        data = response.json()
        return CheckoutResult(str(data["id"]), data.get("purchase_url") or data.get("checkout_url"))

    async def get_payment(self, payment_id: str) -> CheckoutResult:
        raise NotImplementedError("Whop payment state is webhook-driven")

    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> WebhookResult:
        # Supports a simple HMAC relay. Configure the relay/proxy to set X-BGate-Signature.
        secret = self.settings.whop_webhook_secret.get_secret_value()
        supplied = headers.get("x-bgate-signature", "")
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(supplied, expected):
            raise ValueError("invalid Whop relay signature")
        data = json.loads(body)
        event = data.get("type", "unknown")
        obj = data.get("data", data)
        payment_id = str(obj.get("checkout_configuration_id") or obj.get("payment_id") or obj.get("id", ""))
        status = PaymentStatus.paid if event in {"payment.succeeded", "membership.activated"} else None
        if event in {"payment.failed", "membership.deactivated"}:
            status = PaymentStatus.failed
        return WebhookResult(str(data.get("id", payment_id)), event, payment_id, status, data)
