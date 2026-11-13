"""Khách không cần tài khoản: đặt lịch nhanh, tra cứu đơn bằng mã đơn và số điện thoại."""

from fastapi import APIRouter, Request

from app.api.deps import Db, presenter
from app.api.tickets import classify_issue
from app.schemas import ClassifyBody, GuestLookupBody, GuestTicketBody
from app.services import guest

router = APIRouter(prefix="/guest", tags=["Khách không cần tài khoản"])


def _client(request: Request) -> str:
    return request.client.host if request.client else "khong-ro"


@router.post("/classify")
async def classify(body: ClassifyBody, request: Request, db: Db) -> dict:
    guest.throttle(
        f"phan-loai:{_client(request)}", guest.CLASSIFY_LIMIT, guest.CLASSIFY_WINDOW, "Bạn dùng gợi ý quá nhiều lần, vui lòng thử lại sau."
    )
    return await classify_issue(db, body.description)


@router.post("/tickets", status_code=201)
def create_ticket(body: GuestTicketBody, request: Request, db: Db) -> dict:
    message = "Bạn đặt quá nhiều đơn, vui lòng thử lại sau."
    guest.throttle(f"dat-lich:{_client(request)}", guest.BOOKING_LIMIT, guest.BOOKING_WINDOW, message)
    ticket, user = guest.create_ticket(db, body)
    result = guest.session(user, ticket.id)
    db.commit()
    return {**result, "ticket": presenter(db, user).ticket(ticket)}


@router.post("/lookup")
def lookup(body: GuestLookupBody, request: Request, db: Db) -> dict:
    ticket, user = guest.lookup(db, body.ticket_id, body.phone, _client(request))
    return {**guest.session(user, ticket.id), "ticketId": ticket.id}
