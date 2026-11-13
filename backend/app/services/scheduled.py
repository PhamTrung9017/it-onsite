"""Thông báo theo giờ: nhắc kỹ thuật viên trước giờ hẹn, tổng kết cuối ngày vào nhóm Telegram.

Máy chủ miễn phí có thể đang ngủ đúng lúc cần gửi; khi thức lại, tác vụ nền chạy bù:
- nhắc lịch vẫn gửi nếu chưa tới giờ hẹn;
- tổng kết của một ngày gửi được từ giờ đóng cửa tới giờ mở cửa hôm sau.
Mỗi lần gửi được ghi vào bảng job_runs nên không gửi trùng.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.domain.status import Status
from app.models import Assignment, JobRun, Technician, Ticket
from app.services import telegram
from app.services.common import load_config, notify, utcnow
from app.services.telegram_commands import daily_summary

REMINDER_MINUTES = 60


def _mark(db: Session, name: str, period: str) -> bool:
    """Ghi dấu đã chạy; trả về False nếu đã có dấu (kể cả do tiến trình khác vừa ghi)."""
    statement = insert(JobRun).values(name=name, period=period, ran_at=utcnow()).on_conflict_do_nothing().returning(JobRun.name)
    return db.execute(statement).scalar() is not None


def send_reminders(db: Session) -> int:
    """Nhắc kỹ thuật viên các lịch hẹn đã nhận trong 60 phút tới (tin riêng Telegram và thông báo trên web)."""
    now = utcnow()
    tickets = db.scalars(
        select(Ticket)
        .join(Assignment, Assignment.ticket_id == Ticket.id)
        .where(Ticket.status == Status.KTV_DA_NHAN)
        .where(Assignment.appointment_at > now, Assignment.appointment_at <= now + timedelta(minutes=REMINDER_MINUTES))
        .distinct()
    ).all()
    sent = 0
    for ticket in tickets:
        assignment = ticket.assignment
        if not assignment or not now < assignment.appointment_at <= now + timedelta(minutes=REMINDER_MINUTES):
            continue
        if not _mark(db, "nhac_lich", f"{ticket.id}:{assignment.tech_id}:{assignment.appointment_at.isoformat()}"):
            continue
        tech = db.get(Technician, assignment.tech_id)
        minutes = max(1, round((assignment.appointment_at - now).total_seconds() / 60))
        customer = ticket.customer
        notify(
            db,
            [tech.user_id],
            "Sắp tới giờ hẹn",
            f"Còn khoảng {minutes} phút tới lịch hẹn {telegram.job_summary(db, ticket)}, địa chỉ {ticket.address}. "
            f"Khách: {customer.name}, {customer.phone}.",
            ticket.id,
            email=False,
        )
        sent += 1
    return sent


def _clock(value: str):
    return datetime.strptime(value, "%H:%M").time()


def send_daily_summary(db: Session, now: datetime | None = None) -> bool:
    """Gửi tổng kết ngày vào nhóm sau giờ đóng cửa (chạy bù tới giờ mở cửa hôm sau)."""
    config = load_config(db)
    if not telegram.enabled() or not config.telegram_group_chat_id:
        return False
    local = (now or utcnow()).astimezone(get_settings().tz)
    if local.time() >= _clock(config.service_end):
        day = local.date()
    elif local.time() < _clock(config.service_start):
        day = local.date() - timedelta(days=1)
    else:
        return False
    if not _mark(db, "tong_ket_ngay", day.isoformat()):
        return False
    telegram.post_group(db, daily_summary(db, day))
    return True
