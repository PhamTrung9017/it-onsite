"""Hàm dùng chung cho các nghiệp vụ: thời gian, cấu hình, nhật ký, thông báo, chuyển trạng thái."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, forbidden, not_found
from app.domain.rules import BusinessConfig
from app.domain.rules import amount_due as amount_due_rule
from app.domain.status import STATUS_LABEL, DepositStatus, Status, can_transition
from app.models import (
    AuditLog,
    Notification,
    OutboxMessage,
    Setting,
    Technician,
    Ticket,
    TicketHistory,
    User,
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


def notify(
    db: Session,
    user_ids: list[int | None],
    title: str,
    body: str,
    ticket_id: str | None = None,
    email: bool = True,
    buttons: dict | None = None,
) -> None:
    """Thông báo trên web, kèm Telegram và email đưa vào hàng đợi gửi (UC17).

    `email=False` khi đã gửi email riêng; `buttons` là nút bấm kèm tin Telegram.
    """
    settings = get_settings()
    now = utcnow()
    for user_id in dict.fromkeys(uid for uid in user_ids if uid):
        db.add(Notification(user_id=user_id, title=title, body=body, ticket_id=ticket_id, read=False, created_at=now))
        user = db.get(User, user_id)
        if user is None:
            continue
        if settings.telegram_bot_token and user.telegram_chat_id:
            db.add(
                OutboxMessage(
                    channel="telegram", recipient=user.telegram_chat_id, subject=title, body=body, reply_markup=buttons, next_attempt_at=now
                )
            )
        if email and settings.email_enabled and user.email:
            db.add(OutboxMessage(channel="email", recipient=user.email, subject=f"[IT OnSite] {title}", body=body, next_attempt_at=now))


def page_of(db: Session, query, limit: int, offset: int) -> tuple[list, int]:
    """Một trang kết quả của câu truy vấn kèm tổng số bản ghi."""
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    return list(db.scalars(query.limit(limit).offset(offset))), total


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


def deposit_held(ticket: Ticket) -> int:
    """Phí giữ lịch cửa hàng đã nhận của phiếu, được trừ vào số tiền thanh toán."""
    deposit = ticket.deposit
    return deposit.amount if deposit and deposit.status in (DepositStatus.DA_XAC_NHAN, DepositStatus.DA_TRU) else 0


def ticket_revenue(ticket: Ticket) -> int:
    """Tiền thu của phiếu: số tiền thanh toán cộng phí giữ lịch đã trừ vào đó."""
    deposit = ticket.deposit
    applied = deposit.amount if deposit and deposit.status == DepositStatus.DA_TRU else 0
    return (ticket.payment.amount if ticket.payment else 0) + applied


def amount_due(ticket: Ticket, config: BusinessConfig) -> int:
    return amount_due_rule(main_quote_rejected(ticket), approved_total(ticket), ticket.is_warranty, config, deposit_held(ticket))


def money(value: int) -> str:
    return f"{value:,}".replace(",", ".") + "đ"
