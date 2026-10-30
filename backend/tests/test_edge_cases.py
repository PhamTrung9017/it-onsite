"""Các tình huống biên phát hiện khi rà soát: mỗi ca chặn một lỗi tái phát."""

from datetime import timedelta

from sqlalchemy import func, select, update

from app.db import SessionLocal
from app.models import Assignment, Notification, Ticket, User, Warranty
from app.services.common import utcnow
from tests.conftest import PNG, Api, tomorrow_at
from tests.test_flow import create_ticket, login_tech, receive_and_assign


def work_until_quote(tech: Api, ticket_id: str, items: list[dict]) -> dict:
    tech.ok("post", f"/tickets/{ticket_id}/assignment/response", {"accept": True})
    tech.ok("post", f"/tickets/{ticket_id}/check-in")
    tech.ok("post", f"/tickets/{ticket_id}/photos", {"kind": "before", "photos": [PNG]})
    return tech.ok("post", f"/tickets/{ticket_id}/quotes", {"items": items})


def service_id(api: Api, category: str) -> int:
    return next(s["id"] for s in api.ok("get", "/catalog")["services"] if s["categoryCode"] == category)


def notifications_of(email: str, ticket_id: str) -> list[str]:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        return list(db.scalars(select(Notification.title).where(Notification.user_id == user.id, Notification.ticket_id == ticket_id)))


def test_warranty_ticket_is_free_and_does_not_extend_warranty(client, khach, dpv):
    warranty = next(w for w in khach.ok("get", "/warranties/mine") if w["valid"])
    claim = khach.ok(
        "post", "/warranty-claims", {"warrantyId": warranty["id"], "description": "Máy lại nóng như cũ", "slotStart": tomorrow_at(9)}
    )
    ticket_id = dpv.ok("post", f"/warranty-claims/{claim['id']}/decision", {"valid": True})["newTicketId"]
    ticket = dpv.ok("get", f"/tickets/{ticket_id}")
    assigned = receive_and_assign(dpv, ticket)
    tech = login_tech(client, dpv, assigned["assignment"]["techId"])
    quoted = work_until_quote(tech, ticket_id, [{"kind": "service", "refId": service_id(khach, "MAY_CHAM"), "qty": 1}])
    assert quoted["quotes"][-1]["items"][0]["unitPrice"] == 0
    khach.ok("post", f"/tickets/{ticket_id}/quotes/{quoted['quotes'][-1]['id']}/decision", {"decision": "approve"})
    tech.ok("post", f"/tickets/{ticket_id}/photos", {"kind": "after", "photos": [PNG]})
    tech.ok("post", f"/tickets/{ticket_id}/complete")
    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(Warranty))
    done = khach.ok("post", f"/tickets/{ticket_id}/acceptance", {"ok": True})
    assert done["status"] == "HOAN_TAT", "không bắt khách thanh toán 0đ"
    assert done["payment"]["status"] == "MIEN_PHI"
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Warranty)) == before, "bảo hành không tự gia hạn"


def test_partial_approval_ignores_items_of_other_quotes(client, khach):
    ticket = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    quote_id = ticket["quotes"][-1]["id"]
    response = khach.post(f"/tickets/{ticket['id']}/quotes/{quote_id}/decision", {"decision": "partial", "itemIds": [999999]})
    assert response.status_code == 400


def test_technician_cannot_accept_after_deadline_br06(client, khach, dpv, ktv):
    ticket = next(t for t in ktv.ok("get", "/tech/jobs") if t["status"] == "DA_PHAN_CONG")
    with SessionLocal() as db:
        db.execute(update(Assignment).where(Assignment.ticket_id == ticket["id"]).values(deadline=utcnow() - timedelta(seconds=5)))
        db.commit()
    assert ktv.post(f"/tickets/{ticket['id']}/assignment/response", {"accept": True}).status_code == 409


def test_onsite_code_is_cancelled_after_five_wrong_attempts(client, ktv):
    ticket = next(t for t in ktv.ok("get", "/tech/jobs") if t["status"] == "CHO_DUYET_BAO_GIA")
    ktv.ok("post", f"/tickets/{ticket['id']}/onsite-code")
    codes = [ktv.post(f"/tickets/{ticket['id']}/onsite-code/confirm", {"code": "000000"}).status_code for _ in range(5)]
    assert codes == [400, 400, 400, 400, 409]
    assert ktv.post(f"/tickets/{ticket['id']}/onsite-code/confirm", {"code": "000000"}).status_code == 409


def test_photos_are_locked_after_work_is_handed_over(client, ktv):
    ticket = next(t for t in ktv.ok("get", "/tech/jobs") if t["status"] == "KTV_DA_NHAN")
    assert ktv.post(f"/tickets/{ticket['id']}/photos", {"kind": "before", "photos": [PNG]}).status_code == 409
    assert ktv.put(f"/tickets/{ticket['id']}/checklist", {"checklist": [{"text": "a", "done": False}]}).status_code == 409


def test_quote_checks_total_stock_of_repeated_part(client, ktv):
    ticket = next(t for t in ktv.ok("get", "/tech/jobs") if t["status"] == "KTV_DA_NHAN")
    ktv.ok("post", f"/tickets/{ticket['id']}/check-in")
    router = next(p for p in ktv.ok("get", "/parts") if p["stock"] == 1)
    items = [{"kind": "part", "refId": router["id"], "qty": 1}, {"kind": "part", "refId": router["id"], "qty": 1}]
    assert ktv.post(f"/tickets/{ticket['id']}/quotes", {"items": items}).status_code == 400


