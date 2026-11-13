"""Tình trạng hệ thống cho quản trị viên."""

from datetime import timedelta

import httpx
import pytest

from app.core.config import get_settings
from app.services import system_status
from app.services.common import utcnow

APP_URL = "https://it-onsite.onrender.com"
RELAY = "https://script.google.com/macros/s/abc/exec"


class Reply:
    def __init__(self, status: int = 200, json: dict | None = None, text: str = ""):
        self.status_code, self._json, self.text = status, json or {}, text

    def json(self) -> dict:
        return self._json

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("lỗi", request=None, response=None)


def states(api) -> dict:
    return {c["key"]: (c["state"], c["detail"]) for c in api.ok("get", "/admin/system-status")["checks"]}


def test_only_admin_sees_system_status(ktv, dpv, qtv):
    assert ktv.get("/admin/system-status").status_code == 403
    assert dpv.get("/admin/system-status").status_code == 403
    data = qtv.ok("get", "/admin/system-status")
    assert [c["key"] for c in data["checks"]] == ["database", "jobs", "outbox", "telegram", "group", "email", "ai"]
    assert data["checkedAt"]


def test_status_without_external_services(qtv, monkeypatch):
    settings = get_settings()
    for field in ("telegram_bot_token", "email_relay_url", "smtp_host", "gemini_api_key"):
        monkeypatch.setattr(settings, field, "")
    monkeypatch.setattr(settings, "background_jobs", False)
    result = states(qtv)
    assert result["database"][0] == "ok" and "0005" in result["database"][1]
    assert {result[k][0] for k in ("jobs", "telegram", "group", "email", "ai")} == {"off"}
    assert result["outbox"][0] in ("ok", "warn")


@pytest.fixture
def services(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    monkeypatch.setattr(settings, "app_url", APP_URL)
    monkeypatch.setattr(settings, "email_relay_url", RELAY)
    monkeypatch.setattr(settings, "email_relay_secret", "khoa")
    monkeypatch.setattr(settings, "gemini_api_key", "AQ.khoa")
    answers = {
        "getMe": Reply(json={"result": {"username": "itonsite_bot"}}),
        "getWebhookInfo": Reply(json={"result": {"url": f"{APP_URL}/api/v1/telegram/webhook", "pending_update_count": 0}}),
        "models": Reply(200),
        "relay": Reply(text="INVALID"),
    }
    sent = []

    def fake_get(url, timeout, headers=None):
        key = "models" if "generativelanguage" in url else url.rsplit("/", 1)[1]
        return answers[key]

    def fake_post(url, json, timeout, follow_redirects):
        sent.append(json)
        return answers["relay"]

    monkeypatch.setattr(system_status.httpx, "get", fake_get)
    monkeypatch.setattr(system_status.httpx, "post", fake_post)
    answers["sent"] = sent
    return answers


def test_status_with_services_running(qtv, services, monkeypatch):
    monkeypatch.setattr(get_settings(), "background_jobs", True)
    for job in system_status.JOB_NAMES:
        monkeypatch.setitem(system_status.LAST_RUN, job, utcnow())
    result = states(qtv)
    assert result["telegram"] == ("ok", "@itonsite_bot đang nhận tin, 0 tin chờ xử lý")
    assert result["email"][0] == "ok"
    assert services["sent"] == [{"secret": "khoa"}], "chỉ gửi khóa, không có người nhận nên không gửi thư thật"
    assert result["ai"][0] == "ok"
    assert result["jobs"][0] == "ok"
    assert result["group"][0] == "warn", "chưa kết nối nhóm"


def test_status_reports_problems(qtv, services, monkeypatch):
    monkeypatch.setattr(get_settings(), "background_jobs", True)
    monkeypatch.setitem(system_status.LAST_RUN, "process_outbox", utcnow() - timedelta(hours=1))
    services["getWebhookInfo"] = Reply(json={"result": {"url": "https://khac.example/hook"}})
    services["relay"] = Reply(text="FORBIDDEN")
    services["models"] = Reply(400)
    result = states(qtv)
    assert result["jobs"][0] == "warn" and "Gửi thông báo trong hàng đợi" in result["jobs"][1]
    assert result["telegram"][0] == "warn" and "webhook" in result["telegram"][1]
    assert result["email"][0] == "error" and "RELAY_SECRET" in result["email"][1]
    assert result["ai"][0] == "error"

    services["getMe"] = Reply(500)
    assert states(qtv)["telegram"][0] == "error"
