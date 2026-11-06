"""Gửi tin trong hàng đợi qua Telegram và email; lỗi thì gửi lại tối đa 3 lần (NFR-14)."""

import logging
import smtplib
from datetime import timedelta
from email.message import EmailMessage

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import OutboxMessage
from app.services.common import utcnow

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 4
BATCH_SIZE = 20


def send_telegram(chat_id: str, title: str, body: str, reply_markup: dict | None = None) -> None:
    settings = get_settings()
    payload = {"chat_id": chat_id, "text": f"{title}\n{body}" if title else body}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    response = httpx.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage", json=payload, timeout=10)
    response.raise_for_status()


def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    if settings.email_relay_url:
        send_email_relay(to, subject, body)
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


def send_email_relay(to: str, subject: str, body: str) -> None:
    """Gửi qua ứng dụng web Google Apps Script (infra/email-relay/Code.gs) bằng HTTPS."""
    settings = get_settings()
    payload = {"secret": settings.email_relay_secret, "to": to, "subject": subject, "body": body}
    response = httpx.post(settings.email_relay_url, json=payload, timeout=20, follow_redirects=True)
    response.raise_for_status()
    if response.text.strip() != "OK":
        raise RuntimeError(f"Dịch vụ gửi email trả lời: {response.text.strip()[:200]}")


def _deliver(message: OutboxMessage) -> bool:
    """Trả về False khi kênh chưa được cấu hình."""
    settings = get_settings()
    if message.channel == "telegram":
        if not settings.telegram_bot_token:
            return False
        send_telegram(message.recipient, message.subject, message.body, message.reply_markup)
    elif message.channel == "email":
        if not settings.email_enabled:
            logger.info("Email chưa gửi vì chưa cấu hình cách gửi email – tới %s: %s\n%s", message.recipient, message.subject, message.body)
            return False
        send_email(message.recipient, message.subject, message.body)
    return True


def process_outbox(db: Session) -> int:
    now = utcnow()
    messages = db.scalars(
        select(OutboxMessage)
        .where(OutboxMessage.status == "CHO_GUI", OutboxMessage.next_attempt_at <= now)
        .order_by(OutboxMessage.id)
        .limit(BATCH_SIZE)
        .with_for_update(skip_locked=True)
    ).all()
    for message in messages:
        message.attempts += 1
        try:
            message.status = "DA_GUI" if _deliver(message) else "BO_QUA"
        except Exception as exc:  # noqa: BLE001 - lỗi gửi không được làm hỏng giao dịch chính
            message.last_error = str(exc)[:500]
            if message.attempts >= MAX_ATTEMPTS:
                message.status = "LOI"
            else:
                message.next_attempt_at = now + timedelta(minutes=2**message.attempts)
    db.commit()
    return len(messages)
