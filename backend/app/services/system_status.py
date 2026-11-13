"""Tình trạng hệ thống cho quản trị viên: CSDL, tác vụ nền, hàng đợi thông báo, Telegram, email, AI.

Mỗi mục có trạng thái ok (chạy tốt), warn (cần chú ý), error (lỗi), off (chưa bật). Kiểm tra dịch vụ bên ngoài chạy song song,
mỗi mục tối đa vài giây, không gửi tin hay email thật.
"""

import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import OutboxMessage, User
from app.services import telegram
from app.services.common import load_config, require_roles, utcnow

TIMEOUT = 6
# Lần chạy xong gần nhất của từng tác vụ nền (workers ghi lại)
LAST_RUN: dict[str, object] = {}
JOB_NAMES = {
    "sweep_overdue_assignments": "Thu hồi phân công quá hạn",
    "sweep_unpaid": "Hủy phiếu quá hạn trả phí giữ lịch",
    "process_outbox": "Gửi thông báo trong hàng đợi",
    "send_reminders": "Nhắc kỹ thuật viên trước giờ hẹn",
    "send_daily_summary": "Tổng kết cuối ngày",
}
SCHEDULE_INTERVAL = 60


def _check(key: str, name: str, state: str, detail: str) -> dict:
    return {"key": key, "name": name, "state": state, "detail": detail}


def _database(db: Session) -> dict:
    started = time.perf_counter()
    db.execute(text("SELECT 1"))
    ms = (time.perf_counter() - started) * 1000
    version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    return _check("database", "Cơ sở dữ liệu", "ok", f"Kết nối tốt ({ms:.0f} ms), phiên bản cấu trúc {version}")


def _jobs() -> dict:
    settings = get_settings()
    if not settings.background_jobs:
        return _check("jobs", "Tác vụ nền", "off", "Đang tắt (BACKGROUND_JOBS=false)")
    limit = timedelta(seconds=2 * max(settings.sweep_interval_seconds, settings.outbox_interval_seconds, SCHEDULE_INTERVAL) + 30)
    now = utcnow()
    late = [label for job, label in JOB_NAMES.items() if job not in LAST_RUN or now - LAST_RUN[job] > limit]
    if late:
        return _check("jobs", "Tác vụ nền", "warn", "Chưa chạy gần đây: " + ", ".join(late))
    return _check("jobs", "Tác vụ nền", "ok", "Đang chạy: " + ", ".join(JOB_NAMES.values()).lower())


def _outbox(db: Session) -> dict:
    counts = dict(db.execute(select(OutboxMessage.status, func.count()).group_by(OutboxMessage.status)).all())
    waiting, failed, sent = counts.get("CHO_GUI", 0), counts.get("LOI", 0), counts.get("DA_GUI", 0)
    oldest = db.scalar(select(func.min(OutboxMessage.next_attempt_at)).where(OutboxMessage.status == "CHO_GUI"))
    detail = f"Đã gửi {sent}, đang chờ {waiting}, gửi lỗi {failed}"
    if oldest and utcnow() - oldest > timedelta(minutes=10):
        return _check("outbox", "Hàng đợi thông báo", "warn", detail + "; có tin chờ quá 10 phút")
    return _check("outbox", "Hàng đợi thông báo", "warn" if failed else "ok", detail)


