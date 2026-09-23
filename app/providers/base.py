from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.models import PaymentStatus


@dataclass
class CheckoutResult:
    payment_id: str
    checkout_url: str
    status: PaymentStatus = PaymentStatus.pending


@dataclass
class WebhookResult:
    delivery_id: str
    event_type: str
    payment_id: str | None
    status: PaymentStatus | None
    payload: dict[str, Any]


class BillingProvider(ABC):
    name: str

    @abstractmethod
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
    ) -> CheckoutResult: ...

    @abstractmethod
    async def get_payment(self, payment_id: str) -> CheckoutResult: ...

    @abstractmethod
    def parse_webhook(self, body: bytes, headers: dict[str, str]) -> WebhookResult: ...

    async def cancel_subscription(self, subscription_id: str) -> None:
        raise NotImplementedError(f"{self.name} subscription cancellation is not configured")
