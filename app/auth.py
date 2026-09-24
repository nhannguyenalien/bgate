import secrets

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def require_api_key(x_api_key: str = Header(default=""), settings: Settings = Depends(get_settings)) -> None:
    expected = settings.internal_api_key.get_secret_value()
    if not expected or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid API key")
