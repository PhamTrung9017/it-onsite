"""Khách đặt lịch không cần tài khoản; tra cứu, thao tác trên đơn bằng mã đơn và số điện thoại.

- Số điện thoại chưa có trong hệ thống: tạo hồ sơ khách đặt nhanh (`is_guest`, không có mật khẩu).
- Số điện thoại thuộc tài khoản khách đã đăng ký: đơn gắn vào tài khoản đó, chủ tài khoản đăng nhập là thấy.
- Khách đặt nhanh đăng ký tài khoản bằng cùng số điện thoại: hồ sơ thành tài khoản, giữ nguyên các đơn (`auth.register`).
- Phiên tra cứu là access token có `ticket` (`create_access_token`), chỉ dùng cho đơn đó (`deps.current_user`).
"""

import time
from collections import defaultdict, deque
from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict
from app.core.security import create_access_token
from app.models import Device, OutboxMessage, Ticket, User
from app.services import account, tickets
from app.services.auth import email_taken, validate_email, validate_phone
from app.services.common import audit, utcnow
from app.services.present import user_json

TOKEN_MINUTES = 120
LOOKUP_LIMIT, LOOKUP_WINDOW = 10, 15 * 60
CLASSIFY_LIMIT, CLASSIFY_WINDOW = 20, 60 * 60
BOOKING_LIMIT, BOOKING_WINDOW = 10, 60 * 60
_hits: dict[str, deque] = defaultdict(deque)


def throttle(key: str, limit: int, window: int, message: str) -> None:
    """Giới hạn số lần trong một khoảng thời gian theo khóa (địa chỉ IP); lưu trong bộ nhớ tiến trình."""
    now = time.monotonic()
    hits = _hits[key]
    while hits and now - hits[0] > window:
        hits.popleft()
    if len(hits) >= limit:
        raise ApiError(message, 429)
    hits.append(now)


def _customer(db: Session, name: str, phone: str, email: str) -> User:
    if not name.strip():
        raise ApiError("Vui lòng nhập họ tên.")
    phone = validate_phone(phone)
    email = validate_email(email) if email.strip() else None
    user = db.scalar(select(User).where(User.phone == phone))
    if user is not None and not user.is_guest:
        if "KHACH" not in user.roles or user.locked:
            raise conflict("Số điện thoại này không dùng để đặt lịch được. Vui lòng dùng số khác.")
        return user
    if email and email_taken(db, email) and not (user and (user.email or "").lower() == email.lower()):
        raise conflict("Email này đã thuộc một tài khoản. Vui lòng đăng nhập hoặc để trống email.")
    now = utcnow()
    if user is None:
        user = User(phone=phone, password_hash="", roles=["KHACH"], is_guest=True, created_at=now)
        db.add(user)
    user.name = name.strip()
    if email:
        user.email = email
    user.consent_at = now
    db.flush()
    return user


def _device(db: Session, user: User, device_type: str, brand: str, model: str) -> Device:
    same = db.scalar(
        select(Device).where(
            Device.customer_id == user.id,
            Device.type == device_type,
            Device.brand == brand.strip(),
            Device.model == model.strip(),
            Device.removed.is_(False),
        )
    )
    return same or account.add_device(db, user, device_type, brand, model)


def create_ticket(db: Session, body) -> tuple[Ticket, User]:
    user = _customer(db, body.name, body.phone, body.email)
    device = _device(db, user, body.device_type, body.device_brand, body.device_model)
    fields = body.model_dump(exclude={"name", "phone", "email", "device_type", "device_brand", "device_model"})
    ticket = tickets.create_ticket(db, user, SimpleNamespace(**fields, device_id=device.id))
    audit(db, user, "DAT_LICH_NHANH", ticket.id)
    if user.email:
        url = get_settings().app_url.rstrip("/")
        db.add(
            OutboxMessage(
                channel="email",
                recipient=user.email,
                subject=f"[IT OnSite] Mã đơn {ticket.id}",
                body=(
                    f"Chào {user.name},\n\nIT OnSite đã nhận đơn {ticket.id}.\n"
                    f"Tra cứu và theo dõi đơn tại {url}/tra-cuu bằng mã đơn {ticket.id} và số điện thoại {user.phone}.\n\n"
                    "Bạn có thể đăng ký tài khoản bằng số điện thoại này để xem lại mọi đơn đã đặt.\n\nIT OnSite"
                ),
                next_attempt_at=utcnow(),
            )
        )
    return ticket, user


def lookup(db: Session, ticket_id: str, phone: str, client: str) -> tuple[Ticket, User]:
    throttle(f"tra-cuu:{client}", LOOKUP_LIMIT, LOOKUP_WINDOW, "Bạn tra cứu sai quá nhiều lần. Vui lòng thử lại sau 15 phút.")
    ticket = db.get(Ticket, ticket_id.strip().upper())
    try:
        phone = validate_phone(phone)
    except ApiError:
        phone = ""
    if ticket is None or not phone or phone not in (ticket.customer.phone, ticket.contact_phone) or ticket.customer.locked:
        raise ApiError("Không tìm thấy đơn với mã đơn và số điện thoại này.", 404)
    return ticket, ticket.customer


def session(user: User, ticket_id: str) -> dict:
    user.scope_ticket = ticket_id
    token = create_access_token(user.id, list(user.roles), ticket=ticket_id, minutes=TOKEN_MINUTES)
    return {"accessToken": token, "user": user_json(user)}
