from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import OutboxMessage, Ticket, User
from app.services import outbox
from app.services.common import money, notify
from app.services.receipts import receipt_body


def test_telegram_link_and_webhook(client, khach, monkeypatch):
    assert khach.post("/me/telegram-link").status_code == 503
    assert client.get("/api/v1/catalog").json()["features"]["telegram"] is False

    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    monkeypatch.setattr(settings, "telegram_bot_username", "itonsite_bot")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "bi-mat")
    url = khach.ok("post", "/me/telegram-link")["url"]
    code = url.split("start=")[1]

    update = {"message": {"text": f"/start {code}", "chat": {"id": 123456}}}
    assert client.post("/api/v1/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "sai"}).status_code == 403
    assert client.post("/api/v1/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "bi-mat"}).status_code == 200
    assert khach.ok("get", "/auth/me")["telegramLinked"] is True


def test_outbox_retries_then_gives_up_nfr14(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    calls = []

    def failing(chat_id, title, body):
        calls.append(chat_id)
        raise RuntimeError("mạng lỗi")

    monkeypatch.setattr(outbox, "send_telegram", failing)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "khach@demo.vn"))
        user.telegram_chat_id = "999"
        notify(db, [user.id], "Thử", "Nội dung")
        db.commit()
        message = db.scalar(select(OutboxMessage).where(OutboxMessage.recipient == "999"))
        for _ in range(outbox.MAX_ATTEMPTS):
            db.execute(OutboxMessage.__table__.update().values(next_attempt_at=message.created_at))
            db.commit()
            outbox.process_outbox(db)
        db.refresh(message)
        assert message.status == "LOI" and message.attempts == outbox.MAX_ATTEMPTS
    assert len(calls) == outbox.MAX_ATTEMPTS


def test_outbox_sends_successfully(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    sent = []
    monkeypatch.setattr(outbox, "send_telegram", lambda chat_id, title, body: sent.append((chat_id, title)))
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "ktv@demo.vn"))
        user.telegram_chat_id = "777"
        notify(db, [user.id], "Việc mới", "Phiếu YC-1")
        db.commit()
        outbox.process_outbox(db)
        status = db.scalar(select(OutboxMessage.status).where(OutboxMessage.recipient == "777"))
    assert status == "DA_GUI" and sent == [("777", "Việc mới")]


def test_receipt_email_on_completion_uc06(client, khach, dpv, monkeypatch):
    monkeypatch.setattr(get_settings(), "smtp_host", "smtp.example.com")
    ticket = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    quote = ticket["quotes"][-1]
    khach.ok("post", f"/tickets/{ticket['id']}/quotes/{quote['id']}/decision", {"decision": "reject", "reason": "Để sau"})
    with SessionLocal() as db:
        mails = db.scalars(select(OutboxMessage).where(OutboxMessage.recipient == "khach@demo.vn", OutboxMessage.channel == "email")).all()
    assert [m.subject for m in mails] == [f"[IT OnSite] Biên nhận dịch vụ phiếu {ticket['id']}"], "biên nhận thay cho email báo hoàn tất"
    body = mails[0].body
    assert "Phí khảo sát (khách từ chối báo giá): 50.000đ" in body
    assert "Phí giữ lịch đã trả trước: −50.000đ" in body and "Thanh toán khi hoàn tất: 0đ" in body
    assert f"/khach/phieu/{ticket['id']}/bien-nhan" in body


def test_receipt_lists_items_with_warranty(client):
    with SessionLocal() as db:
        done = db.scalars(select(Ticket).where(Ticket.status == "HOAN_TAT", Ticket.is_warranty.is_(False))).all()
        ticket = next(t for t in done if any(i.warranty_days for q in t.quotes for i in q.items if i.selected))
        body = receipt_body(ticket, "Nguyễn Văn An")
    assert "Kỹ thuật viên: Nguyễn Văn An" in body and ", đến " in body
    total = sum(i.unit_price * i.qty for q in ticket.quotes for i in q.items if i.selected)
    assert f"Tổng tiền dịch vụ: {money(total)}" in body
