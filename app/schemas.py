from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl

from app.models import PaymentStatus


class CheckoutRequest(BaseModel):
    product: str = Field(min_length=1, max_length=120)
    user_id: str = Field(min_length=1, max_length=200)
    provider: Literal["crypto", "btcpay", "whop", "gumroad"]
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=12)
    success_url: HttpUrl | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PaymentResponse(BaseModel):
    order_id: UUID
    provider: str
    provider_payment_id: str | None
    status: PaymentStatus
    amount: Decimal
    currency: str
    checkout_url: str | None = None

    model_config = {"from_attributes": True}


class EntitlementResponse(BaseModel):
    user_id: str
    product: str
    active: bool

    model_config = {"from_attributes": True}
