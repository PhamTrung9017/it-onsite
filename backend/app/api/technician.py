from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, Db, presenter
from app.models import Category, User
from app.schemas import AssignmentResponseBody, ChecklistBody, CreateQuoteBody, OnsiteCodeBody, PhotosBody
from app.services import technician
from app.services.present import category_json, iso, tech_json, user_json

router = APIRouter(tags=["Kỹ thuật viên"])


@router.get("/tech/jobs")
def my_jobs(user: CurrentUser, db: Db) -> list[dict]:
    p = presenter(db, user)
    return [p.ticket(t) for t in technician.list_my_jobs(db, user)]


@router.get("/tech/profile")
def my_profile(user: CurrentUser, db: Db) -> dict:
    data = technician.tech_profile(db, user)
    tech = data["tech"]
    return {
        "user": user_json(user),
        "tech": tech_json(tech) if tech else None,
        "categories": [category_json(c) for c in db.scalars(select(Category).order_by(Category.position))],
        "stats": {
            "doneMonth": len(data["doneMonth"]),
            "revenueMonth": sum(t.payment.amount for t in data["doneMonth"] if t.payment),
            "doneTotal": len(data["done"]),
        },
        "reviews": [
            {
                "ticketId": t.id,
                "stars": t.review.stars,
                "comment": t.review.comment,
                "at": iso(t.review.at),
                "customer": db.get(User, t.customer_id).name,
            }
            for t in data["reviewed"]
        ],
    }


@router.post("/tickets/{ticket_id}/assignment/response")
def respond(ticket_id: str, body: AssignmentResponseBody, user: CurrentUser, db: Db) -> dict:
    ticket = technician.respond_assignment(db, user, ticket_id, body.accept, body.reason)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/check-in")
def check_in(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = technician.check_in(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/quotes", status_code=201)
def create_quote(ticket_id: str, body: CreateQuoteBody, user: CurrentUser, db: Db) -> dict:
    ticket = technician.create_quote(db, user, ticket_id, body.items, body.note)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/onsite-code")
def send_onsite_code(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    result = technician.send_onsite_code(db, user, ticket_id)
    db.commit()
    return result


@router.post("/tickets/{ticket_id}/onsite-code/confirm")
def confirm_onsite(ticket_id: str, body: OnsiteCodeBody, user: CurrentUser, db: Db) -> dict:
    ticket = technician.confirm_onsite(db, user, ticket_id, body.code)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.put("/tickets/{ticket_id}/checklist")
def update_checklist(ticket_id: str, body: ChecklistBody, user: CurrentUser, db: Db) -> dict:
    ticket = technician.update_checklist(db, user, ticket_id, body.checklist)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/photos")
def add_photos(ticket_id: str, body: PhotosBody, user: CurrentUser, db: Db) -> dict:
    ticket = technician.add_work_photos(db, user, ticket_id, body.kind, body.photos)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.delete("/tickets/{ticket_id}/photos/{kind}/{index}")
def remove_photo(ticket_id: str, kind: str, index: int, user: CurrentUser, db: Db) -> dict:
    ticket = technician.remove_work_photo(db, user, ticket_id, kind, index)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/complete")
def complete(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = technician.complete_work(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/payment/cash-received")
def cash_received(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = technician.confirm_cash(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)
