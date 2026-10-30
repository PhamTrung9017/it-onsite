"""Quy tắc nghiệp vụ dùng chung, không phụ thuộc cơ sở dữ liệu."""

import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.domain.status import BUSY_STATUSES, CANCELLABLE, Status

SLOT_LEAD_HOURS = 2
MAX_DAYS_OFF = 60


@dataclass
class BusinessConfig:
    survey_fee: int = 50000
    free_cancel_hours: int = 2
    tech_response_minutes: int = 15
    travel_buffer_minutes: int = 30
    review_window_days: int = 7
    ai_confidence_threshold: float = 0.6
    service_start: str = "08:00"
    service_end: str = "20:00"
    areas: list[str] = field(default_factory=list)
    bank_name: str = ""
    bank_bin: str = ""
    bank_account_number: str = ""
    bank_account_name: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "BusinessConfig":
        hours = data.get("serviceHours", {})
        bank = data.get("bank", {})
        return cls(
            survey_fee=int(data["surveyFee"]),
            free_cancel_hours=int(data["freeCancelHours"]),
            tech_response_minutes=int(data["techResponseMinutes"]),
            travel_buffer_minutes=int(data["travelBufferMinutes"]),
            review_window_days=int(data["reviewWindowDays"]),
            ai_confidence_threshold=float(data.get("aiConfidenceThreshold", 0.6)),
            service_start=hours.get("start", "08:00"),
            service_end=hours.get("end", "20:00"),
            areas=list(data.get("areas", [])),
            bank_name=bank.get("name", ""),
            bank_bin=bank.get("bin", ""),
            bank_account_number=bank.get("accountNumber", ""),
            bank_account_name=bank.get("accountName", ""),
        )

    def to_dict(self) -> dict:
        return {
            "surveyFee": self.survey_fee,
            "freeCancelHours": self.free_cancel_hours,
            "techResponseMinutes": self.tech_response_minutes,
            "travelBufferMinutes": self.travel_buffer_minutes,
            "reviewWindowDays": self.review_window_days,
            "aiConfidenceThreshold": self.ai_confidence_threshold,
            "serviceHours": {"start": self.service_start, "end": self.service_end},
            "areas": self.areas,
            "bank": {
                "name": self.bank_name,
                "bin": self.bank_bin,
                "accountNumber": self.bank_account_number,
                "accountName": self.bank_account_name,
            },
        }


@dataclass
class Booking:
    """Một lịch hẹn đang chiếm thời gian của KTV."""

    ticket_id: str
    tech_id: int
    status: str
    appointment_at: datetime
    duration_min: int


@dataclass
class Policy:
    allowed: bool
    reason: str = ""
    fee: int = 0

    def to_dict(self) -> dict:
        return {"allowed": self.allowed, "reason": self.reason, "fee": self.fee}


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def cancellation_policy(status: str, appointment_at: datetime, config: BusinessConfig, now: datetime) -> Policy:
    """BR-03: điều kiện hủy, đổi lịch và phí áp dụng."""
    if Status(status) not in CANCELLABLE:
        return Policy(False, "Kỹ thuật viên đã check-in, không thể hủy hoặc đổi lịch.")
    if appointment_at - now >= timedelta(hours=config.free_cancel_hours):
        return Policy(True, f"Miễn phí vì còn ít nhất {config.free_cancel_hours} giờ trước giờ hẹn.", 0)
    return Policy(True, f"Còn dưới {config.free_cancel_hours} giờ trước giờ hẹn nên tính phí khảo sát.", config.survey_fee)