def _telegram_api(method: str) -> dict:
    url = f"https://api.telegram.org/bot{get_settings().telegram_bot_token}/{method}"
    response = httpx.get(url, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()["result"]


def _telegram_bot() -> dict:
    settings = get_settings()
    if not telegram.enabled():
        return _check("telegram", "Bot Telegram", "off", "Chưa đặt TELEGRAM_BOT_TOKEN")
    try:
        me = _telegram_api("getMe")
        hook = _telegram_api("getWebhookInfo")
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        return _check("telegram", "Bot Telegram", "error", f"Không gọi được Telegram: {type(exc).__name__}")
    expected = f"{settings.app_url.rstrip('/')}/api/v1/telegram/webhook"
    name = f"@{me.get('username', '')}"
    if hook.get("url") != expected:
        return _check("telegram", "Bot Telegram", "warn", f"{name}: webhook chưa trỏ về {expected}")
    if hook.get("last_error_message"):
        return _check("telegram", "Bot Telegram", "warn", f"{name}: lần nhận tin gần nhất lỗi ({hook['last_error_message']})")
    return _check("telegram", "Bot Telegram", "ok", f"{name} đang nhận tin, {hook.get('pending_update_count', 0)} tin chờ xử lý")


def _telegram_group(db: Session) -> dict:
    if not telegram.enabled():
        return _check("group", "Nhóm Telegram", "off", "Bot chưa bật")
    group = load_config(db).telegram_group_chat_id
    if not group:
        return _check("group", "Nhóm Telegram", "warn", "Chưa kết nối nhóm (gõ /ketnoinhom trong nhóm)")
    linked = db.scalar(select(func.count()).select_from(User).where(User.telegram_chat_id.is_not(None)))
    return _check("group", "Nhóm Telegram", "ok", f"Đã kết nối nhóm, {linked} tài khoản đã liên kết Telegram")


def _email() -> dict:
    settings = get_settings()
    if settings.email_relay_url:
        try:
            # Gửi khóa đúng nhưng không có người nhận: dịch vụ trả INVALID mà không gửi thư
            reply = httpx.post(
                settings.email_relay_url, json={"secret": settings.email_relay_secret}, timeout=TIMEOUT, follow_redirects=True
            ).text.strip()
        except httpx.HTTPError as exc:
            return _check("email", "Email", "error", f"Không gọi được dịch vụ gửi email: {type(exc).__name__}")
        if reply == "INVALID":
            return _check("email", "Email", "ok", "Gửi qua Google Apps Script, khóa xác thực khớp")
        if reply == "FORBIDDEN":
            return _check("email", "Email", "error", "Khóa EMAIL_RELAY_SECRET không khớp với RELAY_SECRET của Apps Script")
        return _check("email", "Email", "error", f"Dịch vụ gửi email trả lời lạ: {reply[:80]}")
    if settings.smtp_host:
        return _check("email", "Email", "ok", f"Gửi qua SMTP {settings.smtp_host}:{settings.smtp_port}")
    return _check("email", "Email", "off", "Chưa cấu hình cách gửi email, nội dung chỉ ghi vào log")


def _gemini() -> dict:
    settings = get_settings()
    if not settings.gemini_api_key:
        return _check("ai", "AI phân loại sự cố", "off", "Chưa đặt GEMINI_API_KEY, phân loại theo từ khóa")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}"
    try:
        response = httpx.get(url, headers={"x-goog-api-key": settings.gemini_api_key}, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        return _check("ai", "AI phân loại sự cố", "error", f"Không gọi được Gemini: {type(exc).__name__}")
    if response.status_code == 200:
        return _check("ai", "AI phân loại sự cố", "ok", f"Gemini {settings.gemini_model} sẵn sàng")
    return _check("ai", "AI phân loại sự cố", "error", f"Gemini từ chối (HTTP {response.status_code}): khóa hoặc tên mô hình không đúng")


def system_status(db: Session, user: User) -> dict:
    require_roles(user, "QTV")
    with ThreadPoolExecutor(max_workers=3) as pool:
        remote = [pool.submit(check) for check in (_telegram_bot, _email, _gemini)]
        local = [_database(db), _jobs(), _outbox(db), _telegram_group(db)]
        bot, email, ai = (future.result() for future in remote)
    commit = os.environ.get("RENDER_GIT_COMMIT", "")[:7]
    return {"checkedAt": utcnow(), "version": commit, "checks": [local[0], local[1], local[2], bot, local[3], email, ai]}
