"""Phí giữ lịch (BR-02, BR-03): trả trước, xác nhận, trừ vào tổng tiền, hoàn hoặc không hoàn khi hủy."""

from datetime import timedelta

from sqlalchemy import update

from app.db import SessionLocal
from app.models import Ticket
from app.services.common import utcnow
from tests.conftest import Api, tomorrow_at
from tests.test_flow import create_ticket, receive


def deposit_status(api: Api, ticket_id: str) -> str:
    return api.ok("get", f"/tickets/{ticket_id}")["deposit"]["status"]


def test_cancel_before_payment_costs_nothing(client, khach):
    ticket = create_ticket(khach, "Cần cài phần mềm kế toán MISA.")
    cancelled = khach.ok("post", f"/tickets/{ticket['id']}/cancel", {"reason": "Đổi ý"})
    assert cancelled["cancel"]["fee"] == 0 and cancelled["deposit"]["status"] == "KHONG_PHAT_SINH"


def test_cancel_while_new_refunds_deposit(client, khach, dpv):
    ticket = create_ticket(khach, "Cần cài Office cho máy tính.")
    khach.ok("post", f"/tickets/{ticket['id']}/deposit/transfer")
    assert any(t["id"] == ticket["id"] and t["deposit"]["status"] == "CHO_XAC_NHAN" for t in dpv.ok("get", "/deposits"))
    dpv.ok("post", f"/tickets/{ticket['id']}/deposit/confirm")
    cancelled = khach.ok("post", f"/tickets/{ticket['id']}/cancel", {"reason": "Đã tự xử lý được"})
    assert cancelled["cancel"]["fee"] == 0 and cancelled["deposit"]["status"] == "CHO_HOAN"

    assert khach.post(f"/tickets/{ticket['id']}/deposit/refund", {}).status_code == 403
    refunded = dpv.ok("post", f"/tickets/{ticket['id']}/deposit/refund", {"received": True})
    assert refunded["deposit"]["status"] == "DA_HOAN" and refunded["deposit"]["settledByName"]
    assert dpv.post(f"/tickets/{ticket['id']}/deposit/refund", {}).status_code == 409
    assert any(n["title"] == "Đã hoàn phí giữ lịch" for n in khach.ok("get", "/notifications"))


def test_reported_transfer_not_received_is_closed_without_refund(client, khach, dpv):
    ticket = create_ticket(khach, "Laptop chạy rất chậm.")
    khach.ok("post", f"/tickets/{ticket['id']}/deposit/transfer")
    khach.ok("post", f"/tickets/{ticket['id']}/cancel", {"reason": "Đổi ý"})
    closed = dpv.ok("post", f"/tickets/{ticket['id']}/deposit/refund", {"received": False})
    assert closed["deposit"]["status"] == "KHONG_PHAT_SINH"


def test_cancel_after_store_received_forfeits_deposit(client, khach, dpv):
    received = receive(dpv, create_ticket(khach, "Cài lại Windows 11 cho laptop."))
    policy = khach.ok("get", f"/tickets/{received['id']}")["policy"]
    assert policy["allowed"] and policy["fee"] == 50000
    cancelled = khach.ok("post", f"/tickets/{received['id']}/cancel", {"reason": "Bận việc"})
    assert cancelled["cancel"]["fee"] == 50000 and cancelled["deposit"]["status"] == "KHONG_HOAN"


def test_dispatcher_cancel_refunds_unless_customer_at_fault(client, khach, dpv):
    store = receive(dpv, create_ticket(khach, "Mạng wifi chập chờn."))
    absent = receive(dpv, create_ticket(khach, "Máy in không nhận lệnh in."))
    by_store = dpv.ok("post", f"/tickets/{store['id']}/cancel", {"reason": "Không có kỹ thuật viên phù hợp"})
    assert by_store["cancel"]["fee"] == 0 and by_store["deposit"]["status"] == "CHO_HOAN"
    no_show = dpv.ok("post", f"/tickets/{absent['id']}/cancel", {"reason": "Khách vắng mặt", "chargeCustomer": True})
    assert no_show["cancel"]["fee"] == 50000 and no_show["deposit"]["status"] == "KHONG_HOAN"


def test_unpaid_ticket_is_cancelled_after_deadline(client, khach, dpv):
    ticket = create_ticket(khach, "Cần cài phần mềm diệt virus.")
    deadline = khach.ok("get", f"/tickets/{ticket['id']}/deposit")["deadline"]
    assert deadline > ticket["createdAt"]
    with SessionLocal() as db:
        db.execute(update(Ticket).where(Ticket.id == ticket["id"]).values(created_at=utcnow() - timedelta(minutes=31)))
        db.commit()
    dpv.ok("get", "/dispatch/board")
    cancelled = khach.ok("get", f"/tickets/{ticket['id']}")
    assert cancelled["status"] == "DA_HUY" and cancelled["cancel"]["byName"] == "Hệ thống"
    assert cancelled["deposit"]["status"] == "KHONG_PHAT_SINH"


def test_deposit_endpoints_are_guarded(client, khach, dpv, ktv):
    ticket = create_ticket(khach, "Laptop không bắt được wifi.")
    other = Api(client, "binh.tran@demo.vn")
    assert other.get(f"/tickets/{ticket['id']}/deposit").status_code == 403
    assert khach.post(f"/tickets/{ticket['id']}/deposit/confirm").status_code == 403
    assert ktv.get("/deposits").status_code == 403
    receive(dpv, ticket)
    assert dpv.post(f"/tickets/{ticket['id']}/deposit/confirm").status_code == 409
    assert khach.post(f"/tickets/{ticket['id']}/deposit/transfer").status_code == 409
    assert deposit_status(khach, ticket["id"]) == "DA_XAC_NHAN"


def test_warranty_ticket_has_no_deposit(client, khach, dpv):
    warranty = next(w for w in khach.ok("get", "/warranties/mine") if w["valid"])
    body = {"warrantyId": warranty["id"], "description": "Lỗi cũ quay lại", "slotStart": tomorrow_at(10)}
    claim = khach.ok("post", "/warranty-claims", body)
    decided = dpv.ok("post", f"/warranty-claims/{claim['id']}/decision", {"valid": True})
    ticket = dpv.ok("get", f"/tickets/{decided['newTicketId']}")
    assert ticket["deposit"] is None
    assert khach.post(f"/tickets/{ticket['id']}/deposit/transfer").status_code == 409
    assert receive(dpv, ticket)["status"] == "DA_TIEP_NHAN"
