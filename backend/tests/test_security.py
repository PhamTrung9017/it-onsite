"""GĐ5-02: truy cập trái quyền trên toàn bộ endpoint, các lỗi phổ biến trong OWASP Top 10 (NFR-05, NFR-06, NFR-09)."""

import pytest
from pydantic import ValidationError

from app.core.config import DEV_SECRET, Settings
from app.main import app
from tests.conftest import PNG, tomorrow_at

PUBLIC = {
    ("post", "/api/v1/auth/register"),
    ("post", "/api/v1/auth/login"),
    ("post", "/api/v1/auth/refresh"),
    ("post", "/api/v1/auth/logout"),
    ("post", "/api/v1/auth/forgot-password"),
    ("post", "/api/v1/auth/reset-password"),
    ("get", "/api/v1/catalog"),
    ("get", "/api/v1/health"),
}
SECRET_KEYS = {
    "password",
    "passwordHash",
    "password_hash",
    "tokenHash",
    "token_hash",
    "telegramLinkCode",
    "telegramChatId",
    "onsiteCodeHash",
}
ROLES = ("khach", "ktv", "dpv", "qtv")


def endpoints() -> list[tuple[str, str]]:
    return [(method, path) for path, ops in app.openapi()["paths"].items() for method in ops]


def fill(path: str, ticket_id: str) -> str:
    values = {"ticket_id": ticket_id, "quote_id": "1", "device_id": "1", "claim_id": "1", "user_id": "1", "kind": "before", "index": "0"}
    for key, value in values.items():
        path = path.replace("{" + key + "}", value)
    return path


def test_every_endpoint_except_public_requires_login_nfr05(client, khach):
    ticket_id = khach.ok("get", "/tickets/mine")[0]["id"]
    checked = 0
    for method, path in endpoints():
        if (method, path) in PUBLIC:
            continue
        response = client.request(method.upper(), fill(path, ticket_id), json={} if method != "get" else None)
        assert response.status_code == 401, f"{method.upper()} {path}: {response.status_code}"
        checked += 1
    assert checked >= 60


