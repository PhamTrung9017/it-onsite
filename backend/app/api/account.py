import secrets
from typing import Annotated

from fastapi import APIRouter, Header

from app.api.deps import CurrentUser, Db, Page
from app.core.config import get_settings
from app.core.errors import forbidden
from app.schemas import DeviceBody, MarkReadBody, ProfileBody, ReasonBody
from app.services import account, telegram_bot
from app.services.present import device_json, iso, user_json

router = APIRouter(tags=["Tài khoản"])


@router.patch("/me")
def update_profile(body: ProfileBody, user: CurrentUser, db: Db) -> dict:
    account.update_profile(db, user, body.name, body.phone, body.address, body.ward, body.email)
    db.commit()
    return user_json(user)


@router.get("/me/devices")
def list_devices(user: CurrentUser, db: Db) -> list[dict]:
    return [
        {**device_json(row["device"]), "repairCount": row["repairCount"], "activeWarranties": row["activeWarranties"]}
        for row in account.list_devices(db, user)
    ]


@router.post("/me/devices", status_code=201)
def add_device(body: DeviceBody, user: CurrentUser, db: Db) -> dict:
    device = account.add_device(db, user, body.type, body.brand, body.model, body.note)
    db.commit()
    return device_json(device)


@router.delete("/me/devices/{device_id}", status_code=204)
def remove_device(device_id: int, user: CurrentUser, db: Db) -> None:
    account.remove_device(db, user, device_id)
    db.commit()


@router.get("/me/export")
def export_data(user: CurrentUser, db: Db) -> dict:
    return account.export_my_data(db, user)


@router.post("/me/deletion-request")
def request_deletion(body: ReasonBody, user: CurrentUser, db: Db) -> dict:
    account.request_data_deletion(db, user, body.reason)
    db.commit()
    return {"ok": True}


@router.post("/me/telegram-link")
def telegram_link(user: CurrentUser, db: Db) -> dict:
    link = account.telegram_link(db, user)
    db.commit()
    return link


@router.get("/notifications/unread-count")
def unread_count(user: CurrentUser, db: Db) -> dict:
    return {"count": account.unread_count(db, user)}


@router.get("/notifications")
def list_notifications(user: CurrentUser, db: Db, page: Page) -> list[dict]:
    items, total = account.list_notifications(db, user, page.limit, page.offset)
    page.total(total)
    return [
        {
            "id": n.id,
            "userId": n.user_id,
            "title": n.title,
            "body": n.body,
            "ticketId": n.ticket_id,
            "read": n.read,
            "createdAt": iso(n.created_at),
        }
        for n in items
    ]


@router.post("/notifications/read", status_code=204)
def mark_read(body: MarkReadBody, user: CurrentUser, db: Db) -> None:
    account.mark_read(db, user, body.ids)
    db.commit()


@router.post("/telegram/webhook", include_in_schema=False)
def telegram_webhook(
    update: dict,
    db: Db,
    secret: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
) -> dict:
    """Bot nhận lệnh /start <mã> để gắn tài khoản, /ketnoinhom để kết nối nhóm chung, nút Nhận/Từ chối việc của KTV."""
    settings = get_settings()
    if not settings.telegram_bot_token or not secrets.compare_digest(secret or "", settings.webhook_secret):
        raise forbidden()
    telegram_bot.handle_update(db, update)
    db.commit()
    return {"ok": True}
