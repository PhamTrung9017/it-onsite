from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, Db
from app.models import Category, Part, Service
from app.services.common import load_config, require_roles
from app.services.present import category_json

router = APIRouter(tags=["Danh mục"])


def service_json(service: Service) -> dict:
    return {
        "id": service.id,
        "name": service.name,
        "categoryCode": service.category_code,
        "price": service.price,
        "durationMin": service.duration_min,
        "warrantyDays": service.warranty_days,
        "active": service.active,
    }


def part_json(part: Part) -> dict:
    return {
        "id": part.id,
        "name": part.name,
        "price": part.price,
        "stock": part.stock,
        "warrantyDays": part.warranty_days,
        "active": part.active,
    }


@router.get("/catalog")
def catalog(db: Db) -> dict:
    """UC03: dịch vụ, giá tham khảo, phí khảo sát; xem được khi chưa đăng nhập."""
    config = load_config(db)
    return {
        "services": [service_json(s) for s in db.scalars(select(Service).where(Service.active.is_(True)).order_by(Service.id))],
        "categories": [category_json(c) for c in db.scalars(select(Category).order_by(Category.position))],
        "config": {
            "surveyFee": config.survey_fee,
            "freeCancelHours": config.free_cancel_hours,
            "serviceHours": {"start": config.service_start, "end": config.service_end},
            "areas": config.areas,
            "reviewWindowDays": config.review_window_days,
        },
    }


@router.get("/parts")
def parts(user: CurrentUser, db: Db) -> list[dict]:
    require_roles(user, "KTV", "QTV")
    return [part_json(p) for p in db.scalars(select(Part).where(Part.active.is_(True)).order_by(Part.id))]
