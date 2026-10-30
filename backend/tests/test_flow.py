"""Quy trình nghiệp vụ qua API, đi qua đủ 4 vai trò."""

from datetime import timedelta

from sqlalchemy import select, update

from app.db import SessionLocal
from app.models import Assignment, Part
from app.services.common import utcnow
from tests.conftest import PNG, Api, tomorrow_at


def create_ticket(khach: Api, description: str, hour: int = 15, credentials: str = "") -> dict:
    device_id = khach.ok("get", "/me/devices")[0]["id"]
    ai = khach.ok("post", "/classify", {"description": description})
    return khach.ok(
        "post",
        "/tickets",
        {
            "deviceId": device_id,
            "description": description,
            "photos": [PNG],
            "address": "120 Nguyễn Trãi",
            "ward": "Bến Thành",
            "slotStart": tomorrow_at(hour),
            "categoryCode": ai["categoryCode"],
            "aiResult": ai,
            "deviceCredentials": credentials,
            "acceptTerms": True,
            "acceptPrivacy": True,
        },
    )


def receive_and_assign(dpv: Api, ticket: dict) -> dict:
    received = dpv.ok(
        "post", f"/tickets/{ticket['id']}/receive", {"categoryCode": ticket["categoryCode"], "urgency": "CAO", "version": ticket["version"]}
    )
    suggestions = dpv.ok("get", f"/tickets/{ticket['id']}/technician-suggestions?appointmentAt={received['slotStart'].replace('+', '%2B')}")
    best = next(s for s in suggestions if not s["conflict"])
    return dpv.ok(
        "post",
        f"/tickets/{ticket['id']}/assign",
        {"techId": best["tech"]["id"], "appointmentAt": received["slotStart"], "version": received["version"]},
    )


def login_tech(client, dpv: Api, tech_id: int) -> Api:
    overview = Api(client, "qtv@demo.vn").ok("get", "/admin/overview")
    email = next(t["email"] for t in overview["technicians"] if t["id"] == tech_id)
    return Api(client, email)


