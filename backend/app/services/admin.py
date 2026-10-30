"""Quản trị: kỹ thuật viên, dịch vụ, linh kiện, tài khoản, cấu hình, nhật ký (UC18–UC20, UC22, UC23)."""

import re
import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, not_found
from app.core.security import hash_password, new_opaque_token, token_digest
from app.domain.areas import WARDS
from app.domain.rules import BusinessConfig
from app.domain.status import BUSY_STATUSES, Status
from app.models import (
    Assignment,
    AuditLog,
    Category,
    OutboxMessage,
    Part,
    PasswordResetToken,
    Service,
    Setting,
    Technician,
    Ticket,
    User,
)
from app.services.auth import email_taken, validate_email, validate_phone
from app.services.common import audit, load_config, require_roles, utcnow

ROLES = ("KHACH", "KTV", "DPV", "QTV")
SETUP_LINK_HOURS = 72
AUDIT_LIMIT = 80


def overview(db: Session, user: User) -> dict:
    require_roles(user, "QTV")
    config = load_config(db)
    techs = db.scalars(select(Technician).order_by(Technician.id)).all()
    stats = {}
    rows = db.execute(
        select(Assignment.tech_id, Ticket.id, Ticket.status).join(Ticket, Ticket.id == Assignment.ticket_id).order_by(Assignment.id)
    ).all()
    latest = {}
    for tech_id, ticket_id, status in rows:
        latest[ticket_id] = (tech_id, status)
    for tech_id, status in latest.values():
        done, busy = stats.get(tech_id, (0, 0))
        stats[tech_id] = (done + (status == Status.HOAN_TAT), busy + (Status(status) in BUSY_STATUSES))
    return {
        "techs": techs,
        "techStats": stats,
        "services": db.scalars(select(Service).order_by(Service.id)).all(),
        "parts": db.scalars(select(Part).order_by(Part.id)).all(),
        "categories": db.scalars(select(Category).order_by(Category.position)).all(),
        "users": db.scalars(select(User).order_by(User.id)).all(),
        "config": config,
        "allAreas": list(dict.fromkeys(WARDS + config.areas)),
        "audit": db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(AUDIT_LIMIT)).all(),
    }


def save_service(db: Session, user: User, data) -> Service:
    require_roles(user, "QTV")
    if not data.name.strip():
        raise ApiError("Vui lòng nhập tên dịch vụ.")
    if data.price < 0 or data.duration_min <= 0 or data.warranty_days < 0:
        raise ApiError("Giá, thời lượng và thời hạn bảo hành phải là số hợp lệ.")
    if db.get(Category, data.category_code) is None:
        raise ApiError("Loại sự cố không hợp lệ.")
    if data.id:
        service = db.get(Service, data.id)
        if service is None:
            raise not_found("Không tìm thấy dịch vụ.")
        audit(db, user, "SUA_BANG_GIA", str(service.id), f"{service.name}: {service.price} → {data.price}")
    else:
        service = Service()
        db.add(service)
    service.name = data.name.strip()
    service.category_code = data.category_code
    service.price = data.price
    service.duration_min = data.duration_min
    service.warranty_days = data.warranty_days
    service.active = data.active
    db.flush()
    if not data.id:
        audit(db, user, "THEM_DICH_VU", str(service.id), service.name)
    return service


def save_part(db: Session, user: User, data) -> Part:
    require_roles(user, "QTV")
    if not data.name.strip():
        raise ApiError("Vui lòng nhập tên linh kiện.")
    if data.price < 0 or data.stock < 0 or data.warranty_days < 0:
        raise ApiError("Giá, tồn kho và bảo hành phải là số không âm.")
    if data.id:
        part = db.get(Part, data.id)
        if part is None:
            raise not_found("Không tìm thấy linh kiện.")
    else:
        part = Part()
        db.add(part)
    part.name = data.name.strip()
    part.price = data.price
    part.stock = data.stock
    part.warranty_days = data.warranty_days
    part.active = data.active
    db.flush()
    audit(db, user, "SUA_LINH_KIEN" if data.id else "THEM_LINH_KIEN", str(part.id), part.name)
    return part


def send_setup_link(db: Session, user: User) -> None:
    """Tài khoản do quản trị viên tạo nhận email để tự đặt mật khẩu."""
    token = new_opaque_token()
    db.add(PasswordResetToken(user_id=user.id, token_hash=token_digest(token), expires_at=utcnow() + timedelta(hours=SETUP_LINK_HOURS)))
    link = f"{get_settings().app_url}/dat-lai-mat-khau?token={token}"
    db.add(
        OutboxMessage(
            channel="email",
            recipient=user.email,
            subject="[IT OnSite] Tài khoản của bạn đã được tạo",
            body=f"Chào {user.name},\n\nTài khoản IT OnSite của bạn đã được tạo. Bấm vào liên kết sau để đặt mật khẩu "
            f"(hiệu lực {SETUP_LINK_HOURS} giờ):\n{link}",
            next_attempt_at=utcnow(),
        )
    )


