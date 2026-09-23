from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://bgate:bgate@db:5432/bgate"
    internal_api_key: SecretStr = SecretStr("change-me")
    public_base_url: str = "http://localhost:8000"
    admin_username: str = "admin"
    admin_password: SecretStr = SecretStr("")
    admin_session_secret: SecretStr = SecretStr("")

    btcpay_url: str = ""
    btcpay_store_id: str = ""
    btcpay_api_key: SecretStr = SecretStr("")
    btcpay_webhook_secret: SecretStr = SecretStr("")

    whop_api_url: str = "https://api.whop.com/api/v5"
    whop_api_key: SecretStr = SecretStr("")
    whop_webhook_secret: SecretStr = SecretStr("")

    gumroad_base_url: str = "https://gumroad.com"
    gumroad_webhook_secret: SecretStr = SecretStr("")

    request_timeout_seconds: float = 15.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
