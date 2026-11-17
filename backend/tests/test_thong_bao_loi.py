"""Lỗi dữ liệu gửi lên phải báo bằng tiếng Việt, đúng tên ô người dùng thấy."""


def test_too_long_and_missing_fields_are_in_vietnamese(client, qtv):
    r = qtv.post("/admin/users", {"name": "A" * 200, "email": "x@gmail.com", "roles": ["DPV"]})
    assert r.status_code == 422
    assert r.json()["detail"] == "Dữ liệu chưa hợp lệ: Họ tên dài quá 120 ký tự."

    r = client.post("/api/v1/guest/lookup", json={"phone": "0909000001"})
    assert r.status_code == 422
    assert r.json()["detail"] == "Dữ liệu chưa hợp lệ: thiếu mã đơn."
