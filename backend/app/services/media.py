"""Lưu ảnh tải lên dưới dạng tệp, trả về đường dẫn công khai /media/..."""

import base64
import binascii
import re
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import ApiError

DATA_URL_RE = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,(.+)$", re.DOTALL)
SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MEDIA_PREFIX = "/media/"


def media_root() -> Path:
    root = Path(get_settings().media_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_image(data_url: str) -> str:
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
    name = f"{uuid.uuid4().hex}.{EXTENSIONS[mime]}"
    (media_root() / name).write_bytes(raw)
    return MEDIA_PREFIX + name


def delete_image(url: str) -> None:
    if not url.startswith(MEDIA_PREFIX):
        return
    path = media_root() / Path(url[len(MEDIA_PREFIX) :]).name
    path.unlink(missing_ok=True)
