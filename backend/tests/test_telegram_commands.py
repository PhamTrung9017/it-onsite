"""Lệnh xem nhanh trong bot: /viec, /tongquan, /trogiup."""

from datetime import datetime, time, timedelta

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db import SessionLocal
from app.domain.status import Status
from app.models import Assignment, Ticket
from app.services import telegram
from tests.test_flow import create_ticket
from tests.test_telegram import ADMIN_CHAT, GROUP_CHAT, KTV_CHAT, link

STRANGER = "777"


def say(bot, chat_id: str, text: str, sender: str | None = None, kind: str = "private") -> str:
    count = len(bot.calls)
    chat = {"id": int(chat_id), "type": kind}
    bot({"message": {"text": text, "chat": chat, "from": {"id": int(sender or chat_id)}}})
    assert len(bot.calls) == count + 1, "bot trả lời đúng một tin"
    method, payload = bot.calls[-1]
    assert method == "sendMessage" and str(payload["chat_id"]) == chat_id
    return payload["text"]


def today_at(hour: int) -> datetime:
    tz = get_settings().tz
    return datetime.combine(datetime.now(tz).date(), time(hour), tzinfo=tz)


def move_jobs_of_tech(tech_id: int) -> tuple[str, str]:
    """Đặt một việc của kỹ thuật viên vào trưa nay, một việc vào ngày mai."""
    with SessionLocal() as db:
        rows = db.scalars(
            select(Assignment).join(Ticket, Ticket.id == Assignment.ticket_id).where(Assignment.tech_id == tech_id).limit(2)
        ).all()
        today, later = rows
        today.appointment_at = today_at(12)
        db.get(Ticket, today.ticket_id).status = Status.KTV_DA_NHAN
        later.appointment_at = today_at(12) + timedelta(days=1)
        db.get(Ticket, later.ticket_id).status = Status.KTV_DA_NHAN
        db.commit()
        return today.ticket_id, later.ticket_id


def test_jobs_today_for_technician(bot, ktv):
    link(bot, ktv, KTV_CHAT)
    tech_id = ktv.ok("get", "/tech/profile")["tech"]["id"]
    today_id, tomorrow_id = move_jobs_of_tech(tech_id)

    reply = say(bot, KTV_CHAT, "/viec")
    assert reply.startswith("Việc hôm nay") and today_id in reply and tomorrow_id not in reply
    assert "KTV đã nhận" in reply and "/ktv/lich-viec" in reply

    in_group = say(bot, GROUP_CHAT, "/viec@itonsite_bot", sender=KTV_CHAT, kind="group")
    assert today_id in in_group
    for private_field in ("0901", "Đường", "đường"):
        assert private_field not in in_group, "tin trong nhóm không có số điện thoại, địa chỉ"


def test_overview_today_for_managers(bot, khach, qtv, ktv):
    link(bot, qtv, ADMIN_CHAT)
    create_ticket(khach, "Máy tính khởi động rất chậm, treo khi mở trình duyệt")
    tz = get_settings().tz
    start = datetime.combine(datetime.now(tz).date(), time.min, tzinfo=tz)
    with SessionLocal() as db:
        created = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.created_at >= start))

    reply = say(bot, ADMIN_CHAT, "/tongquan")
    assert reply.startswith("Tổng quan hôm nay")
    assert f"• Phiếu mới tạo: {created}" in reply
    labels = (
        "Chờ tiếp nhận:",
        "Chờ phân công:",
        "Chờ KTV nhận:",
        "Đang xử lý:",
        "Hoàn tất hôm nay:",
        "Doanh thu hôm nay:",
        "Chờ đối soát:",
    )
    assert all(label in reply for label in labels)

    link(bot, ktv, KTV_CHAT)
    assert say(bot, KTV_CHAT, "/tongquan") == "Lệnh /tongquan dành cho quản trị viên và điều phối viên."
    assert say(bot, ADMIN_CHAT, "/viec") == "Lệnh /viec dành cho kỹ thuật viên."


def test_help_and_unlinked_users(bot, ktv):
    assert "Kết nối Telegram" in say(bot, STRANGER, "/viec")
    assert "Kết nối Telegram" in say(bot, STRANGER, "chào bot")
    assert say(bot, GROUP_CHAT, "/tongquan", sender=STRANGER, kind="group") == "Tài khoản Telegram này chưa liên kết với IT OnSite."

    link(bot, ktv, KTV_CHAT)
    help_text = say(bot, KTV_CHAT, "cho hỏi lịch hôm nay")
    assert "/viec" in help_text and "/tongquan" not in help_text
    assert say(bot, KTV_CHAT, "/trogiup") == help_text

    count = len(bot.calls)
    bot({"message": {"text": "chào cả nhóm", "chat": {"id": int(GROUP_CHAT), "type": "group"}, "from": {"id": int(KTV_CHAT)}}})
    assert len(bot.calls) == count, "tin thường trong nhóm thì bot không trả lời"


def test_command_menu_registered_on_start(monkeypatch):
    settings = get_settings()
    calls = []
    monkeypatch.setattr(telegram, "call", lambda method, payload: calls.append((method, payload)))
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    monkeypatch.setattr(settings, "app_url", "https://it-onsite.onrender.com")
    telegram.register_webhook()
    commands = dict(calls)["setMyCommands"]["commands"]
    assert [c["command"] for c in commands] == ["viec", "tongquan", "trogiup"]
