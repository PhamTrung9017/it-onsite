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


async def _ask_gemini(description: str, categories: dict[str, str]) -> dict:
    settings = get_settings()
    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_seconds * 1000)),
    )
    listing = "\n".join(f"- {code}: {name}" for code, name in categories.items())
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=PROMPT.format(categories=listing, description=description),
        config=types.GenerateContentConfig(
            temperature=0,
            response_mime_type="application/json",
            response_json_schema=_schema(list(categories)),
        ),
    )
    data = json.loads(response.text)
    if data.get("categoryCode") not in categories or data.get("urgency") not in URGENCY_LEVELS:
        raise ValueError("Kết quả phân loại không đúng định dạng")
    data["confidence"] = round(min(max(float(data["confidence"]), 0.0), 1.0), 2)
    return data


async def classify(description: str, categories: dict[str, str], threshold: float) -> dict:
    """Trả về kết quả phân loại; lỗi hoặc quá hạn thì state = failed để không chặn việc tạo phiếu."""
    settings = get_settings()
    cleaned = redact_personal_data(description)
    started = time.monotonic()
    if settings.gemini_api_key:
        try:
            result = await asyncio.wait_for(_ask_gemini(cleaned, categories), timeout=settings.gemini_timeout_seconds)
            version = PROMPT_VERSION
        except Exception as exc:  # noqa: BLE001 - mọi lỗi từ dịch vụ ngoài đều chuyển sang trạng thái failed
            logger.warning("Phân loại bằng Gemini thất bại: %s", exc)
            return {"state": "failed", "ms": int((time.monotonic() - started) * 1000), "redacted": cleaned != description}
    else:
        result = classify_by_keywords(cleaned)
        version = "tu-khoa"
    return {
        **result,
        "state": "low_confidence" if result["confidence"] < threshold else "ok",
        "promptVersion": version,
        "ms": int((time.monotonic() - started) * 1000),
        "redacted": cleaned != description,
    }
