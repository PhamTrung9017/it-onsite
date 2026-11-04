"""Xử lý cập nhật từ webhook Telegram: liên kết tài khoản, kết nối nhóm chung, nút Nhận/Từ chối việc của kỹ thuật viên."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.domain.rules import BusinessConfig
from app.models import Setting, User
from app.services import account, technician, telegram
from app.services.common import audit, utcnow

GROUP_COMMAND = "/ketnoinhom"


def handle_update(db: Session, update: dict) -> None:
    if "callback_query" in update:
        _handle_button(db, update["callback_query"])
    elif "message" in update:
        _handle_message(db, update["message"])


def _user_of(db: Session, telegram_user_id) -> User | None:
    return db.scalar(select(User).where(User.telegram_chat_id == str(telegram_user_id)))


def _reply(chat_id, text: str) -> None:
    telegram.call("sendMessage", {"chat_id": chat_id, "text": text})


def _handle_message(db: Session, message: dict) -> None:
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id", ""))
    if not chat_id:
        return
    if text.startswith("/start ") and chat.get("type", "private") == "private":
        user = account.bind_telegram(db, text.split(maxsplit=1)[1], chat_id)
        if user:
            _reply(chat_id, f"Đã liên kết Telegram với tài khoản IT OnSite của {user.name}.")
    elif text.split("@")[0] == GROUP_COMMAND and chat.get("type") in ("group", "supergroup"):
        _connect_group(db, message, chat_id)


def _connect_group(db: Session, message: dict, chat_id: str) -> None:
    """Quản trị viên đã liên kết Telegram gửi /ketnoinhom trong nhóm để bot báo việc vào nhóm đó."""
    user = _user_of(db, (message.get("from") or {}).get("id"))
    if user is None or "QTV" not in user.roles or user.locked:
        _reply(chat_id, "Chỉ quản trị viên đã liên kết Telegram với IT OnSite mới kết nối được nhóm.")
        return
    row = db.get(Setting, 1)
    config = BusinessConfig.from_dict(row.data)
    config.telegram_group_chat_id = chat_id
    row.data = config.to_dict()
    audit(db, user, "KET_NOI_NHOM_TELEGRAM", chat_id, (message.get("chat") or {}).get("title", ""))
    _reply(
        chat_id,
        "Đã kết nối nhóm với IT OnSite. Bot sẽ báo phiếu chờ phân công, việc đã phân công, phản hồi của kỹ thuật viên và phiếu hoàn tất.",
    )


def _handle_button(db: Session, query: dict) -> None:
    data = query.get("data") or ""
    message = query.get("message") or {}
    target = {"chat_id": (message.get("chat") or {}).get("id"), "message_id": message.get("message_id")}
    user = _user_of(db, (query.get("from") or {}).get("id"))
    action, _, rest = data.partition(":")
    ticket_id, _, reason_key = rest.partition(":")
    if user is None:
        return _answer(query, "Tài khoản Telegram này chưa liên kết với IT OnSite.")
    if action == "tc" and not reason_key:
        telegram.call("editMessageReplyMarkup", {**target, "reply_markup": telegram.reason_buttons(ticket_id)})
        return _answer(query, "Chọn lý do từ chối")
    if action == "hoi":
        telegram.call("editMessageReplyMarkup", {**target, "reply_markup": telegram.assignment_buttons(ticket_id)})
        return _answer(query, "")
    if action not in ("nhan", "tc") or (action == "tc" and reason_key not in telegram.REJECT_REASONS):
        return _answer(query, "Thao tác không hợp lệ.")
    accept = action == "nhan"
    reason = "" if accept else telegram.REJECT_REASONS[reason_key]
    try:
        technician.respond_assignment(db, user, ticket_id, accept, reason)
    except ApiError as exc:
        telegram.call("editMessageReplyMarkup", {**target, "reply_markup": {"inline_keyboard": []}})
        return _answer(query, exc.message, alert=True)
    result = "Đã nhận việc" if accept else f"Đã từ chối: {reason}"
    original = message.get("text") or ""
    telegram.call("editMessageText", {**target, "text": f"{original}\n\n{result} lúc {telegram.local_time(utcnow())}."})
    return _answer(query, result)


def _answer(query: dict, text: str, alert: bool = False) -> None:
    telegram.call("answerCallbackQuery", {"callback_query_id": query.get("id"), "text": text, "show_alert": alert})