def test_full_flow_from_request_to_warranty(client, khach, dpv):
    ticket = create_ticket(khach, "Máy tính không lên nguồn, bấm nút nguồn không có đèn, cần gấp.", credentials="win: 1234")
    assert ticket["status"] == "MOI" and ticket["categoryCode"] == "NGUON"
    assert ticket["photos"][0].startswith("/media/")
    assert client.get(ticket["photos"][0]).status_code == 200

    assigned = receive_and_assign(dpv, ticket)
    assert assigned["status"] == "DA_PHAN_CONG"
    tech = login_tech(client, dpv, assigned["assignment"]["techId"])
    assert assigned["technician"]["name"] == tech.user["name"]

    job = tech.ok("get", f"/tickets/{ticket['id']}")
    assert job["deviceCredentials"] == "win: 1234", "BR-12: KTV phụ trách xem được"
    assert dpv.ok("get", f"/tickets/{ticket['id']}")["deviceCredentials"] == "••••••"

    tech.ok("post", f"/tickets/{ticket['id']}/assignment/response", {"accept": True})
    tech.ok("post", f"/tickets/{ticket['id']}/check-in")
    tech.ok("post", f"/tickets/{ticket['id']}/photos", {"kind": "before", "photos": [PNG]})
    services = khach.ok("get", "/catalog")["services"]
    parts = tech.ok("get", "/parts")
    quoted = tech.ok(
        "post",
        f"/tickets/{ticket['id']}/quotes",
        {
            "items": [
                {"kind": "service", "refId": next(s["id"] for s in services if s["categoryCode"] == "NGUON"), "qty": 1},
                {"kind": "part", "refId": parts[0]["id"], "qty": 1},
            ],
            "note": "Nguồn hỏng",
        },
    )
    assert quoted["status"] == "CHO_DUYET_BAO_GIA"
    quote = quoted["quotes"][-1]
    stock_before = parts[0]["stock"]

    decided = khach.ok(
        "post",
        f"/tickets/{ticket['id']}/quotes/{quote['id']}/decision",
        {"decision": "partial", "itemIds": [quote["items"][0]["id"]]},
    )
    assert decided["status"] == "DANG_THUC_HIEN" and decided["quotes"][-1]["status"] == "DUYET_MOT_PHAN"
    assert tech.ok("get", "/parts")[0]["stock"] == stock_before, "linh kiện bị bỏ thì không trừ kho"

    assert tech.post(f"/tickets/{ticket['id']}/complete").status_code == 409, "BR-11"
    tech.ok("post", f"/tickets/{ticket['id']}/photos", {"kind": "after", "photos": [PNG]})
    tech.ok("post", f"/tickets/{ticket['id']}/complete")

    accepted = khach.ok("post", f"/tickets/{ticket['id']}/acceptance", {"ok": True})
    assert accepted["status"] == "CHO_THANH_TOAN"
    assert accepted["payment"]["amount"] == quote["items"][0]["unitPrice"], "BR-02: chỉ thu hạng mục đã duyệt"

    info = khach.ok("get", f"/tickets/{ticket['id']}/payment")
    assert info["payable"] and info["qrPayload"].startswith("000201")
    khach.ok("post", f"/tickets/{ticket['id']}/payment/transfer")
    assert khach.post(f"/tickets/{ticket['id']}/payment/transfer").status_code == 409

    done = dpv.ok("post", f"/tickets/{ticket['id']}/payment/confirm")
    assert done["status"] == "HOAN_TAT"
    assert khach.ok("get", f"/tickets/{ticket['id']}")["deviceCredentials"] == "", "BR-12: xóa khi kết thúc"

    assert khach.post(f"/tickets/{ticket['id']}/review", {"stars": 2, "comment": ""}).status_code == 400
    reviewed = khach.ok("post", f"/tickets/{ticket['id']}/review", {"stars": 5, "comment": "Tốt"})
    assert reviewed["review"]["stars"] == 5
    assert khach.post(f"/tickets/{ticket['id']}/review", {"stars": 4}).status_code == 409

    warranty = next(w for w in khach.ok("get", "/warranties/mine") if w["ticketId"] == ticket["id"])
    claim = khach.ok(
        "post", "/warranty-claims", {"warrantyId": warranty["id"], "description": "Máy lại không lên nguồn", "slotStart": tomorrow_at(10)}
    )
    decided_claim = dpv.ok("post", f"/warranty-claims/{claim['id']}/decision", {"valid": True})
    assert decided_claim["status"] == "HOP_LE"
    warranty_ticket = dpv.ok("get", f"/tickets/{decided_claim['newTicketId']}")
    assert warranty_ticket["isWarranty"] and warranty_ticket["warrantyOf"] == ticket["id"]

    notifications = khach.ok("get", "/notifications")
    assert any(n["ticketId"] == ticket["id"] for n in notifications)


def test_reject_quote_pays_survey_fee_in_cash_br02_br08(client, khach, dpv):
    ticket = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    quote = ticket["quotes"][-1]
    assert khach.post(f"/tickets/{ticket['id']}/quotes/{quote['id']}/decision", {"decision": "reject"}).status_code == 400
    rejected = khach.ok("post", f"/tickets/{ticket['id']}/quotes/{quote['id']}/decision", {"decision": "reject", "reason": "Đắt"})
    assert rejected["status"] == "CHO_THANH_TOAN" and rejected["payment"]["amount"] == 50000

    khach.ok("post", f"/tickets/{ticket['id']}/payment/cash")
    tech = Api(client, "ktv@demo.vn")
    done = tech.ok("post", f"/tickets/{ticket['id']}/payment/cash-received")
    assert done["status"] == "HOAN_TAT" and done["payment"]["status"] == "DA_THU"
    reconciled = dpv.ok("post", f"/tickets/{ticket['id']}/payment/reconcile")
    assert reconciled["payment"]["status"] == "DA_DOI_SOAT"