def test_locked_or_removed_technician_is_not_suggested(client, qtv, dpv, khach):
    ticket = create_ticket(khach, "Laptop bị virus quảng cáo bật liên tục.")
    received = dpv.ok("post", f"/tickets/{ticket['id']}/receive", {"categoryCode": "VIRUS", "version": ticket["version"]})
    users = qtv.ok("get", "/admin/overview")["users"]
    an = next(u for u in users if u["email"] == "ktv@demo.vn")
    huy = next(u for u in users if u["email"] == "huy.tran@demo.vn")
    qtv.ok("put", f"/admin/users/{an['id']}/roles", {"roles": ["KTV"], "locked": True})
    qtv.ok("put", f"/admin/users/{huy['id']}/roles", {"roles": ["KHACH"], "locked": False})
    at = received["slotStart"].replace("+", "%2B")
    names = {s["tech"]["name"] for s in dpv.ok("get", f"/tickets/{ticket['id']}/technician-suggestions?appointmentAt={at}")}
    assert "Nguyễn Văn An" not in names and "Trần Quang Huy" not in names
    with SessionLocal() as db:
        k1 = db.scalar(select(User).where(User.email == "ktv@demo.vn")).technician
    response = dpv.post(
        f"/tickets/{ticket['id']}/assign", {"techId": k1.id, "appointmentAt": received["slotStart"], "version": received["version"]}
    )
    assert response.status_code == 400


def test_each_event_notifies_each_person_once(client, khach, dpv):
    assigned = receive_and_assign(dpv, create_ticket(khach, "Máy tính không lên nguồn từ sáng nay."))
    tech = login_tech(client, dpv, assigned["assignment"]["techId"])
    assert notifications_of(tech.user["email"], assigned["id"]) == ["Việc mới được phân công"]
    work_until_quote(tech, assigned["id"], [{"kind": "service", "refId": service_id(khach, "NGUON"), "qty": 1}])
    titles = notifications_of("khach@demo.vn", assigned["id"])
    assert titles.count("Có báo giá mới") == 1
    assert len([t for t in titles if t == "Cập nhật trạng thái phiếu"]) == 4, "phân công, nhận việc, check-in, không lặp khi có báo giá"


def test_customer_is_not_told_why_technician_declined(client, khach, dpv):
    assigned = receive_and_assign(dpv, create_ticket(khach, "Máy in không in được qua mạng."))
    tech = login_tech(client, dpv, assigned["assignment"]["techId"])
    before = len(notifications_of("khach@demo.vn", assigned["id"]))
    tech.ok("post", f"/tickets/{assigned['id']}/assignment/response", {"accept": False, "reason": "Bận việc riêng"})
    assert len(notifications_of("khach@demo.vn", assigned["id"])) == before


def test_customer_can_claim_again_after_rejection(client, khach, dpv):
    warranty = next(w for w in khach.ok("get", "/warranties/mine") if w["valid"])
    body = {"warrantyId": warranty["id"], "description": "Lỗi cũ xuất hiện lại", "slotStart": tomorrow_at(10)}
    claim = khach.ok("post", "/warranty-claims", body)
    assert khach.post("/warranty-claims", body).status_code == 409
    dpv.ok("post", f"/warranty-claims/{claim['id']}/decision", {"valid": False, "reason": "Lỗi do va đập"})
    listed = next(w for w in khach.ok("get", "/warranties/mine") if w["id"] == warranty["id"])
    assert listed["claim"]["status"] == "TU_CHOI" and listed["claim"]["reason"] == "Lỗi do va đập"
    assert khach.post("/warranty-claims", body).status_code == 201


def test_forged_ai_result_is_cleaned(client, khach):
    device_id = khach.ok("get", "/me/devices")[0]["id"]
    ticket = khach.ok(
        "post",
        "/tickets",
        {
            "deviceId": device_id,
            "description": "Máy chạy chậm và nóng",
            "address": "1 Lê Lợi",
            "ward": "Bến Thành",
            "slotStart": tomorrow_at(14),
            "aiResult": {"state": "ok", "confidence": "rất cao", "urgency": "SIEU_GAP", "categoryCode": "MAY_CHAM"},
            "acceptTerms": True,
            "acceptPrivacy": True,
        },
    )
    assert ticket["aiResult"] is None and ticket["urgency"] == "TRUNG_BINH"
    with SessionLocal() as db:
        assert db.get(Ticket, ticket["id"]).ai_result is None


def test_late_cancellation_fee_only_when_customer_cancels_br03(client, khach, dpv):
    by_customer = create_ticket(khach, "Cần cài lại Windows cho laptop.")
    by_dispatcher = create_ticket(khach, "Cần cài Office cho máy tính.")
    with SessionLocal() as db:
        db.execute(
            update(Ticket).where(Ticket.id.in_([by_customer["id"], by_dispatcher["id"]])).values(slot_start=utcnow() + timedelta(hours=1))
        )
        db.commit()
    assert khach.ok("post", f"/tickets/{by_customer['id']}/cancel", {"reason": "Bận việc"})["cancel"]["fee"] == 50000
    assert dpv.ok("post", f"/tickets/{by_dispatcher['id']}/cancel", {"reason": "Ngoài khu vực"})["cancel"]["fee"] == 0
