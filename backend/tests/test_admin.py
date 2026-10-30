from sqlalchemy import select

from app.db import SessionLocal
from app.models import OutboxMessage


def test_overview_and_reports(qtv):
    overview = qtv.ok("get", "/admin/overview")
    assert {"technicians", "services", "parts", "categories", "users", "config", "allAreas", "audit"} <= overview.keys()
    report = qtv.ok("get", "/admin/reports?days=30")
    assert report["done"] > 0 and len(report["byDay"]) == 30
    assert sum(s["count"] for s in report["byStatus"]) == report["total"]
    assert qtv.get("/admin/reports?days=5").status_code == 400


def test_price_change_does_not_affect_existing_quote_br13(qtv, khach):
    service = next(s for s in qtv.ok("get", "/admin/overview")["services"] if s["categoryCode"] == "NGUON")
    ticket = next(t for t in khach.ok("get", "/tickets/mine") if t["status"] == "CHO_DUYET_BAO_GIA")
    before = [i["unitPrice"] for i in ticket["quotes"][-1]["items"]]
    qtv.ok("put", "/admin/services", {**service, "price": service["price"] + 100000})
    after = [i["unitPrice"] for i in khach.ok("get", f"/tickets/{ticket['id']}")["quotes"][-1]["items"]]
    assert before == after
    assert any(a["action"] == "SUA_BANG_GIA" for a in qtv.ok("get", "/admin/overview")["audit"]), "NFR-08"


def test_config_validation(qtv):
    config = qtv.ok("get", "/admin/overview")["config"]
    assert qtv.put("/admin/config", {**config, "surveyFee": -1}).status_code == 400
    assert qtv.put("/admin/config", {**config, "serviceHours": {"start": "20:00", "end": "08:00"}}).status_code == 400
    assert qtv.put("/admin/config", {**config, "bank": {**config["bank"], "bin": "12"}}).status_code == 400
    saved = qtv.ok("put", "/admin/config", {**config, "surveyFee": 60000})
    assert saved["surveyFee"] == 60000


def test_create_internal_user_sends_setup_link(qtv):
    created = qtv.ok("post", "/admin/users", {"name": "Điều phối mới", "email": "dp2@demo.vn", "phone": "0912000000", "roles": ["DPV"]})
    assert created["roles"] == ["DPV"]
    with SessionLocal() as db:
        assert db.scalar(select(OutboxMessage).where(OutboxMessage.recipient == "dp2@demo.vn")) is not None
    assert qtv.post("/admin/users", {"name": "Trùng", "email": "dp2@demo.vn", "roles": ["DPV"]}).status_code == 409


def test_admin_cannot_remove_own_admin_role(qtv):
    me = qtv.user
    assert qtv.put(f"/admin/users/{me['id']}/roles", {"roles": ["DPV"], "locked": False}).status_code == 409


def test_technician_management(qtv):
    created = qtv.ok(
        "put",
        "/admin/technicians",
        {"name": "KTV mới", "email": "ktvmoi@demo.vn", "phone": "0913000000", "skills": ["MANG"], "areas": ["Bàn Cờ"]},
    )
    assert created["skills"] == ["MANG"] and created["active"]
    updated = qtv.ok("put", "/admin/technicians", {**created, "active": False})
    assert not updated["active"]
    assert qtv.put("/admin/technicians", {**created, "skills": []}).status_code == 400