def validate_slot(slot_start: datetime | None, config: BusinessConfig, now: datetime, tz: ZoneInfo) -> str | None:
    """Khung giờ hợp lệ: trong giờ phục vụ và cách hiện tại ít nhất 2 giờ."""
    if slot_start is None:
        return "Vui lòng chọn ngày và khung giờ."
    if slot_start < now + timedelta(hours=SLOT_LEAD_HOURS):
        return f"Vui lòng chọn khung giờ cách hiện tại ít nhất {SLOT_LEAD_HOURS} giờ."
    local = slot_start.astimezone(tz)
    minute_of_day = local.hour * 60 + local.minute
    if not _minutes(config.service_start) <= minute_of_day < _minutes(config.service_end):
        return f"Khung giờ phải nằm trong giờ phục vụ {config.service_start}–{config.service_end}."
    return None


def busy_interval(appointment_at: datetime, duration_min: int, buffer_min: int) -> tuple[datetime, datetime]:
    return (
        appointment_at - timedelta(minutes=buffer_min),
        appointment_at + timedelta(minutes=duration_min + buffer_min),
    )


def has_conflict(
    tech_id: int,
    appointment_at: datetime,
    duration_min: int,
    bookings: Iterable[Booking],
    config: BusinessConfig,
    ignore_ticket_id: str | None = None,
) -> bool:
    """BR-04: KTV có lịch chồng với khung giờ mới hay không (tính cả thời gian đệm di chuyển)."""
    start, end = busy_interval(appointment_at, duration_min, config.travel_buffer_minutes)
    for b in bookings:
        if b.ticket_id == ignore_ticket_id or b.tech_id != tech_id or Status(b.status) not in BUSY_STATUSES:
            continue
        other_start, other_end = busy_interval(b.appointment_at, b.duration_min, config.travel_buffer_minutes)
        if start < other_end and other_start < end:
            return True
    return False


@dataclass
class WorkSchedule:
    """Lịch làm việc của KTV (UC18): thứ trong tuần (1 = thứ Hai … 7 = Chủ nhật), giờ làm, ngày nghỉ."""

    work_days: list[int] = field(default_factory=lambda: [1, 2, 3, 4, 5, 6])
    start: str = "08:00"
    end: str = "20:00"
    days_off: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict | None) -> "WorkSchedule":
        if not data:
            return cls()
        return cls(
            work_days=sorted({int(d) for d in data.get("workDays", [])}),
            start=str(data.get("start", "08:00")),
            end=str(data.get("end", "20:00")),
            days_off=sorted({str(d) for d in data.get("daysOff", [])}),
        )

    def to_dict(self) -> dict:
        return {"workDays": self.work_days, "start": self.start, "end": self.end, "daysOff": self.days_off}


def validate_schedule(schedule: WorkSchedule) -> str | None:
    if not schedule.work_days or any(d not in range(1, 8) for d in schedule.work_days):
        return "Chọn ít nhất một ngày làm việc trong tuần."
    try:
        start, end = _minutes(schedule.start), _minutes(schedule.end)
    except ValueError:
        return "Giờ làm việc không hợp lệ."
    if not 0 <= start < end <= 24 * 60:
        return "Giờ bắt đầu làm việc phải trước giờ kết thúc."
    try:
        for day in schedule.days_off:
            date.fromisoformat(day)
    except ValueError:
        return "Ngày nghỉ không hợp lệ."
    if len(schedule.days_off) > MAX_DAYS_OFF:
        return f"Chỉ lưu tối đa {MAX_DAYS_OFF} ngày nghỉ."
    return None


def off_duty(schedule: WorkSchedule, appointment_at: datetime, duration_min: int, tz: ZoneInfo) -> bool:
    """Lịch hẹn rơi vào ngày nghỉ, ngày không làm hoặc vượt ngoài giờ làm của KTV."""
    start = appointment_at.astimezone(tz)
    end = start + timedelta(minutes=duration_min)
    if start.date().isoformat() in schedule.days_off or start.isoweekday() not in schedule.work_days:
        return True
    if end.date() != start.date():
        return True
    return not (_minutes(schedule.start) <= start.hour * 60 + start.minute and end.hour * 60 + end.minute <= _minutes(schedule.end))


