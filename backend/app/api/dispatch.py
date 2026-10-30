from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import AwareDatetime

from app.api.deps import CurrentUser, Db, presenter
from app.domain.rules import warranty_status
from app.models import Device, User
from app.schemas import AssignBody, ClaimDecisionBody, ReceiveBody
from app.services import dispatch
from app.services.common import utcnow
from app.services.present import device_json, tech_json, user_json

from .tickets import claim_json, warranty_json

router = APIRouter(tags=["Điều phối"])


@router.get("/dispatch/board")
def board(user: CurrentUser, db: Db) -> list[dict]:
    tickets = dispatch.board(db, user)
    db.commit()
    p = presenter(db, None)
    return [p.ticket(t) for t in tickets]


@router.post("/tickets/{ticket_id}/receive")
def receive(ticket_id: str, body: ReceiveBody, user: CurrentUser, db: Db) -> dict:
    ticket = dispatch.receive(db, user, ticket_id, body.category_code, body.urgency, body.version)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.get("/tickets/{ticket_id}/technician-suggestions")
def suggestions(
    ticket_id: str, appointment_at: Annotated[AwareDatetime, Query(alias="appointmentAt")], user: CurrentUser, db: Db
) -> list[dict]:
    return [
        {
            "tech": tech_json(row["tech"]),
            "skill": row["skill"],
            "area": row["area"],
            "jobsToday": row["jobsToday"],
            "conflict": row["conflict"],
            "offDuty": row["offDuty"],
        }
        for row in dispatch.suggest(db, user, ticket_id, appointment_at)
    ]


@router.post("/tickets/{ticket_id}/assign")
def assign(ticket_id: str, body: AssignBody, user: CurrentUser, db: Db) -> dict:
    ticket = dispatch.assign(db, user, ticket_id, body.tech_id, body.appointment_at, body.version)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.get("/payments")
def payments(user: CurrentUser, db: Db) -> list[dict]:
    p = presenter(db, None)
    return [p.ticket(t) for t in dispatch.list_payments(db, user)]


@router.post("/tickets/{ticket_id}/payment/confirm")
def confirm_transfer(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = dispatch.confirm_transfer(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.post("/tickets/{ticket_id}/payment/reconcile")
def reconcile(ticket_id: str, user: CurrentUser, db: Db) -> dict:
    ticket = dispatch.reconcile_cash(db, user, ticket_id)
    db.commit()
    return presenter(db, user).ticket(ticket)


@router.get("/warranty-claims")
def claims(user: CurrentUser, db: Db) -> list[dict]:
    now = utcnow()
    result = []
    for claim in dispatch.list_claims(db, user):
        warranty = claim.warranty
        result.append(
            {
                **claim_json(claim),
                "warranty": warranty_json(warranty, warranty_status(warranty.end_at, now)),
                "customer": user_json(db.get(User, claim.customer_id)),
                "device": device_json(db.get(Device, warranty.device_id)),
            }
        )
    return result


@router.post("/warranty-claims/{claim_id}/decision")
def decide_claim(claim_id: int, body: ClaimDecisionBody, user: CurrentUser, db: Db) -> dict:
    claim = dispatch.decide_claim(db, user, claim_id, body.valid, body.reason)
    db.commit()
    return claim_json(claim)
