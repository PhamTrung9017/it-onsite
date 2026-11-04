"""Mô tả thay đổi dạng "cũ → mới" cho nhật ký thao tác (NFR-08)."""

from collections.abc import Callable
from typing import Any

from app.domain.rules import BusinessConfig, WorkSchedule
from app.services.common import money

WEEKDAY = {1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN"}
EMPTY = "(trống)"

Row = tuple[str, Any, Any] | tuple[str, Any, Any, Callable[[Any], str]]


def plain(value: Any) -> str:
    if isinstance(value, bool):
        return "Có" if value else "Không"
    if isinstance(value, list | tuple):
        return ", ".join(str(v) for v in value) or EMPTY
    if value is None or value == "":
        return EMPTY
    return str(value)


def describe(rows: list[Row]) -> str:
    """Chỉ ghi các trường có thay đổi, ví dụ "Giá: 150.000đ → 200.000đ; Bảo hành (ngày): 7 → 14"."""
    parts = []
    for label, old, new, *rest in rows:
        if old != new:
            fmt = rest[0] if rest else plain
            parts.append(f"{label}: {fmt(old)} → {fmt(new)}")
    return "; ".join(parts) or "Không thay đổi"


def list_change(label: str, old: list[str], new: list[str]) -> str | None:
    added = [x for x in new if x not in old]
    removed = [x for x in old if x not in new]
    if not added and not removed:
        return None
    parts = ([f"thêm {', '.join(added)}"] if added else []) + ([f"bỏ {', '.join(removed)}"] if removed else [])
    return f"{label}: {'; '.join(parts)}"


def schedule_text(schedule: WorkSchedule) -> str:
    days = ", ".join(WEEKDAY[d] for d in schedule.work_days)
    off = f", nghỉ {', '.join(schedule.days_off)}" if schedule.days_off else ""
    return f"{days} {schedule.start}–{schedule.end}{off}"


def join(*parts: str | None) -> str:
    text = "; ".join(p for p in parts if p and p != "Không thay đổi")
    return text or "Không thay đổi"


def _hours(config: BusinessConfig) -> str:
    return f"{config.service_start}–{config.service_end}"


def config_changes(old: BusinessConfig, new: BusinessConfig) -> str:
    return join(
        describe(
            [
                ("Phí khảo sát", old.survey_fee, new.survey_fee, money),
                ("Thời hạn trả phí giữ lịch (phút)", old.deposit_minutes, new.deposit_minutes),
                ("Khách tự đổi lịch trước (giờ)", old.free_cancel_hours, new.free_cancel_hours),
                ("Thời hạn KTV phản hồi (phút)", old.tech_response_minutes, new.tech_response_minutes),
                ("Thời gian đệm di chuyển (phút)", old.travel_buffer_minutes, new.travel_buffer_minutes),
                ("Thời hạn đánh giá (ngày)", old.review_window_days, new.review_window_days),
                ("Ngưỡng tin cậy AI", old.ai_confidence_threshold, new.ai_confidence_threshold),
                ("Giờ phục vụ", _hours(old), _hours(new)),
                ("Ngân hàng", old.bank_name, new.bank_name),
                ("Mã BIN", old.bank_bin, new.bank_bin),
                ("Số tài khoản", old.bank_account_number, new.bank_account_number),
                ("Chủ tài khoản", old.bank_account_name, new.bank_account_name),
                ("Lương cứng", old.base_salary, new.base_salary, money),
                ("Hoa hồng (%)", old.commission_percent, new.commission_percent),
            ]
        ),
        list_change("Khu vực phục vụ", old.areas, new.areas),
    )
