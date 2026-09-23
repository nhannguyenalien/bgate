import hashlib
import hmac
import json
from decimal import Decimal
from typing import Any

import httpx

from app.config import Settings
from app.models import PaymentStatus
from app.providers.base import BillingProvider, CheckoutResult, WebhookResult

STATUS_MAP = {
    "New": PaymentStatus.pending,
    "Processing": PaymentStatus.processing,
    "Settled": PaymentStatus.paid,
    "Expired": PaymentStatus.expired,
    "Invalid": PaymentStatus.failed,
}
EVENT_MAP = {
    "InvoiceProcessing": PaymentStatus.processing,
    "InvoiceSettled": PaymentStatus.paid,
    "InvoiceExpired": PaymentStatus.expired,
    "InvoiceInvalid": PaymentStatus.failed,
}


class BTCPayProvider(BillingProvider):
    name = "btcpay"

    def __init__(self, settings: Settings):
        self.settings = settings

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"token {self.settings.btcpay_api_key.get_secret_value()}"}

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
        payload: dict[str, Any] = {
            "amount": str(amount),
            "currency": currency,
            "metadata": {**metadata, "orderId": order_id, "itemDesc": product, "buyerName": user_id},
        }
        if success_url:
            payload["checkout"] = {"redirectURL": success_url, "redirectAutomatically": True}
        url = f"{self.settings.btcpay_url.rstrip('/')}/api/v1/stores/{self.settings.btcpay_store_id}/invoices"
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.post(url, headers=self._headers(), json=payload)
            response.raise_for_status()
        data = response.json()
        return CheckoutResult(data["id"], data["checkoutLink"], STATUS_MAP.get(data["status"], PaymentStatus.pending))

    async def get_payment(self, payment_id: str) -> CheckoutResult:
        base = self.settings.btcpay_url.rstrip("/")
        url = f"{base}/api/v1/stores/{self.settings.btcpay_store_id}/invoices/{payment_id}"
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
        data = response.json()
        return CheckoutResult(
            data["id"], data.get("checkoutLink", ""), STATUS_MAP.get(data["status"], PaymentStatus.pending)
        )

    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> WebhookResult:
        secret = self.settings.btcpay_webhook_secret.get_secret_value().encode()
        supplied = headers.get("btcpay-sig", "")
        expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(supplied, expected):
            raise ValueError("invalid BTCPay signature")
        data = json.loads(body)
        return WebhookResult(data["deliveryId"], data["type"], data.get("invoiceId"), EVENT_MAP.get(data["type"]), data)
