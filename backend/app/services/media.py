"""Lưu ảnh tải lên trong CSDL, trả về đường dẫn công khai /media/<tên tệp>."""

import base64
import binascii
import re
import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models import MediaFile

DATA_URL_RE = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,(.+)$", re.DOTALL)
SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MEDIA_PREFIX = "/media/"


def save_image(db: Session, data_url: str) -> str:
    match = DATA_URL_RE.match(data_url or "")
    if not match:
        raise ApiError("Ảnh phải là tệp JPEG, PNG hoặc WebP.")
    mime, encoded = match.groups()
    try:
        raw = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ApiError("Dữ liệu ảnh không hợp lệ.") from exc
    if len(raw) > get_settings().max_image_bytes:
        raise ApiError("Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn.")
    if not raw.startswith(SIGNATURES[mime]):
        raise ApiError("Tệp tải lên không phải ảnh hợp lệ.")
    return store(db, f"{uuid.uuid4().hex}.{EXTENSIONS[mime]}", mime, raw)


def store(db: Session, name: str, mime: str, raw: bytes) -> str:
    db.merge(MediaFile(name=name, mime=mime, data=raw))
    return MEDIA_PREFIX + name


def delete_image(db: Session, url: str) -> None:
    if not url.startswith(MEDIA_PREFIX):
        return
    file = db.get(MediaFile, url[len(MEDIA_PREFIX) :])
    if file:
        db.delete(file)


def load(db: Session, name: str) -> MediaFile | None:
    return db.get(MediaFile, name)
