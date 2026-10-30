from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.domain.classifier import classify_by_keywords, redact_personal_data
from app.domain.rules import (
    Booking,
    BusinessConfig,
    Candidate,
    WorkSchedule,
    amount_due,
    can_complete,
    cancellation_policy,
    has_conflict,
    off_duty,
    rank_technicians,
    review_policy,
    validate_review,
    validate_schedule,
    validate_slot,
    warranty_status,
)
from app.domain.status import Status, can_transition
from app.domain.vietqr import build_vietqr, crc16, sanitize_content

TZ = ZoneInfo("Asia/Ho_Chi_Minh")
CONFIG = BusinessConfig(areas=["Bến Thành"])
NOW = datetime(2026, 10, 30, 8, 0, tzinfo=TZ)


def test_vietqr_matches_reference_payload():
    assert crc16("123456789") == "29B1"
    payload = build_vietqr("970423", "0123456789", 150000, "DH123456")
    assert payload == (
        "00020101021238540010A00000072701240006970423011001234567890208QRIBFTTA530370454061500005802VN62120808DH123456630479AB"
    )


def test_vietqr_content_is_ascii_and_short():
    assert sanitize_content("Thanh toán YC-20261030-001") == "Thanh toan YC20261030001"
    assert len(sanitize_content("Đ" * 40)) == 25


def test_state_machine_blocks_invalid_moves():
    assert can_transition(Status.MOI, Status.DA_TIEP_NHAN)
    assert can_transition(Status.CHO_DUYET_BAO_GIA, Status.CHO_THANH_TOAN)
    assert not can_transition(Status.MOI, Status.HOAN_TAT)
    assert not can_transition(Status.DANG_KHAO_SAT, Status.DA_HUY)
    assert not can_transition(Status.HOAN_TAT, Status.DA_HUY)


def test_cancellation_policy_br03():
    assert cancellation_policy(Status.DA_PHAN_CONG, NOW + timedelta(hours=3), CONFIG, NOW).fee == 0
    late = cancellation_policy(Status.KTV_DA_NHAN, NOW + timedelta(hours=1), CONFIG, NOW)
    assert late.allowed and late.fee == CONFIG.survey_fee
    assert not cancellation_policy(Status.DANG_KHAO_SAT, NOW + timedelta(hours=5), CONFIG, NOW).allowed


def test_slot_must_be_ahead_and_within_service_hours():
    assert validate_slot(NOW + timedelta(hours=1), CONFIG, NOW, TZ)
    assert validate_slot(datetime(2026, 10, 30, 21, 0, tzinfo=TZ), CONFIG, NOW, TZ)
    assert validate_slot(datetime(2026, 10, 30, 14, 0, tzinfo=TZ), CONFIG, NOW, TZ) is None


def test_conflict_includes_travel_buffer_br04():
    booking = Booking("YC-1", 1, Status.KTV_DA_NHAN, NOW + timedelta(hours=2), 60)
    assert has_conflict(1, NOW + timedelta(hours=3, minutes=20), 60, [booking], CONFIG)
    assert not has_conflict(1, NOW + timedelta(hours=4), 60, [booking], CONFIG)
    assert not has_conflict(2, NOW + timedelta(hours=2), 60, [booking], CONFIG)
    cancelled = Booking("YC-2", 1, Status.DA_HUY, NOW + timedelta(hours=6), 60)
    assert not has_conflict(1, NOW + timedelta(hours=6), 60, [cancelled], CONFIG)


def test_rank_skill_then_area_then_load_then_rating_br05():
    at = NOW + timedelta(hours=4)
    candidates = [
        Candidate(1, ["MANG"], ["Bến Thành"], 5.0),
        Candidate(2, ["NGUON"], ["Gia Định"], 4.0),
        Candidate(3, ["NGUON"], ["Bến Thành"], 4.1),
        Candidate(4, ["NGUON"], ["Bến Thành"], 4.9),
    ]
    busy = [Booking("YC-9", 4, Status.KTV_DA_NHAN, at, 60)]
    ranked = rank_technicians(candidates, "NGUON", "Bến Thành", at, 60, busy, CONFIG, TZ)
    assert [r.candidate.tech_id for r in ranked] == [3, 2, 1, 4]
    assert ranked[-1].conflict