@dataclass
class Candidate:
    tech_id: int
    skills: list[str]
    areas: list[str]
    rating: float
    schedule: WorkSchedule = field(default_factory=WorkSchedule)


@dataclass
class Ranked:
    candidate: Candidate
    skill: bool
    area: bool
    jobs_today: int
    conflict: bool
    off_duty: bool = False


def rank_technicians(
    candidates: Iterable[Candidate],
    category_code: str,
    ward: str,
    appointment_at: datetime,
    duration_min: int,
    bookings: list[Booking],
    config: BusinessConfig,
    tz: ZoneInfo,
    ticket_id: str | None = None,
) -> list[Ranked]:
    """BR-05: đúng kỹ năng → đúng khu vực → ít việc trong ngày → đánh giá cao.

    KTV trùng lịch (BR-04) hoặc ngoài lịch làm việc (UC18) xếp cuối, kèm cờ để giao diện hiển thị lý do.
    """
    day = appointment_at.astimezone(tz).date()
    ranked = []
    for c in candidates:
        jobs_today = sum(
            1
            for b in bookings
            if b.tech_id == c.tech_id and Status(b.status) in BUSY_STATUSES and b.appointment_at.astimezone(tz).date() == day
        )
        ranked.append(
            Ranked(
                candidate=c,
                skill=category_code in c.skills,
                area=ward in c.areas,
                jobs_today=jobs_today,
                conflict=has_conflict(c.tech_id, appointment_at, duration_min, bookings, config, ticket_id),
                off_duty=off_duty(c.schedule, appointment_at, duration_min, tz),
            )
        )
    ranked.sort(key=lambda r: (r.conflict or r.off_duty, not r.skill, not r.area, r.jobs_today, -r.candidate.rating))
    return ranked


def response_deadline(assigned_at: datetime, config: BusinessConfig) -> datetime:
    """BR-06: hạn KTV phải nhận hoặc từ chối việc."""
    return assigned_at + timedelta(minutes=config.tech_response_minutes)


def amount_due(main_quote_rejected: bool, approved_total: int, is_warranty: bool, config: BusinessConfig) -> int:
    """BR-02: chỉ thu phí khảo sát khi khách từ chối báo giá chính; phiếu bảo hành không tính phí khảo sát."""
    if main_quote_rejected:
        return 0 if is_warranty else config.survey_fee
    return approved_total


def warranty_status(end_at: datetime, now: datetime) -> dict:
    """BR-07: bảo hành còn hiệu lực đến hết thời điểm kết thúc."""
    if now > end_at:
        return {"valid": False, "daysLeft": 0}
    return {"valid": True, "daysLeft": math.ceil((end_at - now) / timedelta(days=1))}


def review_policy(status: str, has_review: bool, completed_at: datetime | None, config: BusinessConfig, now: datetime) -> Policy:
    """BR-10: đánh giá một lần, trong thời hạn sau khi hoàn tất."""
    if status != Status.HOAN_TAT:
        return Policy(False, "Chỉ đánh giá được sau khi phiếu hoàn tất.")
    if has_review:
        return Policy(False, "Phiếu này đã được đánh giá.")
    if completed_at and now - completed_at > timedelta(days=config.review_window_days):
        return Policy(False, f"Đã quá {config.review_window_days} ngày kể từ khi hoàn tất.")
    return Policy(True)


def validate_review(stars: int, comment: str) -> str | None:
    if not isinstance(stars, int) or not 1 <= stars <= 5:
        return "Vui lòng chọn số sao từ 1 đến 5."
    if stars <= 2 and not comment.strip():
        return "Đánh giá từ 2 sao trở xuống cần ghi lý do để chúng tôi cải thiện."
    return None


def can_complete(photos_before: int, photos_after: int) -> bool:
    """BR-11: cần ít nhất 1 ảnh trước và 1 ảnh sau khi xử lý."""
    return photos_before >= 1 and photos_after >= 1
