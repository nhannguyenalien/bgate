from app.config import Settings
from app.models import PaymentStatus
from app.providers.gumroad import GumroadProvider


def test_gumroad_form_payload():
    provider = GumroadProvider(Settings())
    result = provider.parse_webhook(b"sale_id=sale-1&order_id=abc", {"x-gumroad-event": "sale"})
    assert result.payment_id == "sale-1"
    assert result.status == PaymentStatus.paid
