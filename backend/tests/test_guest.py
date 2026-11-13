"""Khách đặt lịch không cần tài khoản, tra cứu và thao tác trên đơn bằng mã đơn + số điện thoại."""

import pytest
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import OutboxMessage, User
from app.services import guest
from tests.conftest import PNG, Api, tomorrow_at

GUEST_PHONE = "0938111222"


class Session(Api):
    """Gọi API bằng phiên tra cứu (access token chỉ dùng cho một đơn)."""

    def __init__(self, client, data: dict):
        self.client, self.tokens, self.user = client, data, data["user"]


@pytest.fixture(autouse=True)
def fresh_throttle():
    guest._hits.clear()
    yield
    guest._hits.clear()


def booking(**extra) -> dict:
    return {
        "name": "Lê Văn Khách",
        "phone": GUEST_PHONE,
        "email": "",
        "deviceType": "Laptop",
        "deviceBrand": "Asus",
        "deviceModel": "Vivobook 15",
        "description": "Laptop bật không lên Windows, báo lỗi màn hình xanh liên tục",
        "photos": [PNG],
        "address": "18 Lê Lợi",
        "ward": "Bến Thành",
        "slotStart": tomorrow_at(10),
        "acceptTerms": True,
        "acceptPrivacy": True,
        **extra,
    }


def book(client, **extra) -> tuple[dict, Session]:
    response = client.post("/api/v1/guest/tickets", json=booking(**extra))
    assert response.status_code == 201, response.text
    data = response.json()
    return data["ticket"], Session(client, data)


def lookup(client, ticket_id: str, phone: str):
    return client.post("/api/v1/guest/lookup", json={"ticketId": ticket_id, "phone": phone})


def users_with_phone(phone: str) -> list[User]:
    with SessionLocal() as db:
        return list(db.scalars(select(User).where(User.phone == phone)))


def test_guest_books_without_account(client):
    ai = client.post("/api/v1/guest/classify", json={"description": "Máy tính bị màn hình xanh, không vào được Windows"})
    assert ai.status_code == 200 and ai.json()["categoryCode"]

    ticket, me = book(client, email="khach.nhanh@example.com")
    assert ticket["status"] == "MOI" and ticket["deposit"]["status"] == "CHO_THANH_TOAN"
    assert me.user["isGuest"] is True and me.user["guestTicket"] == ticket["id"]
    [user] = users_with_phone(GUEST_PHONE)
    assert user.is_guest and user.password_hash == ""
    with SessionLocal() as db:
        mail = db.scalar(select(OutboxMessage).where(OutboxMessage.subject == f"[IT OnSite] Mã đơn {ticket['id']}"))
    assert mail.recipient == "khach.nhanh@example.com" and "/tra-cuu" in mail.body

    assert me.ok("get", f"/tickets/{ticket['id']}")["id"] == ticket["id"]
    assert me.ok("post", f"/tickets/{ticket['id']}/deposit/transfer")["deposit"]["status"] == "CHO_XAC_NHAN"
    assert me.ok("get", "/auth/me")["guestTicket"] == ticket["id"]
    assert all(n["ticketId"] == ticket["id"] for n in me.ok("get", "/notifications"))

    second, _ = book(client, description="Máy in không nhận lệnh in từ laptop, báo offline")
    assert len(users_with_phone(GUEST_PHONE)) == 1, "cùng số điện thoại thì dùng lại hồ sơ khách"
    for path in ("/tickets/mine", f"/tickets/{second['id']}", "/me/devices", "/admin/overview", "/classify"):
        response = me.get(path) if path != "/classify" else me.post(path, {"description": "Máy chạy chậm quá trời luôn"})
        assert response.status_code == 403, path


def test_lookup_by_ticket_code_and_phone(client):
    ticket, _ = book(client)
    assert lookup(client, ticket["id"], "0900000000").status_code == 404
    assert lookup(client, "YC-20990101-999", GUEST_PHONE).status_code == 404
    found = lookup(client, ticket["id"].lower(), "0938 111 222")
    assert found.status_code == 200
    me = Session(client, found.json())
    assert found.json()["ticketId"] == ticket["id"]
    assert me.ok("get", f"/tickets/{ticket['id']}/deposit")["amount"] > 0

    for _ in range(guest.LOOKUP_LIMIT - 3):
        lookup(client, ticket["id"], "0900000000")
    assert lookup(client, ticket["id"], GUEST_PHONE).status_code == 429, "chặn dò mã đơn"


