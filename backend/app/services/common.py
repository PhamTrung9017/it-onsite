"""Hàm dùng chung cho các nghiệp vụ: thời gian, cấu hình, nhật ký, thông báo, chuyển trạng thái."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, forbidden, not_found
from app.domain.rules import BusinessConfig
from app.domain.rules import amount_due as amount_due_rule
from app.domain.status import STATUS_LABEL, Status, can_transition
from app.models import (
    AuditLog,
    Notification,
    OutboxMessage,
    Payment,
    Setting,
    Technician,
    Ticket,
    TicketHistory,
    User,
    Warranty,
)

SYSTEM_NAME = "Hệ thống"


def utcnow() -> datetime:
    return datetime.now(UTC)


def load_config(db: Session) -> BusinessConfig:
    row = db.get(Setting, 1)
    if row is None:
        raise ApiError("Hệ thống chưa được cấu hình tham số nghiệp vụ.", 500)
    return BusinessConfig.from_dict(row.data)


def require_roles(user: User, *roles: str) -> None:
    if not any(r in user.roles for r in roles):
        raise forbidden()


def audit(db: Session, actor: User | None, action: str, target: str, detail: str = "") -> None:
    db.add(
        AuditLog(
            at=utcnow(),
            user_id=actor.id if actor else None,
            user_name=actor.name if actor else SYSTEM_NAME,
            action=action,
            target=target,
            detail=detail,
        )
    )


def dispatcher_ids(db: Session) -> list[int]:
    return list(db.scalars(select(User.id).where(User.roles.contains(["DPV"]), User.locked.is_(False))))


def admin_ids(db: Session) -> list[int]:
    return list(db.scalars(select(User.id).where(User.roles.contains(["QTV"]), User.locked.is_(False))))


def tech_user_id(db: Session, tech_id: int | None) -> int | None:
    if tech_id is None:
        return None
    tech = db.get(Technician, tech_id)
    return tech.user_id if tech else None


def tech_of_user(db: Session, user: User) -> Technician | None:
    return db.scalar(select(Technician).where(Technician.user_id == user.id))


def notify(db: Session, user_ids: list[int | None], title: str, body: str, ticket_id: str | None = None) -> None:
    """Thông báo trên web, kèm Telegram và email đưa vào hàng đợi gửi (UC17)."""
    settings = get_settings()
    now = utcnow()
    for user_id in dict.fromkeys(uid for uid in user_ids if uid):
        db.add(Notification(user_id=user_id, title=title, body=body, ticket_id=ticket_id, read=False, created_at=now))
        user = db.get(User, user_id)
        if user is None:
            continue
        if settings.telegram_bot_token and user.telegram_chat_id:
            db.add(OutboxMessage(channel="telegram", recipient=user.telegram_chat_id, subject=title, body=body, next_attempt_at=now))
        if settings.smtp_host and user.email:
            db.add(OutboxMessage(channel="email", recipient=user.email, subject=f"[IT OnSite] {title}", body=body, next_attempt_at=now))


def find_ticket(db: Session, ticket_id: str, lock: bool = False) -> Ticket:
    query = select(Ticket).where(Ticket.id == ticket_id)
    if lock:
        query = query.with_for_update(of=Ticket)
    ticket = db.scalar(query)
    if ticket is None:
        raise not_found("Không tìm thấy phiếu yêu cầu.")
    return ticket


def check_version(ticket: Ticket, version: int | None) -> None:
    """UC08 ngoại lệ 4a: thao tác trên dữ liệu cũ bị từ chối."""
    if version is not None and version != ticket.version:
        raise conflict("Phiếu vừa được người khác cập nhật. Vui lòng tải lại.")


def can_view(db: Session, user: User, ticket: Ticket) -> bool:
    if "QTV" in user.roles or "DPV" in user.roles:
        return True
    if "KHACH" in user.roles and ticket.customer_id == user.id:
        return True
    tech = tech_of_user(db, user)
    return bool(tech and ticket.assignment and ticket.assignment.tech_id == tech.id)


def require_assigned_tech(db: Session, user: User, ticket: Ticket) -> Technician:
    require_roles(user, "KTV")
    tech = tech_of_user(db, user)
    if tech is None or ticket.assignment is None or ticket.assignment.tech_id != tech.id:
        raise forbidden("Bạn không phụ trách phiếu này.")
    return tech


def touch(ticket: Ticket) -> None:
    ticket.version += 1
    ticket.updated_at = utcnow()


def add_history(ticket: Ticket, status: str, actor_name: str, note: str = "") -> None:
    ticket.history.append(TicketHistory(status=status, at=utcnow(), by_name=actor_name, note=note))


def transition(
    db: Session,
    ticket: Ticket,
    target: Status,
    actor: User | None,
    note: str = "",
    actor_name: str | None = None,
    notified_separately: tuple[int | None, ...] = (),
) -> None:
    """Đường chuyển trạng thái duy nhất: kiểm tra hợp lệ, ghi lịch sử, nhật ký, thông báo.

    `notified_separately`: người đã nhận một thông báo riêng cho sự kiện này nên không gửi thêm.
    """
    previous = Status(ticket.status)
    if not can_transition(ticket.status, target):
        raise conflict(f'Không thể chuyển phiếu từ "{STATUS_LABEL[Status(ticket.status)]}" sang "{STATUS_LABEL[target]}".')
    ticket.status = target
    touch(ticket)
    name = actor_name or (actor.name if actor else SYSTEM_NAME)
    add_history(ticket, target, name, note)
    if target in (Status.HOAN_TAT, Status.DA_HUY):
        ticket.device_credentials = ""
        ticket.onsite_code_hash = None
    label = STATUS_LABEL[target]
    audit(db, actor, "CHUYEN_TRANG_THAI", ticket.id, f"{label} – {note}" if note else label)
    recipients: list[int | None] = [tech_user_id(db, ticket.assignment.tech_id if ticket.assignment else None)]
    # Thu hồi phân công là việc nội bộ, khách không cần nhận lý do của kỹ thuật viên.
    if not (previous == Status.DA_PHAN_CONG and target == Status.DA_TIEP_NHAN):
        recipients.append(ticket.customer_id)
    if target in (Status.MOI, Status.DA_HUY, Status.CHO_THANH_TOAN):
        recipients += dispatcher_ids(db)
    skip = {actor.id if actor else None, *notified_separately}
    message = f"Phiếu {ticket.id}: {label}" + (f" ({note})." if note else ".")
    notify(db, [r for r in recipients if r not in skip], "Cập nhật trạng thái phiếu", message, ticket.id)


def approved_total(ticket: Ticket) -> int:
    return sum(
        item.unit_price * item.qty
        for quote in ticket.quotes
        if quote.status in ("DA_DUYET", "DUYET_MOT_PHAN")
        for item in quote.items
        if item.selected
    )


def main_quote_rejected(ticket: Ticket) -> bool:
    return any(q.type == "CHINH" and q.status == "TU_CHOI" for q in ticket.quotes)


def amount_due(ticket: Ticket, config: BusinessConfig) -> int:
    return amount_due_rule(main_quote_rejected(ticket), approved_total(ticket), ticket.is_warranty, config)


def open_payment(db: Session, ticket: Ticket, actor: User, config: BusinessConfig) -> None:
    """Mở bước thanh toán; phiếu không phát sinh chi phí (ví dụ phiếu bảo hành) thì hoàn tất luôn."""
    amount = amount_due(ticket, config) + ticket.late_reschedule_fee
    if amount > 0:
        ticket.payment = Payment(amount=amount, method=None, status="CHO_THANH_TOAN")
        return
    ticket.payment = Payment(amount=0, method=None, status="MIEN_PHI", paid_at=utcnow())
    complete(db, ticket, actor, "Không phát sinh chi phí", config)


def complete(db: Session, ticket: Ticket, actor: User, note: str, config: BusinessConfig) -> None:
    """Hoàn tất phiếu và phát hành bảo hành theo từng hạng mục đã duyệt (BR-07).

    Phiếu bảo hành không phát hành bảo hành mới, thời hạn vẫn tính theo phiếu gốc.
    """
    transition(db, ticket, Status.HOAN_TAT, actor, note, notified_separately=(ticket.customer_id,))
    now = utcnow()
    ticket.completed_at = now
    for quote in [] if ticket.is_warranty else ticket.quotes:
        if quote.status not in ("DA_DUYET", "DUYET_MOT_PHAN"):
            continue
        for item in quote.items:
            if item.selected and item.warranty_days > 0:
                db.add(
                    Warranty(
                        ticket_id=ticket.id,
                        quote_item_id=item.id,
                        device_id=ticket.device_id,
                        customer_id=ticket.customer_id,
                        name=item.name,
                        start_at=now,
                        end_at=now + timedelta(days=item.warranty_days),
                    )
                )
    notify(
        db,
        [ticket.customer_id],
        "Phiếu đã hoàn tất",
        f"Cảm ơn bạn! Phiếu {ticket.id} đã hoàn tất. Bạn có thể đánh giá dịch vụ trong {config.review_window_days} ngày.",
        ticket.id,
    )


def money(value: int) -> str:
    return f"{value:,}".replace(",", ".") + "đ"
