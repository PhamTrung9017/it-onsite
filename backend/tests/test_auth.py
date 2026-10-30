import re

from sqlalchemy import select

from app.db import SessionLocal
from app.models import OutboxMessage
from tests.conftest import Api


def test_register_login_refresh_logout(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Phạm Minh", "email": "minh@example.com", "phone": "0912345678", "password": "matkhau123", "consent": True},
    )
    assert response.status_code == 201, response.text
    tokens = response.json()
    assert tokens["user"]["roles"] == ["KHACH"]

    refreshed = client.post("/api/auth/refresh", json={"refreshToken": tokens["refreshToken"]})
    assert refreshed.status_code == 200
    reused = client.post("/api/auth/refresh", json={"refreshToken": tokens["refreshToken"]})
    assert reused.status_code == 401, "refresh token chỉ dùng một lần"

    new_refresh = refreshed.json()["refreshToken"]
    assert client.post("/api/auth/logout", json={"refreshToken": new_refresh}).status_code == 204
    assert client.post("/api/auth/refresh", json={"refreshToken": new_refresh}).status_code == 401


def test_register_requires_consent_and_unique_email(client):
    body = {"name": "A", "email": "khach@demo.vn", "phone": "0912345678", "password": "matkhau123", "consent": True}
    assert client.post("/api/auth/register", json={**body, "consent": False}).status_code == 400
    assert client.post("/api/auth/register", json=body).status_code == 409


def test_wrong_password_locks_account_temporarily_nfr06(client):
    for _ in range(5):
        response = client.post("/api/auth/login", json={"identifier": "khach@demo.vn", "password": "sai"})
        assert response.status_code == 401
    locked = client.post("/api/auth/login", json={"identifier": "khach@demo.vn", "password": "123456"})
    assert locked.status_code == 429


def test_login_by_phone(client):
    assert Api(client, "0909000001").user["email"] == "khach@demo.vn"


def test_role_based_access_nfr05(client, khach):
    assert client.get("/api/dispatch/board").status_code == 401
    assert khach.get("/dispatch/board").status_code == 403
    assert khach.get("/admin/overview").status_code == 403
    assert client.get("/api/tickets/mine", headers={"Authorization": "Bearer khong-hop-le"}).status_code == 401


def test_customer_cannot_view_other_customer_ticket(client, khach):
    other = Api(client, "binh.tran@demo.vn")
    ticket_id = other.ok("get", "/tickets/mine")[0]["id"]
    assert khach.get(f"/tickets/{ticket_id}").status_code == 403


def test_password_reset_flow(client):
    assert client.post("/api/auth/forgot-password", json={"email": "khach@demo.vn"}).json() == {"ok": True}
    assert client.post("/api/auth/forgot-password", json={"email": "khong-ton-tai@demo.vn"}).json() == {"ok": True}
    with SessionLocal() as db:
        message = db.scalars(select(OutboxMessage).where(OutboxMessage.recipient == "khach@demo.vn")).one()
    token = re.search(r"token=(\S+)", message.body).group(1)
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "ngan"}).status_code == 400
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "matkhaumoi1"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "matkhaumoi2"}).status_code == 400
    assert Api(client, "khach@demo.vn", "matkhaumoi1").user["email"] == "khach@demo.vn"


def test_change_password(client, khach):
    assert khach.post("/auth/change-password", {"current": "sai", "next": "matkhaumoi1"}).status_code == 400
    assert khach.post("/auth/change-password", {"current": "123456", "next": "matkhaumoi1"}).status_code == 200
    Api(client, "khach@demo.vn", "matkhaumoi1")
