"""Telegram: liên kết tài khoản, kết nối nhóm chung, nút Nhận/Từ chối việc của kỹ thuật viên."""

from sqlalchemy import select

from app.db import SessionLocal
from app.models import OutboxMessage
from app.services import telegram
from tests.conftest import Api
from tests.test_flow import create_ticket, login_tech, receive

KTV_CHAT, ADMIN_CHAT, GROUP_CHAT = "111", "999", "-100123"


def link(bot, api: Api, chat_id: str) -> None:
    code = api.ok("post", "/me/telegram-link")["url"].split("start=")[1]
    bot({"message": {"text": f"/start {code}", "chat": {"id": int(chat_id), "type": "private"}, "from": {"id": int(chat_id)}}})


def press(bot, chat_id: str, data: str) -> None:
    message = {"message_id": 7, "chat": {"id": int(chat_id)}, "text": "Việc mới được phân công"}
    bot({"callback_query": {"id": "q1", "from": {"id": int(chat_id)}, "data": data, "message": message}})


def group_messages() -> list[str]:
    with SessionLocal() as db:
        return list(db.scalars(select(OutboxMessage.body).where(OutboxMessage.recipient == GROUP_CHAT).order_by(OutboxMessage.id)))


def test_connect_group_only_by_linked_admin(bot, ktv, qtv):
    link(bot, ktv, KTV_CHAT)
    assert bot.calls[-1][1]["text"].startswith("Đã liên kết Telegram")
    group = {"chat": {"id": int(GROUP_CHAT), "type": "group", "title": "Đội kỹ thuật"}, "text": "/ketnoinhom@itonsite_bot"}
    bot({"message": {**group, "from": {"id": int(KTV_CHAT)}}})
    assert "Chỉ quản trị viên" in bot.calls[-1][1]["text"]
    assert qtv.ok("get", "/admin/overview")["config"]["telegramGroupChatId"] == ""

    link(bot, qtv, ADMIN_CHAT)
    bot({"message": {**group, "from": {"id": int(ADMIN_CHAT)}}})
    assert bot.calls[-1][1]["text"].startswith("Đã kết nối nhóm")
    overview = qtv.ok("get", "/admin/overview")
    assert overview["config"]["telegramGroupChatId"] == GROUP_CHAT
    assert any(a["action"] == "KET_NOI_NHOM_TELEGRAM" for a in qtv.ok("get", "/admin/audit"))


def test_assignment_buttons_and_group_updates(bot, client, khach, dpv, qtv):
    link(bot, qtv, ADMIN_CHAT)
    bot({"message": {"chat": {"id": int(GROUP_CHAT), "type": "supergroup"}, "text": "/ketnoinhom", "from": {"id": int(ADMIN_CHAT)}}})
    received = receive(dpv, create_ticket(khach, "Máy tính bị virus quảng cáo bật liên tục."), "VIRUS")
    at = received["slotStart"].replace("+", "%2B")
    best = next(
        s
        for s in dpv.ok("get", f"/tickets/{received['id']}/technician-suggestions?appointmentAt={at}")
        if not s["conflict"] and not s["offDuty"]
    )
    tech = login_tech(client, dpv, best["tech"]["id"])
    link(bot, tech, KTV_CHAT)

    assigned = dpv.ok(
        "post",
        f"/tickets/{received['id']}/assign",
        {"techId": best["tech"]["id"], "appointmentAt": received["slotStart"], "version": received["version"]},
    )
    with SessionLocal() as db:
        private = db.scalars(select(OutboxMessage).where(OutboxMessage.recipient == KTV_CHAT)).all()[-1]
    assert private.reply_markup == telegram.assignment_buttons(assigned["id"])
    assert "120 Nguyễn Trãi" in private.body and "phường Bến Thành" in private.body
    messages = group_messages()
    assert any(m.startswith("Phiếu mới chờ phân công") for m in messages)
    assert any(m.startswith(f"Đã phân công {tech.user['name']}") for m in messages)
    assert all("0909000001" not in m and "120 Nguyễn Trãi" not in m for m in messages), "nhóm không có SĐT, địa chỉ của khách"

    press(bot, KTV_CHAT, f"tc:{assigned['id']}")
    assert bot.calls[-2] == (
        "editMessageReplyMarkup",
        {"chat_id": int(KTV_CHAT), "message_id": 7, "reply_markup": telegram.reason_buttons(assigned["id"])},
    )
    press(bot, KTV_CHAT, f"tc:{assigned['id']}:2")
    ticket = dpv.ok("get", f"/tickets/{assigned['id']}")
    assert ticket["status"] == "DA_TIEP_NHAN" and ticket["assignment"]["rejectReason"] == "Ở xa khu vực"
    assert bot.calls[-2][0] == "editMessageText" and "Đã từ chối: Ở xa khu vực" in bot.calls[-2][1]["text"]
    assert group_messages()[-1] == f"{tech.user['name']} từ chối phiếu {assigned['id']} (Ở xa khu vực). Cần phân công lại."


def test_accept_from_telegram_then_button_expires(bot, ktv, dpv):
    link(bot, ktv, KTV_CHAT)
    pending = next(t for t in ktv.ok("get", "/tech/jobs") if t["status"] == "DA_PHAN_CONG")
    press(bot, KTV_CHAT, f"nhan:{pending['id']}")
    assert dpv.ok("get", f"/tickets/{pending['id']}")["status"] == "KTV_DA_NHAN"
    assert bot.calls[-1] == ("answerCallbackQuery", {"callback_query_id": "q1", "text": "Đã nhận việc", "show_alert": False})

    press(bot, KTV_CHAT, f"nhan:{pending['id']}")
    assert bot.calls[-1][1]["show_alert"] is True and "không còn chờ bạn phản hồi" in bot.calls[-1][1]["text"]


def test_unlinked_or_invalid_button(bot, ktv):
    press(bot, "555", "nhan:YC-1")
    assert "chưa liên kết" in bot.calls[-1][1]["text"]
    link(bot, ktv, KTV_CHAT)
    press(bot, KTV_CHAT, "tc:YC-1:9")
    assert bot.calls[-1][1]["text"] == "Thao tác không hợp lệ."


def test_start_without_valid_code_explains_how_to_link(bot):
    private = {"chat": {"id": 555, "type": "private"}, "from": {"id": 555}}
    bot({"message": {**private, "text": "/start"}})
    assert 'bấm "Kết nối Telegram"' in bot.calls[-1][1]["text"]
    bot({"message": {**private, "text": "/start ma-sai"}})
    assert bot.calls[-1][1]["text"].startswith("Mã liên kết không hợp lệ")
    group = {"chat": {"id": int(GROUP_CHAT), "type": "group"}, "from": {"id": 555}, "text": "/start"}
    count = len(bot.calls)
    bot({"message": group})
    assert len(bot.calls) == count, "trong nhóm không trả lời /start"


def test_one_telegram_account_links_to_one_user(bot, ktv, qtv):
    link(bot, qtv, ADMIN_CHAT)
    link(bot, ktv, ADMIN_CHAT)
    reply = bot.calls[-1][1]["text"]
    assert reply.startswith("Đã liên kết Telegram") and "không còn nhận thông báo" in reply
    assert ktv.ok("get", "/auth/me")["telegramLinked"] is True
    assert qtv.ok("get", "/auth/me")["telegramLinked"] is False
    actions = [row["action"] for row in qtv.ok("get", "/admin/audit")]
    assert "GO_LIEN_KET_TELEGRAM" in actions
