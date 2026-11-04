from datetime import datetime

from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import OutboxMessage
from tests.conftest import tomorrow_at
from tests.test_flow import create_ticket, receive


def test_overview_and_reports(qtv):
    overview = qtv.ok("get", "/admin/overview")
    assert {"technicians", "services", "parts", "categories", "users", "config", "allAreas", "audit"} <= overview.keys()
    report = qtv.ok("get", "/admin/reports?days=30")
    assert report["done"] > 0 and len(report["byDay"]) == 30
    assert sum(s["count"] for s in report["byStatus"]) == report["total"]
    assert qtv.get("/admin/reports?days=5").status_code == 400


def test_report_export_matches_summary(qtv, khach):
    report = qtv.ok("get", "/admin/reports?days=30")
    data = qtv.ok("get", "/admin/reports/export?days=30")
    start, end = report["period"]["from"], report["period"]["to"]
    created = [t for t in data["tickets"] if start <= t["createdAt"] <= end]
    completed = [t for t in data["tickets"] if t["status"] == "HOAN_TAT" and t["completedAt"] and start <= t["completedAt"] <= end]
    assert len(created) == report["total"]
    assert len(completed) == report["done"] > 0
    forfeited = [
        t for t in data["tickets"] if t["deposit"] and t["deposit"]["status"] == "KHONG_HOAN" and start <= t["deposit"]["settledAt"] <= end
    ]
    assert forfeited and report["forfeitedDeposits"] == sum(t["deposit"]["amount"] for t in forfeited)
    assert sum(t["amount"] for t in completed) + report["forfeitedDeposits"] == report["revenue"]
    for t in completed:
        assert t["serviceAmount"] + t["partsAmount"] + t["surveyFee"] == t["amount"], t["id"]
        assert t["amount"] == t["payment"]["amount"] + t["depositApplied"], t["id"]
    assert data["payroll"] == {"baseSalary": 5000000, "commissionPercent": 30}
    assert {t["techId"] for t in completed} <= {k["id"] for k in data["technicians"]}
    assert khach.get("/admin/reports/export?days=30").status_code == 403


def test_report_by_month(qtv):
    this_month = datetime.now(get_settings().tz).strftime("%Y-%m")
    report = qtv.ok("get", f"/admin/reports?month={this_month}")
    assert report["period"]["kind"] == "month" and report["byDay"][0]["date"].startswith(f"{this_month}-01")
    assert qtv.ok("get", f"/admin/reports/export?month={this_month}")["period"]["kind"] == "month"
    for bad in ("2026-13", "2999-01", "10-2026"):
        assert qtv.get(f"/admin/reports?month={bad}").status_code == 400
    assert qtv.get("/admin/reports").status_code == 400


def test_payroll_config_validation(qtv):
    config = qtv.ok("get", "/admin/overview")["config"]
    assert qtv.put("/admin/config", {**config, "payroll": {"baseSalary": 6000000, "commissionPercent": 101}}).status_code == 400
    saved = qtv.ok("put", "/admin/config", {**config, "payroll": {"baseSalary": 6000000, "commissionPercent": 25.5}})
    assert saved["payroll"] == {"baseSalary": 6000000, "commissionPercent": 25.5}


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
    received = receive(dpv, ticket, "NGUON")
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


def test_audit_log_records_old_and_new_values_nfr08(qtv):
    overview = qtv.ok("get", "/admin/overview")
    service = next(s for s in overview["services"] if s["categoryCode"] == "VIRUS")
    qtv.ok("put", "/admin/services", {**service, "price": 250000, "warrantyDays": 45})
    part = overview["parts"][0]
    qtv.ok("put", "/admin/parts", {**part, "stock": part["stock"] + 5})
    config = overview["config"]
    areas = [a for a in config["areas"] if a != "Bình Quới"]
    qtv.ok("put", "/admin/config", {**config, "surveyFee": 60000, "depositMinutes": 45, "areas": areas})
    tech = next(t for t in overview["technicians"] if t["active"])
    qtv.ok("put", "/admin/technicians", {**tech, "skills": [*tech["skills"], "KHAC"], "schedule": {**tech["schedule"], "start": "09:00"}})

    details = {a["action"]: a["detail"] for a in reversed(qtv.ok("get", "/admin/overview")["audit"])}
    assert "Giá: 200.000đ → 250.000đ" in details["SUA_BANG_GIA"] and "Bảo hành (ngày): 30 → 45" in details["SUA_BANG_GIA"]
    assert f"Tồn kho: {part['stock']} → {part['stock'] + 5}" in details["SUA_LINH_KIEN"]
    assert "Phí khảo sát: 50.000đ → 60.000đ" in details["CAU_HINH"]
    assert "Thời hạn trả phí giữ lịch (phút): 30 → 45" in details["CAU_HINH"]
    assert "Khu vực phục vụ: bỏ Bình Quới" in details["CAU_HINH"]
    assert "Kỹ năng: thêm Khác" in details["SUA_KTV"] and "08:00–" in details["SUA_KTV"] and "→" in details["SUA_KTV"]


def test_report_custom_range_and_filters(qtv):
    today = datetime.now(get_settings().tz).date()
    start = (today.replace(day=1) if today.day > 1 else today).isoformat()
    full = qtv.ok("get", f"/admin/reports?from={start}&to={today.isoformat()}")
    assert full["period"]["kind"] == "range" and full["filter"] == {"techId": None, "category": None, "ward": None}
    assert full["completionRate"] is None or 0 <= full["completionRate"] <= 100
    assert full["onsiteHours"] is None or full["onsiteHours"] > 0

    month = qtv.ok("get", "/admin/reports?days=30")
    tech = qtv.ok("get", "/admin/overview")["technicians"][0]
    mine = qtv.ok("get", f"/admin/reports?days=30&techId={tech['id']}")
    assert [t["name"] for t in mine["byTech"]] in ([], [tech["name"]])
    assert mine["done"] == next((t["done"] for t in month["byTech"] if t["name"] == tech["name"]), 0)
    by_category = qtv.ok("get", "/admin/reports?days=30&category=CAI_HDH")
    assert {c["name"] for c in by_category["byCategory"]} <= {"Cài đặt hệ điều hành"}
    by_ward = qtv.ok("get", "/admin/reports/export?days=30&ward=Bến Thành")
    assert by_ward["filter"]["ward"] == "Bến Thành" and all(t["ward"] == "Bến Thành" for t in by_ward["tickets"])
    done = [t for t in by_ward["tickets"] if t["status"] == "HOAN_TAT" and t["checkInAt"]]
    assert all(t["workDoneAt"] is None or t["workDoneAt"] >= t["checkInAt"] for t in done)

    for bad in ("from=2026-10-10", "from=2026-10-10&to=2026-10-01", "from=x&to=y", "from=2026-01-01&to=2027-12-31"):
        assert qtv.get(f"/admin/reports?{bad}").status_code == 400
