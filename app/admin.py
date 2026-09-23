import hashlib
import hmac
import secrets
import time
from pathlib import Path
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.models import Entitlement, Order, PaymentStatus, WebhookEvent

router = APIRouter(prefix="/admin", include_in_schema=False)
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")
SESSION_COOKIE = "bgate_admin"
SESSION_MAX_AGE = 12 * 60 * 60


def _session_token(username: str, secret: str, issued_at: int | None = None) -> str:
    timestamp = issued_at or int(time.time())
    payload = f"{username}:{timestamp}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def _valid_session(token: str, username: str, secret: str, now: int | None = None) -> bool:
    if not token or not username or not secret:
        return False
    try:
        token_username, timestamp_text, signature = token.rsplit(":", 2)
        timestamp = int(timestamp_text)
    except (ValueError, TypeError):
        return False
    current_time = now or int(time.time())
    if token_username != username or timestamp > current_time + 60 or current_time - timestamp > SESSION_MAX_AGE:
        return False
    expected = _session_token(username, secret, timestamp).rsplit(":", 1)[1]
    return secrets.compare_digest(signature, expected)


def _is_authenticated(request: Request, settings: Settings) -> bool:
    return _valid_session(
        request.cookies.get(SESSION_COOKIE, ""),
        settings.admin_username,
        settings.admin_session_secret.get_secret_value(),
    )


def _login_redirect() -> RedirectResponse:
    return RedirectResponse("/admin/login", status_code=303)


def _context(request: Request, section: str, **values: object) -> dict[str, object]:
    return {"request": request, "section": section, **values}


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, settings: Settings = Depends(get_settings)) -> Response:
    if _is_authenticated(request, settings):
        return RedirectResponse("/admin", status_code=303)
    return templates.TemplateResponse(request, "login.html", _context(request, "login", error=None))


@router.post("/login")
async def login(request: Request, settings: Settings = Depends(get_settings)) -> Response:
    form = parse_qs((await request.body()).decode())
    username = form.get("username", [""])[0]
    password = form.get("password", [""])[0]
    expected_password = settings.admin_password.get_secret_value()
    valid = bool(expected_password and settings.admin_session_secret.get_secret_value())
    valid = valid and secrets.compare_digest(username, settings.admin_username)
    valid = valid and secrets.compare_digest(password, expected_password)
    if not valid:
        return templates.TemplateResponse(
            request,
            "login.html",
            _context(request, "login", error="Tên đăng nhập hoặc mật khẩu không đúng."),
            status_code=401,
        )
    response = RedirectResponse("/admin", status_code=303)
    response.set_cookie(
        SESSION_COOKIE,
        _session_token(settings.admin_username, settings.admin_session_secret.get_secret_value()),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
        path="/admin",
    )
    return response


@router.post("/logout")
async def logout() -> RedirectResponse:
    response = RedirectResponse("/admin/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/admin")
    return response


@router.get("", response_class=HTMLResponse)
async def dashboard(
    request: Request,
    q: str = "",
    provider: str = "",
    payment_status: str = "",
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    if not _is_authenticated(request, settings):
        return _login_redirect()

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
        (
            await session.scalars(
                select(Order).where(*filters).order_by(Order.created_at.desc()).limit(100)
            )
        ).all()
    )
    status_rows = (
        await session.execute(select(Order.status, func.count(Order.id)).group_by(Order.status))
    ).all()
    status_counts = {status.value: count for status, count in status_rows}
    total_orders = sum(status_counts.values())
    active_entitlements = await session.scalar(
        select(func.count(Entitlement.id)).where(Entitlement.active.is_(True))
    )
    webhook_count = await session.scalar(select(func.count(WebhookEvent.id)))
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        _context(
            request,
            "orders",
            orders=orders,
            q=q,
            provider=provider,
            payment_status=payment_status,
            statuses=list(PaymentStatus),
            status_counts=status_counts,
            total_orders=total_orders,
            active_entitlements=active_entitlements or 0,
            webhook_count=webhook_count or 0,
        ),
    )


@router.get("/orders/{order_id}", response_class=HTMLResponse)
async def order_detail(
    order_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    if not _is_authenticated(request, settings):
        return _login_redirect()
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    event_query = (
        select(WebhookEvent)
        .where(WebhookEvent.order_id == order.id)
        .order_by(WebhookEvent.received_at.desc())
    )
    events = list((await session.scalars(event_query)).all())
    return templates.TemplateResponse(
        request, "order_detail.html", _context(request, "orders", order=order, events=events)
    )


@router.get("/entitlements", response_class=HTMLResponse)
async def entitlements(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    if not _is_authenticated(request, settings):
        return _login_redirect()
    items = list(
        (await session.scalars(select(Entitlement).order_by(Entitlement.updated_at.desc()).limit(200))).all()
    )
    return templates.TemplateResponse(
        request, "entitlements.html", _context(request, "entitlements", items=items)
    )


@router.get("/webhooks", response_class=HTMLResponse)
async def webhooks(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    if not _is_authenticated(request, settings):
        return _login_redirect()
    events = list(
        (await session.scalars(select(WebhookEvent).order_by(WebhookEvent.received_at.desc()).limit(200))).all()
    )
    return templates.TemplateResponse(request, "webhooks.html", _context(request, "webhooks", events=events))
