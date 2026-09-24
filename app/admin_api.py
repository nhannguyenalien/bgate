from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.db import get_session
from app.models import Entitlement, Order, PaymentStatus, WebhookEvent

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_api_key)])


def _order_json(order: Order) -> dict[str, object]:
    return {
        "id": str(order.id),
        "product": order.product,
        "user_id": order.user_id,
        "provider": order.provider,
        "provider_payment_id": order.provider_payment_id,
        "status": order.status.value,
        "amount": str(order.amount),
        "currency": order.currency,
        "checkout_url": order.checkout_url,
        "metadata": order.metadata_json,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


def _event_json(event: WebhookEvent) -> dict[str, object]:
    return {
        "id": str(event.id),
        "provider": event.provider,
        "delivery_id": event.delivery_id,
        "event_type": event.event_type,
        "order_id": str(event.order_id) if event.order_id else None,
        "received_at": event.received_at,
    }


@router.get("/dashboard")
async def dashboard(
    q: str = Query(default="", max_length=200),
    provider: str = Query(default="", max_length=30),
    payment_status: str = Query(default="", max_length=30),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    filters = []
    if q:
        filters.append(or_(Order.user_id.ilike(f"%{q}%"), Order.product.ilike(f"%{q}%")))
    if provider:
        filters.append(Order.provider == provider)
    if payment_status:
        try:
            filters.append(Order.status == PaymentStatus(payment_status))
        except ValueError:
            pass

    orders = list(
        (await session.scalars(select(Order).where(*filters).order_by(Order.created_at.desc()).limit(100))).all()
    )
    status_rows = (await session.execute(select(Order.status, func.count(Order.id)).group_by(Order.status))).all()
    status_counts = {status.value: count for status, count in status_rows}
    active_entitlements = await session.scalar(
        select(func.count(Entitlement.id)).where(Entitlement.active.is_(True))
    )
    webhook_count = await session.scalar(select(func.count(WebhookEvent.id)))
    return {
        "orders": [_order_json(order) for order in orders],
        "stats": {
            "total_orders": sum(status_counts.values()),
            "paid": status_counts.get("paid", 0),
            "pending": status_counts.get("pending", 0) + status_counts.get("processing", 0),
            "active_entitlements": active_entitlements or 0,
            "webhook_count": webhook_count or 0,
        },
    }


@router.get("/orders/{order_id}")
async def order_detail(order_id: UUID, session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    events = list(
        (
            await session.scalars(
                select(WebhookEvent)
                .where(WebhookEvent.order_id == order.id)
                .order_by(WebhookEvent.received_at.desc())
            )
        ).all()
    )
    return {"order": _order_json(order), "events": [_event_json(event) for event in events]}


@router.get("/entitlements")
async def entitlements(session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    items = list(
        (await session.scalars(select(Entitlement).order_by(Entitlement.updated_at.desc()).limit(200))).all()
    )
    return {
        "items": [
            {
                "id": str(item.id),
                "user_id": item.user_id,
                "product": item.product,
                "active": item.active,
                "order_id": str(item.order_id) if item.order_id else None,
                "updated_at": item.updated_at,
            }
            for item in items
        ]
    }


@router.get("/webhooks")
async def webhooks(session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    events = list(
        (await session.scalars(select(WebhookEvent).order_by(WebhookEvent.received_at.desc()).limit(200))).all()
    )
    return {"events": [_event_json(event) for event in events]}
