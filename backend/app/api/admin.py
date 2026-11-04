from fastapi import APIRouter

from app.api.deps import CurrentUser, Db
from app.schemas import InternalUserBody, PartBody, RolesBody, ServiceBody, TechnicianBody
from app.services import admin, reports
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
        "users": [user_json(u) for u in data["users"]],
        "config": data["config"].to_dict(),
        "allAreas": data["allAreas"],
        "audit": [
            {"at": iso(a.at), "userId": a.user_id, "userName": a.user_name, "action": a.action, "target": a.target, "detail": a.detail}
            for a in data["audit"]
        ],
    }


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


@router.put("/config")
def save_config(body: dict, user: CurrentUser, db: Db) -> dict:
    config = admin.save_config(db, user, body)
    db.commit()
    return config.to_dict()


@router.get("/reports")
def report(user: CurrentUser, db: Db, days: int | None = None, month: str | None = None) -> dict:
    return reports.report(db, user, days, month)


@router.get("/reports/export")
def report_export(user: CurrentUser, db: Db, days: int | None = None, month: str | None = None) -> dict:
    return reports.export_data(db, user, days, month)
