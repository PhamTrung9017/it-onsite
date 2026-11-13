"""Thông báo theo giờ: nhắc kỹ thuật viên trước giờ hẹn, tổng kết cuối ngày vào nhóm."""

from datetime import datetime, time, timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.domain.status import Status
from app.models import Assignment, Notification, OutboxMessage, Setting, Ticket, User
from app.services import scheduled
from app.services.common import load_config, utcnow
from app.services.reports import _completed_between

GROUP = "-100777"


def job_of(tech_email: str) -> str:
    """Một phiếu của kỹ thuật viên, đặt về trạng thái đã nhận việc."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == tech_email))
        ticket = db.scalars(
            select(Ticket).join(Assignment, Assignment.ticket_id == Ticket.id).where(Assignment.tech_id == user.technician.id)
        ).first()
        ticket.status = Status.KTV_DA_NHAN
        ticket.assignment.result = "NHAN"
        db.commit()
        return ticket.id


def set_appointment(ticket_id: str, delta: timedelta, status: Status = Status.KTV_DA_NHAN) -> None:
    with SessionLocal() as db:
        ticket = db.get(Ticket, ticket_id)
        ticket.assignment.appointment_at = utcnow() + delta
        ticket.status = status
        db.commit()


def reminders_for(ticket_id: str) -> list[str]:
    with SessionLocal() as db:
        scheduled.send_reminders(db)
        db.commit()
        return list(
            db.scalars(select(Notification.body).where(Notification.ticket_id == ticket_id, Notification.title == "Sắp tới giờ hẹn"))
        )


def test_reminder_sent_once_within_an_hour(ktv, monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "token")
    ticket_id = job_of("ktv@demo.vn")
    with SessionLocal() as db:
        db.scalar(select(User).where(User.email == "ktv@demo.vn")).telegram_chat_id = "111"
        db.commit()

    set_appointment(ticket_id, timedelta(minutes=90))
    assert reminders_for(ticket_id) == [], "còn hơn 60 phút thì chưa nhắc"
    set_appointment(ticket_id, timedelta(minutes=-5))
    assert reminders_for(ticket_id) == [], "đã qua giờ hẹn thì không nhắc"
    set_appointment(ticket_id, timedelta(minutes=30), Status.DANG_KHAO_SAT)
    assert reminders_for(ticket_id) == [], "đã check-in thì không nhắc"

    set_appointment(ticket_id, timedelta(minutes=30))
    sent = reminders_for(ticket_id)
    assert len(sent) == 1 and sent[0].startswith("Còn khoảng 30 phút tới lịch hẹn") and "Khách:" in sent[0]
    assert len(reminders_for(ticket_id)) == 1, "không nhắc trùng"
    with SessionLocal() as db:
        query = select(OutboxMessage).where(OutboxMessage.recipient == "111", OutboxMessage.subject == "Sắp tới giờ hẹn")
        telegram_rows = db.scalars(query)
        assert len(list(telegram_rows)) == 1
    ktv_notes = ktv.ok("get", "/notifications")
    assert any(n["title"] == "Sắp tới giờ hẹn" for n in ktv_notes)

    set_appointment(ticket_id, timedelta(minutes=45))
    assert len(reminders_for(ticket_id)) == 2, "đổi giờ hẹn thì nhắc lại theo giờ mới"


@pytest.fixture
def group(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "token")
    with SessionLocal() as db:
        row = db.get(Setting, 1)
        row.data = {**row.data, "telegramGroupChatId": GROUP}
        db.commit()


def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    tz = get_settings().tz
    return datetime.combine(datetime.now(tz).date() + timedelta(days=day_offset), time(hour, minute), tzinfo=tz)


def summaries() -> list[str]:
    with SessionLocal() as db:
        return list(db.scalars(select(OutboxMessage.body).where(OutboxMessage.recipient == GROUP).order_by(OutboxMessage.id)))


def run(now: datetime) -> bool:
    with SessionLocal() as db:
        sent = scheduled.send_daily_summary(db, now)
        db.commit()
        return sent


def test_daily_summary_after_closing_time(group):
    with SessionLocal() as db:
        assert load_config(db).telegram_group_chat_id == GROUP
    assert run(at(0, 12)) is False, "đang giờ làm việc thì chưa tổng kết"
    assert run(at(0, 20, 5)) is True
    assert run(at(0, 22)) is False, "đã gửi rồi thì không gửi lại"
    assert run(at(1, 7)) is False, "sáng hôm sau vẫn là tổng kết của hôm trước, đã gửi"
    assert run(at(1, 9)) is False

    text = summaries()[0]
    assert text.startswith(f"Tổng kết ngày {at(0, 0).strftime('%d/%m')}:")
    with SessionLocal() as db:
        done = _completed_between(db, at(0, 0), at(1, 0))
    assert f"Hoàn tất: {len(done)}" in text and "Hoàn tất theo kỹ thuật viên:" in text and "Doanh thu:" in text
    assert f"• Ngày {at(1, 0).strftime('%d/%m')}:" in text


def test_daily_summary_catches_up_before_opening(group):
    assert run(at(-1, 7)) is True, "máy chủ thức lúc 07:00: gửi bù tổng kết của hôm trước"
    assert summaries()[0].startswith(f"Tổng kết ngày {at(-2, 0).strftime('%d/%m')}:")


def test_daily_summary_needs_connected_group(monkeypatch):
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "token")
    assert run(at(0, 21)) is False