def test_amount_due_br02():
    assert amount_due(False, 350000, False, CONFIG) == 350000
    assert amount_due(True, 0, False, CONFIG) == CONFIG.survey_fee
    assert amount_due(True, 0, True, CONFIG) == 0


def test_warranty_and_review_rules():
    assert warranty_status(NOW + timedelta(days=2, hours=1), NOW) == {"valid": True, "daysLeft": 3}
    assert not warranty_status(NOW - timedelta(seconds=1), NOW)["valid"]
    assert review_policy(Status.HOAN_TAT, False, NOW - timedelta(days=1), CONFIG, NOW).allowed
    assert not review_policy(Status.HOAN_TAT, False, NOW - timedelta(days=8), CONFIG, NOW).allowed
    assert not review_policy(Status.HOAN_TAT, True, NOW, CONFIG, NOW).allowed
    assert validate_review(2, "")
    assert validate_review(2, "Đến trễ") is None
    assert validate_review(6, "")


def test_complete_requires_photos_br11():
    assert not can_complete(1, 0)
    assert can_complete(1, 1)


def test_redaction_removes_personal_data_nfr10():
    text = redact_personal_data("Gọi 0909 123 456 hoặc an@gmail.com, mật khẩu: abc123, nhà 12 đường Lê Lợi")
    assert "0909" not in text and "an@gmail.com" not in text and "abc123" not in text
    assert "12 đường" not in text


def test_keyword_classifier():
    result = classify_by_keywords("Máy không lên nguồn từ sáng, cần gấp")
    assert result["categoryCode"] == "NGUON" and result["urgency"] == "CAO"
    assert classify_by_keywords("abc")["categoryCode"] == "KHAC"


def test_config_round_trip():
    data = CONFIG.to_dict()
    assert BusinessConfig.from_dict(data) == CONFIG
    assert datetime.now(UTC).tzinfo is UTC


def test_work_schedule_uc18():
    weekdays = WorkSchedule(work_days=[1, 2, 3, 4, 5], start="08:00", end="17:00", days_off=["2026-11-03"])
    monday = datetime(2026, 11, 2, 9, 0, tzinfo=TZ)
    assert not off_duty(weekdays, monday, 60, TZ)
    assert off_duty(weekdays, monday.replace(hour=16, minute=30), 60, TZ), "kết thúc sau giờ làm"
    assert off_duty(weekdays, monday + timedelta(days=1), 60, TZ), "ngày nghỉ"
    assert off_duty(weekdays, monday + timedelta(days=5), 60, TZ), "thứ Bảy không làm"
    assert validate_schedule(weekdays) is None
    assert validate_schedule(WorkSchedule(work_days=[])) is not None
    assert validate_schedule(WorkSchedule(start="18:00", end="08:00")) is not None
    assert validate_schedule(WorkSchedule(days_off=["30/11/2026"])) is not None


def test_off_duty_technician_ranks_last():
    at = datetime(2026, 11, 7, 10, 0, tzinfo=TZ)
    saturday_off = WorkSchedule(work_days=[1, 2, 3, 4, 5])
    candidates = [Candidate(1, ["NGUON"], ["Bến Thành"], 5.0, saturday_off), Candidate(2, ["MANG"], ["Gia Định"], 4.0)]
    ranked = rank_technicians(candidates, "NGUON", "Bến Thành", at, 60, [], CONFIG, TZ)
    assert [r.candidate.tech_id for r in ranked] == [2, 1] and ranked[1].off_duty
