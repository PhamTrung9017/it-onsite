"""Chạy trên máy chủ: ảnh lưu trong CSDL, backend phục vụ giao diện, cấu hình từ môi trường, email qua HTTPS, webhook Telegram."""

import base64

import httpx
import pytest
from sqlalchemy import delete, select

from app.core.config import Settings, get_settings
from app.db import SessionLocal
from app.models import MediaFile, OutboxMessage, Service, User
from app.seed import first_start, reset_database
from app.services import media, outbox, telegram
from tests.conftest import PNG
from tests.test_flow import create_ticket

STRONG = "x" * 48


def test_uploaded_photo_is_stored_in_database(client, khach):
    ticket = create_ticket(khach, "Máy tính khởi động rất chậm")
    url = ticket["photos"][0]
    with SessionLocal() as db:
        assert db.get(MediaFile, url.removeprefix("/media/")) is not None
    response = client.get(url)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == base64.b64decode(PNG.split(",", 1)[1])
    assert "sandbox" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"

    with SessionLocal() as db:
        media.delete_image(db, url)
        db.commit()
    assert client.get(url).status_code == 404


def test_sample_photo_of_demo_data_is_served(client):
    response = client.get("/media/mau.svg")
    assert response.status_code == 200 and response.headers["content-type"].startswith("image/svg+xml")


@pytest.fixture
def built_frontend(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>IT OnSite</title>", encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path.parent / "bi-mat.txt").write_text("khong duoc doc", encoding="utf-8")
    monkeypatch.setattr(get_settings(), "frontend_dir", str(tmp_path))
    return tmp_path


def test_backend_serves_frontend_on_same_address(client, built_frontend):
    page = client.get("/")
    assert page.status_code == 200 and "IT OnSite" in page.text
    assert page.headers["cache-control"] == "no-cache"
    csp = page.headers["content-security-policy"]
    assert "default-src 'self'" in csp and "connect-src 'self'" in csp and "frame-ancestors 'none'" in csp

    route = client.get("/khach/phieu/YC-20261106-001/bien-nhan")
    assert route.status_code == 200 and "IT OnSite" in route.text

    asset = client.get("/assets/app.js")
    assert asset.text == "console.log(1)"
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"

    assert client.get("/%2e%2e/bi-mat.txt").text != "khong duoc doc"
    missing_api = client.get("/api/v1/khong-co")
    assert missing_api.status_code == 404 and missing_api.json()["detail"]
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_without_frontend_build_unknown_paths_are_404(client):
    assert get_settings().frontend_dir == ""
    assert client.get("/khach").status_code == 404


def test_settings_accept_render_and_neon_values(monkeypatch):
    neon = "postgresql://nguoi_dung:mat_khau@ep-abc.ap-southeast-1.aws.neon.tech/itonsite?sslmode=require&channel_binding=require"
    assert Settings(database_url=neon).database_url.startswith("postgresql+psycopg://nguoi_dung:mat_khau@ep-abc.")
    assert Settings(database_url="postgres://a:b@h/d").database_url == "postgresql+psycopg://a:b@h/d"

    monkeypatch.delenv("APP_URL", raising=False)
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://it-onsite.onrender.com")
    assert Settings().app_url == "https://it-onsite.onrender.com"
    monkeypatch.setenv("APP_URL", "https://itonsite.vn")
    assert Settings().app_url == "https://itonsite.vn"


def test_webhook_secret_is_derived_and_valid_for_telegram():
    first = Settings(jwt_secret=STRONG)
    assert first.webhook_secret == Settings(jwt_secret=STRONG).webhook_secret
    assert first.webhook_secret != Settings(jwt_secret="y" * 48).webhook_secret
    assert len(first.webhook_secret) == 64 and all(c in "0123456789abcdef" for c in first.webhook_secret)
    assert Settings(jwt_secret=STRONG, telegram_webhook_secret="rieng").webhook_secret == "rieng"


def test_webhook_rejected_when_bot_not_configured(client):
    secret = get_settings().webhook_secret
    response = client.post("/api/v1/telegram/webhook", json={}, headers={"X-Telegram-Bot-Api-Secret-Token": secret})
    assert response.status_code == 403


def test_register_webhook_on_start_only_with_https(monkeypatch):
    settings = get_settings()
    calls = []
    monkeypatch.setattr(telegram, "call", lambda method, payload: calls.append((method, payload)))
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    monkeypatch.setattr(settings, "app_url", "http://localhost:5173")
    telegram.register_webhook()
    assert calls == []

    monkeypatch.setattr(settings, "app_url", "https://it-onsite.onrender.com/")
    telegram.register_webhook()
    method, payload = calls[0]
    assert method == "setWebhook"
    assert payload["url"] == "https://it-onsite.onrender.com/api/v1/telegram/webhook"
    assert payload["secret_token"] == settings.webhook_secret


class FakeResponse:
    def __init__(self, text: str, status: int = 200):
        self.text, self.status_code = text, status

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("lỗi", request=None, response=None)


def queue_email() -> None:
    with SessionLocal() as db:
        message = OutboxMessage(channel="email", recipient="khach@demo.vn", subject="Biên nhận", body="Nội dung")
        message.next_attempt_at = outbox.utcnow()
        db.add(message)
        db.commit()


def email_status() -> str:
    with SessionLocal() as db:
        return db.scalar(select(OutboxMessage.status).where(OutboxMessage.channel == "email", OutboxMessage.subject == "Biên nhận"))


@pytest.mark.parametrize(("answer", "status"), [("OK", "DA_GUI"), ("FORBIDDEN", "CHO_GUI")])
def test_email_relay_over_https(client, monkeypatch, answer, status):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_relay_url", "https://script.google.com/macros/s/abc/exec")
    monkeypatch.setattr(settings, "email_relay_secret", "khoa")
    sent = []

    def fake_post(url, json, timeout, follow_redirects):
        sent.append((url, json, follow_redirects))
        return FakeResponse(answer)

    monkeypatch.setattr(outbox.httpx, "post", fake_post)
    with SessionLocal() as db:
        db.execute(delete(OutboxMessage))
        db.commit()
    queue_email()
    with SessionLocal() as db:
        outbox.process_outbox(db)
    assert email_status() == status, "trả lời khác OK thì giữ lại để gửi lại sau"
    url, body, follow = sent[0]
    assert url.endswith("/exec") and follow is True
    assert body == {"secret": "khoa", "to": "khach@demo.vn", "subject": "Biên nhận", "body": "Nội dung"}


def test_first_start_seeds_only_empty_database(monkeypatch):
    monkeypatch.delenv("DEMO_DATA", raising=False)
    with SessionLocal() as db:
        assert first_start(db) is False, "đã có tài khoản thì không nạp lại"
        reset_database(db)
        db.commit()
    monkeypatch.setenv("ADMIN_EMAIL", "quantri@caiwindao.vn")
    monkeypatch.setenv("ADMIN_PASSWORD", "matkhau-manh-123")
    with SessionLocal() as db:
        assert first_start(db) is True
        db.commit()
    with SessionLocal() as db:
        users = db.scalars(select(User)).all()
        assert [(u.email, sorted(u.roles)) for u in users] == [("quantri@caiwindao.vn", ["DPV", "QTV"])]
        assert db.scalar(select(Service).limit(1)) is not None
        reset_database(db)
        db.commit()
    monkeypatch.setenv("DEMO_DATA", "true")
    with SessionLocal() as db:
        assert first_start(db) is True
        db.commit()
    with SessionLocal() as db:
        assert db.scalar(select(User).where(User.email == "qtv@demo.vn")) is not None
