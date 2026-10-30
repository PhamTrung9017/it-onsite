from sqlalchemy import select

from app.db import SessionLocal
from app.models import OutboxMessage
from tests.conftest import tomorrow_at
from tests.test_flow import create_ticket


def test_overview_and_reports(qtv):
    overview = qtv.ok("get", "/admin/overview")
    assert {"technicians", "services", "parts", "categories", "users", "config", "allAreas", "audit"} <= overview.keys()
    report = qtv.ok("get", "/admin/reports?days=30")
    assert report["done"] > 0 and len(report["byDay"]) == 30
    assert sum(s["count"] for s in report["byStatus"]) == report["total"]
    assert qtv.get("/admin/reports?days=5").status_code == 400


def test_report_ticket_rows_match_summary(qtv, khach):
    report = qtv.ok("get", "/admin/reports?days=30")
    rows = qtv.ok("get", "/admin/reports/tickets?days=30")
    assert len(rows) == report["total"]
    assert sum(r["amount"] for r in rows if r["status"] == "HOAN_TAT") == report["revenue"]
    assert sum(1 for r in rows if r["status"] == "DA_HUY") == report["cancelled"]
    assert [r["createdAt"] for r in rows] == sorted((r["createdAt"] for r in rows), reverse=True)
    assert khach.get("/admin/reports/tickets?days=30").status_code == 403
    assert qtv.get("/admin/reports/tickets?days=5").status_code == 400


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


def test_schedule_blocks_assignment_uc18(client, qtv, dpv, khach):
    ticket = create_ticket(khach, "Máy tính không lên nguồn, cần sửa.", hour=15)
    received = dpv.ok("post", f"/tickets/{ticket['id']}/receive", {"categoryCode": "NGUON", "version": ticket["version"]})
    tech = next(t for t in qtv.ok("get", "/admin/overview")["technicians"] if "NGUON" in t["skills"])
    tomorrow = tomorrow_at(15)[:10]
    assert qtv.put("/admin/technicians", {**tech, "schedule": {**tech["schedule"], "start": "21:00"}}).status_code == 400
    qtv.ok("put", "/admin/technicians", {**tech, "schedule": {**tech["schedule"], "daysOff": [tomorrow]}})

    query = received["slotStart"].replace("+", "%2B")
    suggestion = next(
        s for s in dpv.ok("get", f"/tickets/{ticket['id']}/technician-suggestions?appointmentAt={query}") if s["tech"]["id"] == tech["id"]
    )
    assert suggestion["offDuty"] is True
    response = dpv.post(
        f"/tickets/{ticket['id']}/assign",
        {"techId": tech["id"], "appointmentAt": received["slotStart"], "version": received["version"]},
    )
    assert response.status_code == 409