def role_matrix(ticket_id: str, overview: dict) -> list[tuple[str, str, dict | None, set[str]]]:
    """(phương thức, đường dẫn, dữ liệu gửi, vai trò được phép); vai trò khác phải nhận 403."""
    at = tomorrow_at(10)
    t = f"/tickets/{ticket_id}"
    service, part, tech = overview["services"][0], overview["parts"][0], overview["technicians"][0]
    ticket_body = {
        "deviceId": 1, "description": "Máy chạy chậm và nóng", "address": "1 Lê Lợi", "ward": "Bến Thành",
        "slotStart": at, "acceptTerms": True, "acceptPrivacy": True,
    }  # fmt: skip
    return [
        ("post", "/tickets", ticket_body, {"khach"}),
        ("post", f"{t}/quotes/1/decision", {"decision": "approve"}, {"khach"}),
        ("post", f"{t}/acceptance", {"ok": True}, {"khach"}),
        ("get", f"{t}/deposit", None, {"khach"}),
        ("post", f"{t}/deposit/transfer", {}, {"khach"}),
        ("post", f"{t}/payment/transfer", {}, {"khach"}),
        ("post", f"{t}/payment/cash", {}, {"khach"}),
        ("post", f"{t}/review", {"stars": 5}, {"khach"}),
        ("post", "/warranty-claims", {"warrantyId": 1, "description": "Lỗi cũ lặp lại", "slotStart": at}, {"khach"}),
        ("get", "/tech/jobs", None, {"ktv"}),
        ("get", "/tech/profile", None, {"ktv"}),
        ("post", f"{t}/assignment/response", {"accept": True}, {"ktv"}),
        ("post", f"{t}/check-in", {}, {"ktv"}),
        ("post", f"{t}/quotes", {"items": [{"kind": "service", "refId": service["id"], "qty": 1}]}, {"ktv"}),
        ("post", f"{t}/onsite-code", {}, {"ktv"}),
        ("post", f"{t}/onsite-code/confirm", {"code": "000000"}, {"ktv"}),
        ("put", f"{t}/checklist", {"checklist": []}, {"ktv"}),
        ("post", f"{t}/photos", {"kind": "before", "photos": [PNG]}, {"ktv"}),
        ("delete", f"{t}/photos/before/0", None, {"ktv"}),
        ("post", f"{t}/complete", {}, {"ktv"}),
        ("post", f"{t}/payment/cash-received", {}, {"ktv"}),
        ("get", "/parts", None, {"ktv", "qtv"}),
        ("get", "/dispatch/board", None, {"dpv", "qtv"}),
        ("get", "/payments", None, {"dpv", "qtv"}),
        ("get", "/deposits", None, {"dpv", "qtv"}),
        ("get", "/warranty-claims", None, {"dpv", "qtv"}),
        ("post", f"{t}/receive", {"categoryCode": "KHAC"}, {"dpv", "qtv"}),
        ("get", f"{t}/technician-suggestions?appointmentAt={at.replace('+', '%2B')}", None, {"dpv", "qtv"}),
        ("post", f"{t}/assign", {"techId": tech["id"], "appointmentAt": at}, {"dpv", "qtv"}),
        ("post", f"{t}/deposit/confirm", {}, {"dpv", "qtv"}),
        ("post", f"{t}/deposit/refund", {}, {"dpv", "qtv"}),
        ("post", f"{t}/payment/confirm", {}, {"dpv", "qtv"}),
        ("post", f"{t}/payment/reconcile", {}, {"dpv", "qtv"}),
        ("post", "/warranty-claims/1/decision", {"valid": False, "reason": "x"}, {"dpv", "qtv"}),
        ("get", "/admin/overview", None, {"qtv"}),
        ("put", "/admin/services", service, {"qtv"}),
        ("put", "/admin/parts", part, {"qtv"}),
        ("put", "/admin/technicians", tech, {"qtv"}),
        ("put", "/admin/users/1/roles", {"roles": ["KHACH"]}, {"qtv"}),
        ("post", "/admin/users", {"name": "Thử", "email": "thu@demo.vn", "roles": ["DPV"]}, {"qtv"}),
        ("put", "/admin/config", overview["config"], {"qtv"}),
        ("get", "/admin/reports?days=30", None, {"qtv"}),
        ("get", "/admin/reports/export?days=30", None, {"qtv"}),
    ]


def test_role_based_access_on_every_role_endpoint_nfr05(request, khach, qtv):
    ticket_id = khach.ok("get", "/tickets/mine")[0]["id"]
    apis = {role: request.getfixturevalue(role) for role in ROLES}
    matrix = role_matrix(ticket_id, qtv.ok("get", "/admin/overview"))
    covered = {(m, p.split("?")[0]) for m, p, _, _ in matrix}
    assert len(covered) == len(matrix) >= 40
    for method, path, body, allowed in matrix:
        for role in set(ROLES) - allowed:
            api = apis[role]
            response = getattr(api, method)(path, body) if body is not None else getattr(api, method)(path)
            assert response.status_code == 403, f"{role} {method.upper()} {path}: {response.status_code} {response.text}"


def test_customer_and_technician_only_see_their_own_tickets(client, khach, ktv):
    from tests.conftest import Api

    other = Api(client, "binh.tran@demo.vn")
    for ticket in other.ok("get", "/tickets/mine"):
        assert khach.get(f"/tickets/{ticket['id']}").status_code == 403
        assert khach.get(f"/tickets/{ticket['id']}/payment").status_code == 403
    mine = {t["id"] for t in ktv.ok("get", "/tech/jobs")}
    foreign = next(t["id"] for t in khach.ok("get", "/tickets/mine") if t["id"] not in mine)
    assert ktv.get(f"/tickets/{foreign}").status_code == 403