def test_guest_cannot_login_and_registers_with_same_phone(client):
    ticket, _ = book(client)
    assert client.post("/api/v1/auth/login", json={"identifier": GUEST_PHONE, "password": ""}).status_code in (401, 422)

    registered = client.post(
        "/api/v1/auth/register",
        json={"name": "Lê Văn Khách", "phone": GUEST_PHONE, "email": "le.khach@example.com", "password": "matkhau123", "consent": True},
    )
    assert registered.status_code == 201, registered.text
    [user] = users_with_phone(GUEST_PHONE)
    assert not user.is_guest and user.email == "le.khach@example.com"
    account = Api(client, GUEST_PHONE, "matkhau123")
    assert [t["id"] for t in account.ok("get", "/tickets/mine")] == [ticket["id"]]
    assert account.ok("get", "/auth/me")["isGuest"] is False

    taken = client.post(
        "/api/v1/auth/register",
        json={"name": "Người khác", "phone": GUEST_PHONE, "password": "matkhau123", "consent": True},
    )
    assert taken.status_code == 409, "đã thành tài khoản thì không đăng ký lại được"


def test_booking_with_phone_of_existing_account_joins_that_account(client, khach):
    phone = khach.user["phone"]
    before = len(khach.ok("get", "/tickets/mine?limit=100"))
    ticket, me = book(client, phone=phone, name="Tên nhập khác", email=khach.user["email"])
    assert len(users_with_phone(phone)) == 1
    assert me.user["isGuest"] is False and me.user["name"] == khach.user["name"], "không sửa thông tin tài khoản đã đăng ký"
    mine = khach.ok("get", "/tickets/mine?limit=100")
    assert len(mine) == before + 1 and ticket["id"] in [t["id"] for t in mine]
    assert me.get("/tickets/mine").status_code == 403, "phiên tra cứu không xem được các đơn khác của tài khoản"


def test_guest_booking_validation(client, dpv):
    assert client.post("/api/v1/guest/tickets", json=booking(name=" ")).status_code == 400
    assert client.post("/api/v1/guest/tickets", json=booking(phone="12345")).status_code == 400
    assert client.post("/api/v1/guest/tickets", json=booking(deviceType="Tivi")).status_code == 400
    assert client.post("/api/v1/guest/tickets", json=booking(acceptTerms=False)).status_code == 400
    assert client.post("/api/v1/guest/tickets", json=booking(phone=dpv.user["phone"])).status_code == 409, "số của nhân viên"
    assert client.post("/api/v1/guest/tickets", json=booking(email="dpv@demo.vn")).status_code == 409, "email của tài khoản khác"
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.phone == GUEST_PHONE)) == 0, "lỗi thì không tạo hồ sơ"


def test_guest_session_for_quote_and_warranty(client, dpv):
    """Phiên tra cứu làm được các bước của khách trên đơn: báo giá, nghiệm thu, thanh toán, bảo hành."""
    from tests.test_flow import login_tech, receive

    ticket, me = book(client)
    received = receive(dpv, ticket, "MAY_CHAM")
    at = received["slotStart"].replace("+", "%2B")
    suggestions = dpv.ok("get", f"/tickets/{ticket['id']}/technician-suggestions?appointmentAt={at}")
    best = next(s for s in suggestions if not s["conflict"] and not s["offDuty"])
    tech = login_tech(client, dpv, best["tech"]["id"])
    assignment = {"techId": best["tech"]["id"], "appointmentAt": received["slotStart"], "version": received["version"]}
    dpv.ok("post", f"/tickets/{ticket['id']}/assign", assignment)
    tech.ok("post", f"/tickets/{ticket['id']}/assignment/response", {"accept": True})
    tech.ok("post", f"/tickets/{ticket['id']}/check-in")
    tech.ok("post", f"/tickets/{ticket['id']}/photos", {"kind": "before", "photos": [PNG]})
    service = next(s for s in client.get("/api/v1/catalog").json()["services"] if s["categoryCode"] == "MAY_CHAM")
    quoted = tech.ok("post", f"/tickets/{ticket['id']}/quotes", {"items": [{"kind": "service", "refId": service["id"], "qty": 1}]})
    quote_id = quoted["quotes"][-1]["id"]

    assert me.ok("post", f"/tickets/{ticket['id']}/quotes/{quote_id}/decision", {"decision": "approve"})["status"] == "DANG_THUC_HIEN"
    tech.ok("post", f"/tickets/{ticket['id']}/photos", {"kind": "after", "photos": [PNG]})
    tech.ok("post", f"/tickets/{ticket['id']}/complete")
    assert me.ok("post", f"/tickets/{ticket['id']}/acceptance", {"ok": True})["status"] == "CHO_THANH_TOAN"
    me.ok("post", f"/tickets/{ticket['id']}/payment/transfer")
    dpv.ok("post", f"/tickets/{ticket['id']}/payment/confirm")
    assert me.ok("post", f"/tickets/{ticket['id']}/review", {"stars": 5, "comment": "Nhanh gọn"})["status"] == "HOAN_TAT"

    warranties = me.ok("get", "/warranties/mine")
    assert warranties and all(w["ticketId"] == ticket["id"] for w in warranties)
    request = {"warrantyId": warranties[0]["id"], "description": "Máy lại chậm như cũ sau hai ngày", "slotStart": tomorrow_at(16)}
    claim = me.post("/warranty-claims", request)
    assert claim.status_code < 300, claim.text
