"""UC02: hồ sơ, thiết bị, dữ liệu cá nhân (NFR-10) và thông báo (UC17)."""

from tests.conftest import Api, tomorrow_at


def test_profile_update_rules(client, khach):
    assert khach.client.patch("/api/me", json={"phone": "0909000002"}, headers=khach.headers).status_code == 409
    assert khach.client.patch("/api/me", json={"ward": "Thủ Đức"}, headers=khach.headers).status_code == 400
    response = khach.client.patch(
        "/api/me", json={"name": "Nguyễn Văn Anh B", "address": "5 Lê Lợi", "ward": "Sài Gòn"}, headers=khach.headers
    )
    assert response.status_code == 200 and response.json()["ward"] == "Sài Gòn"


def test_devices(client, khach):
    assert khach.post("/me/devices", {"type": "Máy giặt", "brand": "A", "model": "B"}).status_code == 400
    added = khach.ok("post", "/me/devices", {"type": "Laptop", "brand": "Acer", "model": "Aspire 7", "note": "Máy của con"})
    assert added["note"] == "Máy của con"
    assert any(d["id"] == added["id"] for d in khach.ok("get", "/me/devices"))
    assert khach.delete(f"/me/devices/{added['id']}").status_code == 204
    assert all(d["id"] != added["id"] for d in khach.ok("get", "/me/devices"))
    busy = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    assert khach.delete(f"/me/devices/{busy['deviceId']}").status_code == 409
    assert khach.delete("/me/devices/999999").status_code == 404


def test_export_and_deletion_request_nfr10(client, khach, qtv):
    data = khach.ok("get", "/me/export")
    assert data["profile"]["email"] == "khach@demo.vn" and data["tickets"] and data["devices"]
    assert khach.post("/me/deletion-request", {"reason": "Không dùng nữa"}).status_code == 409

    newcomer = client.post(
        "/api/auth/register",
        json={"name": "Khách mới", "email": "moi@demo.vn", "phone": "0911111111", "password": "matkhau123", "consent": True},
    ).json()
    headers = {"Authorization": f"Bearer {newcomer['accessToken']}"}
    assert client.post("/api/me/deletion-request", json={"reason": "Thử"}, headers=headers).status_code == 200
    titles = [n["title"] for n in qtv.ok("get", "/notifications")]
    assert "Yêu cầu xóa dữ liệu cá nhân" in titles


def test_mark_selected_notifications_read(client):
    ktv = Api(client, "ktv@demo.vn")
    items = ktv.ok("get", "/notifications")
    unread = [n["id"] for n in items if not n["read"]]
    assert unread
    assert ktv.post("/notifications/read", {"ids": unread[:1]}).status_code == 204
    after = {n["id"]: n["read"] for n in ktv.ok("get", "/notifications")}
    assert after[unread[0]] is True


def test_media_rejects_non_images(client, khach):
    device_id = khach.ok("get", "/me/devices")[0]["id"]
    body = {
        "deviceId": device_id,
        "description": "Máy chạy chậm và nóng",
        "address": "1 Lê Lợi",
        "ward": "Bến Thành",
        "slotStart": tomorrow_at(14),
        "acceptTerms": True,
        "acceptPrivacy": True,
    }
    assert khach.post("/tickets", {**body, "photos": ["data:text/plain;base64,aGVsbG8="]}).status_code == 400
    assert khach.post("/tickets", {**body, "photos": ["data:image/png;base64,***"]}).status_code == 400
