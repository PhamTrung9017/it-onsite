from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, Db, presenter
from app.models import Category, Service
from app.schemas import (
    AcceptanceBody,
    ClassifyBody,
    CreateTicketBody,
    QuoteDecisionBody,
    ReasonBody,
    RescheduleBody,
    ReviewBody,
    WarrantyClaimBody,
)
from app.services import ai, tickets
from app.services.common import load_config, require_roles
from app.services.present import category_json, device_json, iso

from .catalog import service_json

router = APIRouter(tags=["Khách hàng"])


def claim_json(claim) -> dict:
    return {
        "id": claim.id,
        "warrantyId": claim.warranty_id,
        "customerId": claim.customer_id,
        "description": claim.description,
        "slotStart": iso(claim.slot_start),
        "status": claim.status,
        "reason": claim.reason,
        "newTicketId": claim.new_ticket_id,
        "decidedBy": claim.decided_by,
        "decidedAt": iso(claim.decided_at),
        "createdAt": iso(claim.created_at),
    }


def warranty_json(warranty, status: dict) -> dict:
    return {
        "id": warranty.id,
        "ticketId": warranty.ticket_id,
        "quoteItemId": warranty.quote_item_id,
        "deviceId": warranty.device_id,
        "customerId": warranty.customer_id,
        "name": warranty.name,
        "startAt": iso(warranty.start_at),
        "endAt": iso(warranty.end_at),
        **status,
    }


@router.post("/classify")
async def classify(body: ClassifyBody, user: CurrentUser, db: Db) -> dict:
    """UC05: gợi ý loại sự cố; giá gợi ý luôn lấy từ bảng giá (BR-09)."""
    require_roles(user, "KHACH")
    config = load_config(db)
    categories = db.scalars(select(Category).order_by(Category.position)).all()
    result = await ai.classify(body.description, {c.code: c.name for c in categories}, config.ai_confidence_threshold)
    if result["state"] == "failed":
        return result
    category = next(c for c in categories if c.code == result["categoryCode"])
    service = db.get(Service, category.service_id) if category.service_id else None
    return {**result, "category": category_json(category), "suggestedService": service_json(service) if service else None}


@router.post("/tickets", status_code=201)
def create_ticket(body: CreateTicketBody, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.create_ticket(db, user, body)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.get("/tickets/mine")
def my_tickets(user: CurrentUser, db: Db) -> list[dict]:
    p = presenter(db, user)
    return [p.ticket(t) for t in tickets.list_my_tickets(db, user)]


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.get_visible_ticket(db, user, ticket_id)
    p = presenter(db, user)
    return p.ticket(ticket, **tickets.ticket_policies(ticket, p.config))


@router.post("/tickets/{ticket_id}/cancel")
def cancel(ticket_id: str, body: ReasonBody, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.cancel_ticket(db, user, ticket_id, body.reason)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/reschedule")
def reschedule(ticket_id: str, body: RescheduleBody, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.reschedule_ticket(db, user, ticket_id, body.slot_start)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/quotes/{quote_id}/decision")
def decide_quote(ticket_id: str, quote_id: int, body: QuoteDecisionBody, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.decide_quote(db, user, ticket_id, quote_id, body.decision, body.item_ids, body.reason)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/acceptance")
def acceptance(ticket_id: str, body: AcceptanceBody, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.accept_work(db, user, ticket_id, body.ok, body.reason)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.get("/tickets/{ticket_id}/payment")
def payment(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    info = tickets.payment_info(db, user, ticket_id)
    ticket = info.pop("ticket")
    return {**info, "payment": presenter(db, user).ticket(ticket)["payment"]}


@router.post("/tickets/{ticket_id}/payment/transfer")
def report_transfer(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.report_transfer(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/payment/cash")
def choose_cash(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.choose_cash(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/review")
def review(ticket_id: str, body: ReviewBody, user: CurrentUser, db: Db) -> dict:
    ticket = tickets.submit_review(db, user, ticket_id, body.stars, body.comment)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.get("/warranties/mine")
def my_warranties(user: CurrentUser, db: Db) -> list[dict]:
    return [
        {
            **warranty_json(row["warranty"], row["status"]),
            "device": device_json(row["device"]),
            "claim": claim_json(row["claim"]) if row["claim"] else None,
        }
        for row in tickets.list_my_warranties(db, user)
    ]


@router.post("/warranty-claims", status_code=201)
def create_claim(body: WarrantyClaimBody, user: CurrentUser, db: Db) -> dict:
    claim = tickets.create_warranty_claim(db, user, body.warranty_id, body.description, body.slot_start)
    db.commit()
    return claim_json(claim)