def test_onsite_confirmation_code(client, khach, ktv):
    ticket = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    sent = ktv.ok("post", f"/tickets/{ticket['id']}/onsite-code")
    assert sent["sentTo"] == "0909000001"
    message = khach.ok("get", "/notifications")[0]["body"]
    code = next(word for word in message.split() if word.isdigit() and len(word) == 6)
    assert ktv.post(f"/tickets/{ticket['id']}/onsite-code/confirm", {"code": "000000"}).status_code == 400
    confirmed = ktv.ok("post", f"/tickets/{ticket['id']}/onsite-code/confirm", {"code": code})
    assert confirmed["status"] == "DANG_THUC_HIEN" and confirmed["quotes"][-1]["status"] == "DA_DUYET"
    with SessionLocal() as db:
        assert db.scalar(select(Part.stock).where(Part.name == "Bộ nguồn PC 450W")) == 3


def test_overdue_assignment_is_revoked_br06(client, dpv):
    with SessionLocal() as db:
        db.execute(update(Assignment).where(Assignment.result.is_(None)).values(deadline=utcnow() - timedelta(minutes=1)))
        db.commit()
    board = dpv.ok("get", "/dispatch/board")
    revoked = [t for t in board if t["assignment"] and t["assignment"]["result"] == "QUA_HAN"]
    assert revoked and all(t["status"] == "DA_TIEP_NHAN" for t in revoked)


def test_stale_version_is_rejected_uc08(client, khach, dpv):
    ticket = create_ticket(khach, "Laptop bị virus quảng cáo bật liên tục.")
    dpv.ok("post", f"/tickets/{ticket['id']}/receive", {"categoryCode": "VIRUS", "version": ticket["version"]})
    stale = dpv.post(f"/tickets/{ticket['id']}/assign", {"techId": 1, "appointmentAt": ticket["slotStart"], "version": ticket["version"]})
    assert stale.status_code == 409


def test_double_booking_is_rejected_br04(client, khach, dpv):
    first = receive_and_assign(dpv, create_ticket(khach, "Cài lại Windows 11 cho laptop.", hour=10))
    second = create_ticket(khach, "Cài phần mềm Office cho máy.", hour=10)
    received = dpv.ok("post", f"/tickets/{second['id']}/receive", {"categoryCode": "PHAN_MEM", "version": second["version"]})
    response = dpv.post(
        f"/tickets/{second['id']}/assign",
        {"techId": first["assignment"]["techId"], "appointmentAt": first["assignment"]["appointmentAt"], "version": received["version"]},
    )
    assert response.status_code == 409


def test_cancel_rules_br03(client, khach):
    ticket = create_ticket(khach, "Cần cài phần mềm kế toán MISA.")
    assert khach.post(f"/tickets/{ticket['id']}/cancel", {"reason": ""}).status_code == 400
    cancelled = khach.ok("post", f"/tickets/{ticket['id']}/cancel", {"reason": "Đổi ý"})
    assert cancelled["status"] == "DA_HUY" and cancelled["cancel"]["fee"] == 0
    in_progress = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    assert khach.post(f"/tickets/{in_progress['id']}/cancel", {"reason": "x"}).status_code == 409


def test_reschedule_keeps_free_technician(client, khach, dpv):
    assigned = receive_and_assign(dpv, create_ticket(khach, "Mạng wifi chập chờn trong phòng.", hour=9))
    moved = khach.ok("post", f"/tickets/{assigned['id']}/reschedule", {"slotStart": tomorrow_at(18)})
    assert moved["assignment"]["techId"] == assigned["assignment"]["techId"]
    assert moved["assignment"]["appointmentAt"] == moved["slotStart"]


def test_ticket_validation(client, khach):
    device_id = khach.ok("get", "/me/devices")[0]["id"]
    base = {
        "deviceId": device_id,
        "description": "Máy chạy chậm và nóng",
        "address": "1 Lê Lợi",
        "ward": "Bến Thành",
        "slotStart": tomorrow_at(14),
        "acceptTerms": True,
        "acceptPrivacy": True,
    }
    assert khach.post("/tickets", {**base, "ward": "Thủ Đức"}).status_code == 400
    assert khach.post("/tickets", {**base, "slotStart": tomorrow_at(22)}).status_code == 400
    assert khach.post("/tickets", {**base, "acceptPrivacy": False}).status_code == 400
    assert khach.post("/tickets", {**base, "photos": ["data:image/png;base64,aGVsbG8="]}).status_code == 400
    assert khach.post("/tickets", base).status_code == 201
