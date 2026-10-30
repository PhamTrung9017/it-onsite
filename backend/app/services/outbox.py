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


def send_telegram(chat_id: str, title: str, body: str) -> None:
    settings = get_settings()
    response = httpx.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
        json={"chat_id": chat_id, "text": f"{title}\n{body}"},
        timeout=10,
    )
    response.raise_for_status()


def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()
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


def _deliver(message: OutboxMessage) -> bool:
    """Trả về False khi kênh chưa được cấu hình."""
    settings = get_settings()
    if message.channel == "telegram":
        if not settings.telegram_bot_token:
            return False
        send_telegram(message.recipient, message.subject, message.body)
    elif message.channel == "email":
        if not settings.smtp_host:
            logger.info("Email chưa gửi vì chưa cấu hình SMTP – tới %s: %s\n%s", message.recipient, message.subject, message.body)
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
