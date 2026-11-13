from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, Db, Page
from app.schemas import InternalUserBody, PartBody, RolesBody, ServiceBody, TechnicianBody
from app.services import admin, reports, system_status
from app.services.present import category_json, iso, tech_json, user_json

from .catalog import part_json, service_json

router = APIRouter(prefix="/admin", tags=["Quản trị"])


@router.get("/overview")
def overview(user: CurrentUser, db: Db) -> dict:
    data = admin.overview(db, user)
    technicians = []
    for tech in data["techs"]:
        done, busy = data["techStats"].get(tech.id, (0, 0))
        technicians.append({**tech_json(tech), "email": tech.user.email, "done": done, "activeJobs": busy})
    return {
        "technicians": technicians,
        "services": [service_json(s) for s in data["services"]],
        "parts": [part_json(p) for p in data["parts"]],
        "categories": [category_json(c) for c in data["categories"]],
        "config": data["config"].to_dict(),
        "allAreas": data["allAreas"],
    }


@router.get("/users")
def users(user: CurrentUser, db: Db, page: Page, q: str = "", role: str | None = None) -> list[dict]:
    """Tài khoản, tìm theo tên, email, số điện thoại (`q`) và lọc theo vai trò (`role`)."""
    items, total = admin.list_users(db, user, q, role or None, page.limit, page.offset)
    page.total(total)
    return [user_json(u) for u in items]


@router.get("/audit")
def audit_log(user: CurrentUser, db: Db, page: Page) -> list[dict]:
    """Nhật ký thao tác (NFR-08), mới nhất trước."""
    items, total = admin.list_audit(db, user, page.limit, page.offset)
    page.total(total)
    return [
        {"at": iso(a.at), "userId": a.user_id, "userName": a.user_name, "action": a.action, "target": a.target, "detail": a.detail}
        for a in items
    ]


@router.put("/services")
def save_service(body: ServiceBody, user: CurrentUser, db: Db) -> dict:
    service = admin.save_service(db, user, body)
    db.commit()
    return service_json(service)


@router.put("/parts")
def save_part(body: PartBody, user: CurrentUser, db: Db) -> dict:
    part = admin.save_part(db, user, body)
    db.commit()
    return part_json(part)


@router.put("/technicians")
def save_technician(body: TechnicianBody, user: CurrentUser, db: Db) -> dict:
    tech = admin.save_technician(db, user, body)
    db.commit()
    return tech_json(tech)


@router.put("/users/{user_id}/roles")
def save_roles(user_id: int, body: RolesBody, user: CurrentUser, db: Db) -> dict:
    target = admin.save_roles(db, user, user_id, body.roles, body.locked)
    db.commit()
    return user_json(target)


@router.post("/users", status_code=201)
def create_user(body: InternalUserBody, user: CurrentUser, db: Db) -> dict:
    created = admin.create_internal_user(db, user, body.name, body.email, body.phone, body.roles)
    db.commit()
    return user_json(created)


@router.get("/system-status")
def get_system_status(user: CurrentUser, db: Db) -> dict:
    return system_status.system_status(db, user)


@router.post("/demo-data/reset")
def reset_demo_data(user: CurrentUser, db: Db) -> dict:
    admin.reload_demo_data(db, user)
    db.commit()
    return {"ok": True}


@router.put("/config")
def save_config(body: dict, user: CurrentUser, db: Db) -> dict:
    config = admin.save_config(db, user, body)
    db.commit()
    return config.to_dict()


def report_query(
    days: int | None = None,
    month: str | None = None,
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    tech_id: int | None = Query(None, alias="techId"),
    category: str | None = None,
    ward: str | None = None,
) -> dict:
    """Kỳ báo cáo: `days`, `month` hoặc `from`, `to` (yyyy-mm-dd); lọc thêm theo `techId`, `category`, `ward`."""
    return {
        "days": days,
        "month": month,
        "date_from": date_from,
        "date_to": date_to,
        "flt": reports.ReportFilter(tech_id, category or None, ward or None),
    }


ReportQuery = Annotated[dict, Depends(report_query)]


@router.get("/reports")
def report(user: CurrentUser, db: Db, query: ReportQuery) -> dict:
    return reports.report(db, user, **query)


@router.get("/reports/export")
def report_export(user: CurrentUser, db: Db, query: ReportQuery) -> dict:
    return reports.export_data(db, user, **query)
