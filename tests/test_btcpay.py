import hashlib
import hmac
import json

import pytest

from app.config import Settings
from app.models import PaymentStatus
from app.providers.btcpay import BTCPayProvider


def test_btcpay_valid_signature_and_status():
    settings = Settings(btcpay_webhook_secret="secret")
    provider = BTCPayProvider(settings)
    body = json.dumps({"deliveryId": "d1", "type": "InvoiceSettled", "invoiceId": "inv1"}).encode()
    signature = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
    result = provider.parse_webhook(body, {"btcpay-sig": signature})
    assert result.status == PaymentStatus.paid
    assert result.payment_id == "inv1"


def test_btcpay_rejects_invalid_signature():
    provider = BTCPayProvider(Settings(btcpay_webhook_secret="secret"))
    with pytest.raises(ValueError, match="invalid BTCPay signature"):
        provider.parse_webhook(b"{}", {"btcpay-sig": "sha256=nope"})
