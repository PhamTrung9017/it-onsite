"""Tác vụ chạy nền: thu hồi phân công quá hạn (BR-06) và gửi hàng đợi thông báo (NFR-14)."""

import asyncio
import logging
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SessionLocal
from app.services.dispatch import sweep_overdue_assignments
from app.services.outbox import process_outbox

logger = logging.getLogger(__name__)


def _run(job: Callable[[Session], object]) -> None:
    with SessionLocal() as db:
        try:
            job(db)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Tác vụ nền %s lỗi", job.__name__)


async def _loop(job: Callable[[Session], object], seconds: int) -> None:
    while True:
        await asyncio.to_thread(_run, job)
        await asyncio.sleep(seconds)


def start_background_jobs() -> list[asyncio.Task]:
    settings = get_settings()
    return [
        asyncio.create_task(_loop(sweep_overdue_assignments, settings.sweep_interval_seconds)),
        asyncio.create_task(_loop(process_outbox, settings.outbox_interval_seconds)),
    ]
