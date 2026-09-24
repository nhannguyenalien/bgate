from decimal import Decimal

from app.admin_api import _event_json, _order_json
from app.models import Order, PaymentStatus, WebhookEvent


def test_order_json_is_frontend_safe() -> None:
    order = Order(
        product="itsupport-pro",
        user_id="123",
        provider="btcpay",
        status=PaymentStatus.paid,
        amount=Decimal("19.00"),
        currency="USD",
        metadata_json={"source": "test"},
    )

    payload = _order_json(order)

    assert payload["amount"] == "19.00"
    assert payload["status"] == "paid"
    assert payload["metadata"] == {"source": "test"}


def test_event_json_supports_unmatched_webhook() -> None:
    event = WebhookEvent(provider="btcpay", delivery_id="evt-1", event_type="InvoiceSettled", payload={})

    assert _event_json(event)["order_id"] is None
