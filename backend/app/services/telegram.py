"""Telegram cho đội kỹ thuật: tin báo việc trong nhóm chung, nút Nhận/Từ chối trong tin riêng của kỹ thuật viên.

Tin trong nhóm chỉ ghi mã phiếu, loại sự cố, phường, giờ hẹn và tên kỹ thuật viên; không ghi số điện thoại, địa chỉ của khách.
"""

import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Category, OutboxMessage, Ticket
from app.services.common import load_config, utcnow

logger = logging.getLogger(__name__)

REJECT_REASONS = {"1": "Đang bận lịch khác", "2": "Ở xa khu vực", "3": "Không đúng chuyên môn"}


def enabled() -> bool:
    return bool(get_settings().telegram_bot_token)


def local_time(value: datetime) -> str:
    return value.astimezone(get_settings().tz).strftime("%H:%M %d/%m")


def job_summary(db: Session, ticket: Ticket) -> str:
    """Ví dụ "YC-20261104-001 · Cài đặt hệ điều hành · phường Bến Thành · hẹn 15:00 05/11"."""
    category = db.get(Category, ticket.category_code)
    appointment = ticket.assignment.appointment_at if ticket.assignment else ticket.slot_start
    return f"{ticket.id} · {category.name if category else ticket.category_code} · phường {ticket.ward} · hẹn {local_time(appointment)}"


def assignment_buttons(ticket_id: str) -> dict:
    return {
        "inline_keyboard": [
            [{"text": "Nhận việc", "callback_data": f"nhan:{ticket_id}"}, {"text": "Từ chối", "callback_data": f"tc:{ticket_id}"}]
        ]
    }


def reason_buttons(ticket_id: str) -> dict:
    rows = [[{"text": reason, "callback_data": f"tc:{ticket_id}:{key}"}] for key, reason in REJECT_REASONS.items()]
    return {"inline_keyboard": [*rows, [{"text": "Quay lại", "callback_data": f"hoi:{ticket_id}"}]]}


def post_group(db: Session, text: str) -> None:
    """Đưa tin vào hàng đợi gửi nhóm chung khi đã kết nối nhóm."""
    group = load_config(db).telegram_group_chat_id
    if enabled() and group:
        db.add(OutboxMessage(channel="telegram", recipient=group, subject="", body=text, next_attempt_at=utcnow()))


def call(method: str, payload: dict) -> None:
    """Gọi Bot API ngay trong lúc xử lý webhook (trả lời nút bấm, sửa tin); lỗi chỉ ghi log."""
    try:
        response = httpx.post(f"https://api.telegram.org/bot{get_settings().telegram_bot_token}/{method}", json=payload, timeout=5)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Gọi Telegram %s lỗi: %s", method, exc)


def register_webhook() -> None:
    """Khi khởi động: báo Telegram gửi tin của bot về địa chỉ công khai (HTTPS) của hệ thống, kèm khóa xác thực."""
    settings = get_settings()
    if not enabled() or not settings.app_url.startswith("https://"):
        return
    call(
        "setWebhook",
        {
            "url": f"{settings.app_url.rstrip('/')}/api/v1/telegram/webhook",
            "secret_token": settings.webhook_secret,
            "allowed_updates": ["message", "callback_query"],
        },
    )
