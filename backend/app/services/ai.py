"""Phân loại sự cố bằng Gemini API (UC05), giới hạn 10 giây (NFR-03), không gửi dữ liệu cá nhân (NFR-10)."""

import asyncio
import json
import logging
import time

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.domain.classifier import URGENCY_LEVELS, classify_by_keywords, redact_personal_data

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v1"
FALLBACK_VERSION = "tu-khoa-du-phong"
PARSE_ATTEMPTS = 2
_clients: dict[tuple, genai.Client] = {}

PROMPT = """Bạn phân loại sự cố máy tính cho một dịch vụ sửa máy tính tận nơi tại TP. Hồ Chí Minh.
Chọn đúng một mã loại sự cố trong danh sách:
{categories}

Mức khẩn:
- CAO: máy không dùng được và khách cần gấp, mất dữ liệu, mã độc tống tiền.
- TRUNG_BINH: ảnh hưởng công việc nhưng vẫn dùng tạm được.
- THAP: cải thiện, nâng cấp, không gấp.

Độ tin cậy là số từ 0 đến 1. Lý do viết bằng tiếng Việt, tối đa 25 từ.

Mô tả của khách:
\"\"\"{description}\"\"\"
"""


def _schema(codes: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "categoryCode": {"type": "string", "enum": codes},
            "confidence": {"type": "number"},
            "urgency": {"type": "string", "enum": list(URGENCY_LEVELS)},
            "reason": {"type": "string"},
        },
        "required": ["categoryCode", "confidence", "urgency", "reason"],
    }


def _parse(text: str | None, categories: dict[str, str]) -> dict:
    data = json.loads(text or "")
    if not isinstance(data, dict) or data.get("categoryCode") not in categories or data.get("urgency") not in URGENCY_LEVELS:
        raise ValueError("Kết quả phân loại không đúng định dạng")
    return {
        "categoryCode": data["categoryCode"],
        "confidence": round(min(max(float(data["confidence"]), 0.0), 1.0), 2),
        "urgency": data["urgency"],
        "reason": str(data.get("reason", ""))[:300],
    }


def _client() -> genai.Client:
    """Dùng lại một kết nối tới Gemini cho mọi lần phân loại (không bắt tay TLS lại mỗi lần)."""
    settings = get_settings()
    timeout_ms = int(settings.gemini_timeout_seconds * 1000)
    key = (genai.Client, settings.gemini_api_key, timeout_ms)
    if key not in _clients:
        _clients[key] = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=timeout_ms))
    return _clients[key]


async def _ask_gemini(description: str, categories: dict[str, str]) -> dict:
    """UC05 luồng 3a: kết quả sai định dạng thì gửi lại một lần."""
    settings = get_settings()
    client = _client()
    listing = "\n".join(f"- {code}: {name}" for code, name in categories.items())
    last_error: Exception | None = None
    for _ in range(PARSE_ATTEMPTS):
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=PROMPT.format(categories=listing, description=description),
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
                response_json_schema=_schema(list(categories)),
            ),
        )
        try:
            return _parse(response.text, categories)
        except (ValueError, KeyError, TypeError) as exc:
            last_error = exc
    raise ValueError("Kết quả phân loại không đúng định dạng") from last_error


def _by_keywords(description: str, categories: dict[str, str]) -> dict:
    result = classify_by_keywords(description)
    if result["categoryCode"] not in categories:
        result["categoryCode"] = "KHAC" if "KHAC" in categories else next(iter(categories))
    return result


async def classify(description: str, categories: dict[str, str], threshold: float) -> dict:
    """Trả về kết quả phân loại, không chặn việc tạo phiếu.

    Gemini lỗi hoặc quá hạn thì dùng bộ phân loại theo từ khóa làm gợi ý dự phòng, luôn cần điều phối viên xác nhận.
    """
    settings = get_settings()
    cleaned = redact_personal_data(description)
    started = time.monotonic()
    fallback = False
    if settings.gemini_api_key:
        try:
            result = await asyncio.wait_for(_ask_gemini(cleaned, categories), timeout=settings.gemini_timeout_seconds)
            version = PROMPT_VERSION
        except Exception as exc:  # noqa: BLE001 - mọi lỗi từ dịch vụ ngoài đều chuyển sang gợi ý dự phòng
            logger.warning("Phân loại bằng Gemini thất bại, dùng từ khóa: %s", exc)
            result, version, fallback = _by_keywords(cleaned, categories), FALLBACK_VERSION, True
    else:
        result = classify_by_keywords(cleaned)
        version = "tu-khoa"
    return {
        **result,
        "state": "low_confidence" if fallback or result["confidence"] < threshold else "ok",
        "promptVersion": version,
        "ms": int((time.monotonic() - started) * 1000),
        "redacted": cleaned != description,
    }