def _new_internal_user(db: Session, name: str, email: str, phone: str, roles: list[str]) -> User:
    if not name.strip():
        raise ApiError("Vui lòng nhập họ tên.")
    email = validate_email(email)
    phone = validate_phone(phone) if phone else ""
    if email_taken(db, email, phone or None):
        raise conflict("Email hoặc số điện thoại đã tồn tại.")
    now = utcnow()
    user = User(
        name=name.strip(),
        email=email,
        phone=phone,
        password_hash=hash_password(secrets.token_urlsafe(24)),
        roles=roles,
        consent_at=now,
        created_at=now,
    )
    db.add(user)
    db.flush()
    send_setup_link(db, user)
    return user


def _clean_skills_areas(db: Session, skills: list[str], areas: list[str]) -> tuple[list[str], list[str]]:
    codes = set(db.scalars(select(Category.code)))
    if not skills or any(s not in codes for s in skills):
        raise ApiError("Kỹ thuật viên cần ít nhất một kỹ năng hợp lệ.")
    if not areas:
        raise ApiError("Kỹ thuật viên cần ít nhất một khu vực phụ trách.")
    return list(dict.fromkeys(skills)), list(dict.fromkeys(areas))


def save_technician(db: Session, admin: User, data) -> Technician:
    require_roles(admin, "QTV")
    skills, areas = _clean_skills_areas(db, data.skills, data.areas)
    if data.id:
        tech = db.get(Technician, data.id)
        if tech is None:
            raise not_found("Không tìm thấy kỹ thuật viên.")
        tech.skills, tech.areas, tech.active = skills, areas, data.active
        if data.name and data.name.strip():
            tech.user.name = data.name.strip()
        if data.phone:
            tech.user.phone = validate_phone(data.phone)
        audit(db, admin, "SUA_KTV", str(tech.id), tech.user.name)
        return tech
    user = _new_internal_user(db, data.name, data.email or "", data.phone or "", ["KTV"])
    tech = Technician(user_id=user.id, skills=skills, areas=areas, rating=5, rating_count=0, active=True)
    db.add(tech)
    db.flush()
    audit(db, admin, "THEM_KTV", str(tech.id), user.name)
    return tech


def _ensure_technician(db: Session, user: User, config: BusinessConfig) -> None:
    if db.scalar(select(func.count()).select_from(Technician).where(Technician.user_id == user.id)) == 0:
        db.add(Technician(user_id=user.id, skills=["KHAC"], areas=config.areas[:1], rating=5, rating_count=0, active=True))


def save_roles(db: Session, admin: User, user_id: int, roles: list[str], locked: bool) -> User:
    require_roles(admin, "QTV")
    user = db.get(User, user_id)
    if user is None:
        raise not_found("Không tìm thấy tài khoản.")
    roles = [r for r in ROLES if r in roles]
    if not roles:
        raise ApiError("Tài khoản cần ít nhất một vai trò.")
    if user.id == admin.id and ("QTV" not in roles or locked):
        raise conflict("Không thể tự gỡ quyền quản trị hoặc tự khóa tài khoản của mình.")
    if "KTV" in roles:
        _ensure_technician(db, user, load_config(db))
    user.roles = roles
    user.locked = locked
    audit(db, admin, "PHAN_QUYEN", user.email, ", ".join(roles) + (" (khóa)" if locked else ""))
    return user


def create_internal_user(db: Session, admin: User, name: str, email: str, phone: str, roles: list[str]) -> User:
    require_roles(admin, "QTV")
    roles = [r for r in ROLES if r in roles and r != "KHACH"]
    if not roles:
        raise ApiError("Chọn ít nhất một vai trò.")
    user = _new_internal_user(db, name, email, phone, roles)
    if "KTV" in roles:
        _ensure_technician(db, user, load_config(db))
    audit(db, admin, "TAO_TAI_KHOAN", user.email, ", ".join(roles))
    return user


def save_config(db: Session, admin: User, data: dict) -> BusinessConfig:
    require_roles(admin, "QTV")
    try:
        config = BusinessConfig.from_dict(data)
    except (KeyError, TypeError, ValueError) as exc:
        raise ApiError("Các tham số phải là số hợp lệ.") from exc
    if (
        config.survey_fee < 0
        or config.free_cancel_hours < 0
        or config.tech_response_minutes < 1
        or config.travel_buffer_minutes < 0
        or config.review_window_days < 1
        or not 0 <= config.ai_confidence_threshold <= 1
    ):
        raise ApiError("Các tham số phải là số hợp lệ.")
    if not re.match(r"^\d{2}:\d{2}$", config.service_start) or not re.match(r"^\d{2}:\d{2}$", config.service_end):
        raise ApiError("Giờ phục vụ không hợp lệ.")
    if config.service_start >= config.service_end:
        raise ApiError("Giờ bắt đầu phục vụ phải trước giờ kết thúc.")
    if not config.areas:
        raise ApiError("Cần ít nhất một khu vực phục vụ.")
    if not re.match(r"^\d{6}$", config.bank_bin) or not re.match(r"^\d{6,19}$", config.bank_account_number):
        raise ApiError("Mã BIN gồm 6 chữ số, số tài khoản gồm 6–19 chữ số.")
    row = db.get(Setting, 1)
    row.data = config.to_dict()
    audit(db, admin, "CAU_HINH", "tham số nghiệp vụ")
    return config
