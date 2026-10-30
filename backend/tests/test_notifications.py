from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import OutboxMessage, User
from app.services import outbox
from app.services.common import notify


def test_telegram_link_and_webhook(client, khach, monkeypatch):
    assert khach.post("/me/telegram-link").status_code == 503
    assert client.get("/api/catalog").json()["features"]["telegram"] is False

    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    monkeypatch.setattr(settings, "telegram_bot_username", "itonsite_bot")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "bi-mat")
    url = khach.ok("post", "/me/telegram-link")["url"]
    code = url.split("start=")[1]

    update = {"message": {"text": f"/start {code}", "chat": {"id": 123456}}}
    assert client.post("/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "sai"}).status_code == 403
    assert client.post("/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "bi-mat"}).status_code == 200
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
