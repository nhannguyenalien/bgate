from app.config import Settings
from app.providers.base import BillingProvider
from app.providers.btcpay import BTCPayProvider
from app.providers.gumroad import GumroadProvider
from app.providers.whop import WhopProvider


def get_provider(name: str, settings: Settings) -> BillingProvider:
    normalized = "btcpay" if name == "crypto" else name
    providers = {
        "btcpay": BTCPayProvider,
        "gumroad": GumroadProvider,
        "whop": WhopProvider,
    }
    try:
        return providers[normalized](settings)
    except KeyError as exc:
        raise ValueError(f"unsupported provider: {name}") from exc
