from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Entitlement, Order, PaymentStatus, WebhookEvent
from app.providers import get_provider
from app.schemas import CheckoutRequest


async def create_checkout(session: AsyncSession, request: CheckoutRequest, settings: Settings) -> Order:
    provider_name = "btcpay" if request.provider == "crypto" else request.provider
    order = Order(
        product=request.product,
        user_id=request.user_id,
        provider=provider_name,
        amount=request.amount,
        currency=request.currency.upper(),
        metadata_json=request.metadata,
    )
    session.add(order)
    await session.flush()

    provider = get_provider(provider_name, settings)
    result = await provider.create_checkout(
        order_id=str(order.id),
        product=request.product,
        amount=request.amount,
        currency=request.currency.upper(),
        user_id=request.user_id,
        success_url=str(request.success_url) if request.success_url else None,
        metadata=request.metadata,
    )
    order.provider_payment_id = result.payment_id
    order.checkout_url = result.checkout_url
    order.status = result.status
    await session.commit()
    await session.refresh(order)
    return order


async def process_webhook(
    session: AsyncSession, provider_name: str, body: bytes, headers: dict[str, str], settings: Settings
) -> tuple[bool, Order | None]:
    provider = get_provider(provider_name, settings)
    parsed = provider.parse_webhook(body, headers)
    order = None
    if parsed.payment_id:
        order = await session.scalar(
            select(Order).where(Order.provider == provider.name, Order.provider_payment_id == parsed.payment_id)
        )
        # Gumroad may echo our order UUID before assigning an external sale ID.
        if order is None and provider.name == "gumroad":
            try:
                order = await session.get(Order, UUID(parsed.payment_id))
            except ValueError:
                pass
    event = WebhookEvent(
        provider=provider.name,
        delivery_id=parsed.delivery_id,
        event_type=parsed.event_type,
        payload=parsed.payload,
        order_id=order.id if order else None,
    )
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return False, order

    if order is not None and parsed.status is not None:
        order.status = parsed.status
        if parsed.status == PaymentStatus.paid:
            entitlement = await session.scalar(
                select(Entitlement).where(Entitlement.user_id == order.user_id, Entitlement.product == order.product)
            )
            if entitlement is None:
                entitlement = Entitlement(user_id=order.user_id, product=order.product)
                session.add(entitlement)
            entitlement.active = True
            entitlement.order_id = order.id
        elif parsed.status in {PaymentStatus.refunded, PaymentStatus.cancelled}:
            entitlement = await session.scalar(
                select(Entitlement).where(Entitlement.user_id == order.user_id, Entitlement.product == order.product)
            )
            if entitlement:
                entitlement.active = False
    await session.commit()
    return True, order
