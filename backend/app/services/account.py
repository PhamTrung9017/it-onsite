"""Hồ sơ, thiết bị, dữ liệu cá nhân, thông báo và liên kết Telegram của người dùng (UC02, UC17, NFR-10)."""

import secrets

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, not_found
from app.domain.rules import warranty_status
from app.domain.status import CLOSED_STATUSES, STATUS_LABEL, Status
from app.models import Device, Notification, Ticket, User, Warranty
from app.services.auth import validate_phone
from app.services.common import admin_ids, audit, load_config, notify, require_roles, utcnow
from app.services.present import device_json, iso, user_json

DEVICE_TYPES = ("Laptop", "PC", "Thiết bị khác")
NOTIFICATION_LIMIT = 100


def update_profile(db: Session, user: User, name: str | None, phone: str | None, address: str | None, ward: str | None) -> User:
    if phone:
        phone = validate_phone(phone)
        taken = db.scalar(select(func.count()).select_from(User).where(User.phone == phone, User.id != user.id))
        if taken:
            raise conflict("Số điện thoại đã được dùng cho tài khoản khác.")
        user.phone = phone
    if name and name.strip():
        user.name = name.strip()
    if address is not None:
        user.address = address.strip()
    if ward is not None:
        if ward and ward not in load_config(db).areas:
            raise ApiError("Phường này hiện chưa nằm trong khu vực phục vụ.")
        user.ward = ward
    audit(db, user, "CAP_NHAT_HO_SO", str(user.id))
    return user


def list_devices(db: Session, user: User) -> list[dict]:
    now = utcnow()
    devices = db.scalars(select(Device).where(Device.customer_id == user.id, Device.removed.is_(False)).order_by(Device.id)).all()
    result = []
    for device in devices:
        repairs = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.device_id == device.id, Ticket.status == Status.HOAN_TAT))
        warranties = db.scalars(select(Warranty).where(Warranty.device_id == device.id)).all()
        active = sum(1 for w in warranties if warranty_status(w.end_at, now)["valid"])
        result.append({"device": device, "repairCount": repairs, "activeWarranties": active})
    return result


def add_device(db: Session, user: User, device_type: str, brand: str, model: str) -> Device:
    require_roles(user, "KHACH")
    if device_type not in DEVICE_TYPES:
        raise ApiError("Loại thiết bị không hợp lệ.")
    if not brand.strip() or not model.strip():
        raise ApiError("Vui lòng nhập hãng và dòng máy.")
    device = Device(customer_id=user.id, type=device_type, brand=brand.strip(), model=model.strip())
    db.add(device)
    db.flush()
    return device


def remove_device(db: Session, user: User, device_id: int) -> None:
    device = db.get(Device, device_id)
    if device is None or device.customer_id != user.id:
        raise not_found("Không tìm thấy thiết bị.")
    in_use = db.scalar(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.device_id == device.id, Ticket.status.not_in([s.value for s in CLOSED_STATUSES]))
    )
    if in_use:
        raise conflict("Thiết bị đang có phiếu xử lý, chưa thể xóa.")
    device.removed = True


def export_my_data(db: Session, user: User) -> dict:
    """NFR-10: chủ thể dữ liệu xem và tải dữ liệu của mình."""
    tickets = db.scalars(select(Ticket).where(Ticket.customer_id == user.id).order_by(Ticket.created_at)).all()
    warranties = db.scalars(select(Warranty).where(Warranty.customer_id == user.id)).all()
    devices = db.scalars(select(Device).where(Device.customer_id == user.id)).all()
    return {
        "exportedAt": iso(utcnow()),
        "profile": user_json(user),
        "consentAt": iso(user.consent_at),
        "devices": [device_json(d) for d in devices],
        "tickets": [
            {
                "id": t.id,
                "status": STATUS_LABEL[Status(t.status)],
                "description": t.description,
                "address": t.address,
                "createdAt": iso(t.created_at),
            }
            for t in tickets
        ],
        "warranties": [
            {"id": w.id, "ticketId": w.ticket_id, "name": w.name, "startAt": iso(w.start_at), "endAt": iso(w.end_at)} for w in warranties
        ],
    }


def request_data_deletion(db: Session, user: User, reason: str) -> None:
    open_tickets = db.scalar(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.customer_id == user.id, Ticket.status.not_in([s.value for s in CLOSED_STATUSES]))
    )
    if open_tickets:
        raise conflict("Bạn còn phiếu đang xử lý. Yêu cầu xóa dữ liệu sẽ thực hiện được sau khi các phiếu kết thúc.")
    notify(
        db,
        admin_ids(db),
        "Yêu cầu xóa dữ liệu cá nhân",
        f"{user.name} yêu cầu xóa dữ liệu cá nhân. Lý do: {reason.strip() or 'không ghi'}.",
    )
    audit(db, user, "YEU_CAU_XOA_DU_LIEU", str(user.id), reason.strip())


def list_notifications(db: Session, user: User) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(NOTIFICATION_LIMIT)
        )
    )


def mark_read(db: Session, user: User, ids: list[int] | None) -> None:
    query = update(Notification).where(Notification.user_id == user.id, Notification.read.is_(False))
    if ids:
        query = query.where(Notification.id.in_(ids))
    db.execute(query.values(read=True))


def telegram_link(db: Session, user: User) -> dict:
    """Tạo liên kết mở bot Telegram; bot nhận lệnh /start kèm mã để gắn chat với tài khoản."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_bot_username:
        raise ApiError("Hệ thống chưa bật thông báo qua Telegram.", 503)
    user.telegram_link_code = secrets.token_urlsafe(12)
    return {"url": f"https://t.me/{settings.telegram_bot_username}?start={user.telegram_link_code}"}


def bind_telegram(db: Session, code: str, chat_id: str) -> User | None:
    user = db.scalar(select(User).where(User.telegram_link_code == code))
    if user is None:
        return None
    user.telegram_chat_id = chat_id
    user.telegram_link_code = None
    audit(db, user, "LIEN_KET_TELEGRAM", str(user.id))
    return user
