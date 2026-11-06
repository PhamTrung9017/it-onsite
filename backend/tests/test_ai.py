"""UC05: phân loại bằng Gemini API, thay dịch vụ thật bằng bản giả để kiểm thử."""

import asyncio
from types import SimpleNamespace

import pytest

from app.core.config import get_settings
from app.services import ai

CATEGORIES = {"NGUON": "Không lên nguồn", "KHAC": "Khác"}


class FakeModels:
    def __init__(self, replies: list, delay: float = 0):
        self.replies = replies
        self.delay = delay
        self.prompts: list[str] = []

    async def generate_content(self, model, contents, config):
        self.prompts.append(contents)
        await asyncio.sleep(self.delay)
        return SimpleNamespace(text=self.replies.pop(0))


@pytest.fixture
def gemini(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "khoa-thu")
    monkeypatch.setattr(settings, "gemini_timeout_seconds", 0.5)

    def install(replies: list, delay: float = 0) -> FakeModels:
        models = FakeModels(replies, delay)
        monkeypatch.setattr(ai.genai, "Client", lambda **_: SimpleNamespace(aio=SimpleNamespace(models=models)))
        return models

    return install


GOOD = '{"categoryCode": "NGUON", "confidence": 0.9, "urgency": "CAO", "reason": "Không lên nguồn"}'


def test_valid_reply_and_personal_data_is_removed(gemini):
    models = gemini([GOOD])
    result = asyncio.run(ai.classify("Máy không lên nguồn, gọi 0909123456", CATEGORIES, 0.6))
    assert result["categoryCode"] == "NGUON" and result["state"] == "ok" and result["promptVersion"] == ai.PROMPT_VERSION
    assert "0909123456" not in models.prompts[0]


def test_invalid_json_is_retried_once_uc05_3a(gemini):
    models = gemini(["khong phai json", GOOD])
    assert asyncio.run(ai.classify("Máy không lên nguồn", CATEGORIES, 0.6))["state"] == "ok"
    assert len(models.prompts) == 2


def test_two_invalid_replies_mark_unclassified(gemini):
    gemini(['{"categoryCode": "LA"}', "{}"])
    assert asyncio.run(ai.classify("Máy không lên nguồn", CATEGORIES, 0.6))["state"] == "failed"


def test_low_confidence_needs_dispatcher(gemini):
    gemini(['{"categoryCode": "KHAC", "confidence": 0.4, "urgency": "THAP", "reason": "Không rõ"}'])
    assert asyncio.run(ai.classify("Máy hơi lạ", CATEGORIES, 0.6))["state"] == "low_confidence"


def test_timeout_does_not_block_nfr03(gemini):
    gemini([GOOD], delay=2)
    result = asyncio.run(ai.classify("Máy không lên nguồn", CATEGORIES, 0.6))
    assert result["state"] == "failed" and result["ms"] < 1500