@pytest.mark.parametrize(
    "identifier",
    ["' OR '1'='1' --", "khach@demo.vn' --", '" OR ""="', "khach@demo.vn'; DROP TABLE users; --"],
)
def test_sql_injection_in_login_is_rejected_nfr09(client, identifier):
    response = client.post("/api/v1/auth/login", json={"identifier": identifier, "password": "' OR '1'='1"})
    assert response.status_code == 401
    assert client.post("/api/v1/auth/login", json={"identifier": "khach@demo.vn", "password": "123456"}).status_code == 200


def test_sql_injection_in_filters_and_paths_nfr09(qtv, dpv):
    report = qtv.ok("get", "/admin/reports/export?days=30&ward=B%E1%BA%BFn%20Th%C3%A0nh'%20OR%20'1'='1")
    assert report["tickets"] == []
    assert qtv.get("/admin/reports?days=30&category=' OR 1=1 --").status_code == 200
    assert dpv.get("/tickets/YC-1' OR '1'='1").status_code == 404
    assert qtv.get("/admin/reports?days=30 OR 1=1").status_code == 422


def test_html_is_stored_as_plain_text_nfr09(khach):
    payload = "<script>alert('xss')</script><img src=x onerror=alert(1)> Máy không lên nguồn"
    from tests.test_flow import create_ticket

    ticket = create_ticket(khach, payload)
    stored = khach.ok("get", f"/tickets/{ticket['id']}")
    assert stored["description"] == payload, "lưu nguyên văn, giao diện React hiển thị dạng chữ"
    response = khach.get(f"/tickets/{ticket['id']}")
    assert response.headers["content-type"].startswith("application/json")


def test_uploads_only_accept_real_images_nfr09(khach):
    svg = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+"
    fake_png = "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="
    device_id = khach.ok("get", "/me/devices")[0]["id"]
    body = {
        "deviceId": device_id, "description": "Máy chạy chậm và nóng", "address": "1 Lê Lợi", "ward": "Bến Thành",
        "slotStart": tomorrow_at(15), "acceptTerms": True, "acceptPrivacy": True,
    }  # fmt: skip
    for photo in (svg, fake_png):
        assert khach.post("/tickets", {**body, "photos": [photo]}).status_code == 400
    assert khach.post("/tickets", {**body, "photos": [PNG]}).status_code == 201


def collect_keys(value, found: set[str]) -> set[str]:
    if isinstance(value, dict):
        for key, item in value.items():
            found.add(key)
            collect_keys(item, found)
    elif isinstance(value, list):
        for item in value:
            collect_keys(item, found)
    return found


def test_no_secrets_exposed_through_api_nfr09(khach, ktv, dpv, qtv):
    responses = [
        khach.ok("get", "/auth/me"),
        khach.ok("get", "/tickets/mine"),
        khach.ok("get", "/me/export"),
        ktv.ok("get", "/tech/jobs"),
        ktv.ok("get", "/tech/profile"),
        dpv.ok("get", "/dispatch/board"),
        dpv.ok("get", "/payments"),
        qtv.ok("get", "/admin/overview"),
        qtv.ok("get", "/admin/reports/export?days=30"),
    ]
    keys = collect_keys(responses, set())
    assert not keys & SECRET_KEYS
    assert all(t["deviceCredentials"] in ("", "••••••") for t in dpv.ok("get", "/dispatch/board"))


def test_security_headers_on_api_and_media(client, khach):
    response = khach.get("/auth/me")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    photo = khach.ok("get", "/tickets/mine")[0]["photos"]
    if photo:
        assert client.get(photo[0]).headers["x-content-type-options"] == "nosniff"


def test_production_refuses_default_or_short_secrets():
    strong = "x" * 48
    with pytest.raises(ValidationError):
        Settings(app_env="production", jwt_secret=DEV_SECRET, credential_key=strong)
    with pytest.raises(ValidationError):
        Settings(app_env="production", jwt_secret=strong, credential_key="ngan")
    assert Settings(app_env="production", jwt_secret=strong, credential_key=strong).app_env == "production"
