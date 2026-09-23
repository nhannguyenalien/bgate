import secrets
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import router as admin_router
from app.config import Settings, get_settings
from app.core import create_checkout, process_webhook
from app.db import engine, get_session
from app.models import Entitlement, Order
from app.schemas import CheckoutRequest, EntitlementResponse, PaymentResponse


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="BGate Billing Router", version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(admin_router)


def require_api_key(x_api_key: str = Header(default=""), settings: Settings = Depends(get_settings)) -> None:
    expected = settings.internal_api_key.get_secret_value()
    if not expected or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid API key")


@app.get("/", include_in_schema=False)
async def index() -> RedirectResponse:
    return RedirectResponse("/admin", status_code=302)


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def ready(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.post("/v1/checkout", response_model=PaymentResponse, dependencies=[Depends(require_api_key)])
async def checkout(
    request: CheckoutRequest, session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)
) -> PaymentResponse:
    try:
        order = await create_checkout(session, request, settings)
    except Exception as exc:
        await session.rollback()
        raise HTTPException(status_code=502, detail=f"provider checkout failed: {type(exc).__name__}") from exc
    return PaymentResponse.model_validate(order)


@app.get("/v1/payments/{order_id}", response_model=PaymentResponse, dependencies=[Depends(require_api_key)])
async def payment(order_id: UUID, session: AsyncSession = Depends(get_session)) -> PaymentResponse:
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    return PaymentResponse.model_validate(order)


@app.get(
    "/v1/entitlements/{user_id}/{product}", response_model=EntitlementResponse, dependencies=[Depends(require_api_key)]
)
async def entitlement(user_id: str, product: str, session: AsyncSession = Depends(get_session)) -> EntitlementResponse:
    item = await session.scalar(
        select(Entitlement).where(Entitlement.user_id == user_id, Entitlement.product == product)
    )
    return EntitlementResponse(user_id=user_id, product=product, active=bool(item and item.active))


@app.post("/v1/webhooks/{provider}", status_code=202)
async def webhook(
    provider: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    body = await request.body()
    try:
        processed, order = await process_webhook(session, provider, body, dict(request.headers), settings)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"accepted": True, "processed": processed, "order_id": str(order.id) if order else None}
