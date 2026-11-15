"""Thông báo đúng kênh, điểm đánh giá, tồn kho, giờ phục vụ, hồ sơ khách đặt nhanh."""

from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import Assignment, OutboxMessage, Review, Technician, Ticket, User
from app.services import outbox
from tests.conftest import tomorrow_at
from tests.test_flow import create_ticket, receive
from tests.test_guest import book, fresh_throttle  # noqa: F401


def test_email_skips_demo_domain_and_most_status_changes(client, khach, dpv, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_relay_url", "https://script.google.com/macros/s/x/exec")
    assert settings.email_deliverable("ban@gmail.com") and not settings.email_deliverable("khach@demo.vn")
    assert not settings.email_deliverable("") and not settings.email_deliverable(None)
    with SessionLocal() as db:
        db.query(User).filter(User.email == "khach@demo.vn").update({"email": "khach.that@example.com"})
        db.commit()
    ticket = create_ticket(khach, "Máy chạy chậm, mở ứng dụng rất lâu")
    receive(dpv, ticket, "MAY_CHAM")
    with SessionLocal() as db:
        mails = list(
            db.scalars(
                select(OutboxMessage.subject).where(OutboxMessage.channel == "email", OutboxMessage.recipient == "khach.that@example.com")
            )
        )
    assert "[IT OnSite] Đã nhận yêu cầu" in mails
    assert "[IT OnSite] Cập nhật trạng thái phiếu" not in mails, "tiếp nhận phiếu chỉ báo trên web và Telegram"
    with SessionLocal() as db:
        row = OutboxMessage(channel="email", recipient="dpv@demo.vn", subject="x", body="y", next_attempt_at=None)
        assert outbox._deliver(row) is False, "không gửi thư thật tới tên miền của tài khoản mẫu"


def test_status_email_only_at_key_milestones(client, khach, dpv, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_relay_url", "https://script.google.com/macros/s/x/exec")
    with SessionLocal() as db:
        db.query(User).filter(User.email == "khach@demo.vn").update({"email": "khach.that@example.com"})
        db.commit()
    ticket = create_ticket(khach, "Máy chạy chậm, mở ứng dụng rất lâu")
    dpv.ok("post", f"/tickets/{ticket['id']}/cancel", {"reason": "Khách gọi báo hủy", "chargeCustomer": False})
    with SessionLocal() as db:
        mails = list(
            db.scalars(
                select(OutboxMessage.body).where(OutboxMessage.channel == "email", OutboxMessage.recipient == "khach.that@example.com")
            )
        )
    assert any("Đã hủy" in m for m in mails), "hủy phiếu vẫn gửi email"


def test_rating_is_average_of_all_reviews(client, khach):
    done = [t for t in khach.ok("get", "/tickets/mine?limit=100") if t["status"] == "HOAN_TAT" and not t.get("review")]
    ticket = next(t for t in done if khach.post(f"/tickets/{t['id']}/review", {"stars": 3, "comment": ""}).status_code == 200)
    with SessionLocal() as db:
        tech = db.get(Technician, db.get(Ticket, ticket["id"]).assignment.tech_id)
        stars = list(
            db.scalars(
                select(Review.stars)
                .join(Assignment, Assignment.ticket_id == Review.ticket_id)
                .where(Assignment.tech_id == tech.id, Assignment.result == "NHAN")
            )
        )
        assert tech.rating_count == len(stars)
        assert float(tech.rating) == round(sum(stars) / len(stars), 1)


def test_assign_outside_service_hours_is_rejected(client, khach, dpv):
    ticket = create_ticket(khach, "Máy chạy chậm, mở ứng dụng rất lâu")
    received = receive(dpv, ticket, "MAY_CHAM")
    at = received["slotStart"].replace("+", "%2B")
    best = next(s for s in dpv.ok("get", f"/tickets/{ticket['id']}/technician-suggestions?appointmentAt={at}") if not s["conflict"])
    late = tomorrow_at(21)
    response = dpv.post(
        f"/tickets/{ticket['id']}/assign", {"techId": best["tech"]["id"], "appointmentAt": late, "version": received["version"]}
    )
    assert response.status_code == 400 and "giờ phục vụ" in response.json()["detail"]


def test_guest_booking_saves_address_to_profile(client):
    book(client)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.phone == "0938111222"))
        assert (user.address, user.ward) == ("18 Lê Lợi", "Bến Thành")
