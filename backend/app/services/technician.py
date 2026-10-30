"""Nghiệp vụ phía kỹ thuật viên: nhận việc, check-in, báo giá, thực hiện, hoàn thành, thu tiền (UC09, UC10, UC12, UC14)."""

import secrets
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict
from app.core.security import token_digest
from app.domain.rules import can_complete
from app.domain.status import CLOSED_STATUSES, Status
from app.models import Assignment, Part, Photo, Quote, QuoteItem, Service, Ticket, User
from app.services import media
from app.services.common import (
    complete,
    dispatcher_ids,
    find_ticket,
    load_config,
    money,
    notify,
    require_assigned_tech,
    require_roles,
    tech_of_user,
    touch,
    transition,
    utcnow,
)
from app.services.tickets import apply_quote_decision

MAX_WORK_PHOTOS = 6
ONSITE_CODE_MINUTES = 10
RECENT_DAYS = 7


def list_my_jobs(db: Session, user: User) -> list[Ticket]:
    require_roles(user, "KTV")
    tech = tech_of_user(db, user)
    if tech is None:
        return []
    recent = utcnow() - timedelta(days=RECENT_DAYS)
    tickets = db.scalars(
        select(Ticket)
        .join(Assignment, Assignment.ticket_id == Ticket.id)
        .where(Assignment.tech_id == tech.id, Ticket.status != Status.DA_TIEP_NHAN)
        .where(or_(Ticket.status.not_in([s.value for s in CLOSED_STATUSES]), Ticket.updated_at > recent))
        .distinct()
    ).all()
    mine = [t for t in tickets if t.assignment and t.assignment.tech_id == tech.id]
    return sorted(mine, key=lambda t: t.assignment.appointment_at)


def respond_assignment(db: Session, user: User, ticket_id: str, accept: bool, reason: str) -> Ticket:
    require_roles(user, "KTV")
    ticket = find_ticket(db, ticket_id, lock=True)
    tech = tech_of_user(db, user)
    assignment = ticket.assignment
    if tech is None or assignment is None or assignment.tech_id != tech.id or ticket.status != Status.DA_PHAN_CONG or assignment.result:
        raise conflict("Phân công này không còn chờ bạn phản hồi.")
    assignment.responded_at = utcnow()
    if accept:
        assignment.result = "NHAN"
        transition(db, ticket, Status.KTV_DA_NHAN, user)
    else:
        if not reason.strip():
            raise ApiError("Vui lòng cho biết lý do từ chối.")
        assignment.result = "TU_CHOI"
        assignment.reject_reason = reason.strip()
        transition(db, ticket, Status.DA_TIEP_NHAN, user, f"KTV từ chối: {reason.strip()}")
        notify(db, dispatcher_ids(db), "KTV từ chối việc", f"{user.name} từ chối phiếu {ticket.id}. Vui lòng phân công lại.", ticket.id)
    return ticket


def check_in(db: Session, user: User, ticket_id: str) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    ticket.check_in_at = utcnow()
    transition(db, ticket, Status.DANG_KHAO_SAT, user, "Kỹ thuật viên đã đến nơi")
    return ticket


def create_quote(db: Session, user: User, ticket_id: str, items: list, note: str) -> Ticket:
    """UC10: đơn giá cố định tại thời điểm lập báo giá (BR-13); phát sinh khi đang làm là báo giá bổ sung (BR-01)."""
    ticket = find_ticket(db, ticket_id, lock=True)
    tech = require_assigned_tech(db, user, ticket)
    if ticket.status not in (Status.DANG_KHAO_SAT, Status.DANG_THUC_HIEN):
        raise conflict("Chỉ lập báo giá khi đang khảo sát hoặc đang thực hiện (báo giá bổ sung).")
    if not items:
        raise ApiError("Báo giá cần ít nhất một hạng mục.")
    quote_type = "CHINH" if ticket.status == Status.DANG_KHAO_SAT else "BO_SUNG"
    quote = Quote(type=quote_type, status="CHO_DUYET", note=note.strip(), created_at=utcnow(), created_by=tech.id)
    for item in items:
        if item.qty < 1:
            raise ApiError("Số lượng phải từ 1 trở lên.")
        source = db.get(Service, item.ref_id) if item.kind == "service" else db.get(Part, item.ref_id)
        if source is None or not source.active:
            raise ApiError("Hạng mục không còn trong danh mục.")
        if item.kind == "part" and source.stock < item.qty:
            raise ApiError(f'Linh kiện "{source.name}" chỉ còn {source.stock} trong kho.')
        quote.items.append(
            QuoteItem(
                kind=item.kind,
                ref_id=source.id,
                name=source.name,
                qty=item.qty,
                unit_price=0 if ticket.is_warranty else source.price,
                warranty_days=source.warranty_days,
                selected=True,
            )
        )
    ticket.quotes.append(quote)
    transition(db, ticket, Status.CHO_DUYET_BAO_GIA, user, "Báo giá bổ sung" if quote_type == "BO_SUNG" else "")
    title = "Có báo giá bổ sung" if quote_type == "BO_SUNG" else "Có báo giá mới"
    notify(db, [ticket.customer_id], title, f"Phiếu {ticket.id}: vui lòng xem và duyệt báo giá.", ticket.id)
    return ticket


def send_onsite_code(db: Session, user: User, ticket_id: str) -> dict:
    """UC11 luồng 1a: khách không thao tác được trên điện thoại thì đọc mã xác nhận cho KTV."""
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    if ticket.status != Status.CHO_DUYET_BAO_GIA:
        raise conflict("Không có báo giá chờ duyệt.")
    code = f"{secrets.randbelow(900000) + 100000}"
    ticket.onsite_code_hash = token_digest(code)
    ticket.onsite_code_expires_at = utcnow() + timedelta(minutes=ONSITE_CODE_MINUTES)
    notify(
        db,
        [ticket.customer_id],
        "Mã xác nhận báo giá",
        f"Mã xác nhận báo giá phiếu {ticket.id} là {code} (hiệu lực {ONSITE_CODE_MINUTES} phút). "
        "Chỉ đọc mã cho kỹ thuật viên khi bạn đồng ý toàn bộ báo giá.",
        ticket.id,
    )
    return {"sentTo": ticket.customer.phone}


def confirm_onsite(db: Session, user: User, ticket_id: str, code: str) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    if not ticket.onsite_code_hash or not ticket.onsite_code_expires_at or ticket.onsite_code_expires_at < utcnow():
        raise conflict("Mã đã hết hạn, vui lòng gửi lại mã.")
    if token_digest(code.strip()) != ticket.onsite_code_hash:
        raise ApiError("Mã xác nhận không đúng.")
    quote = next((q for q in ticket.quotes if q.status == "CHO_DUYET"), None)
    if quote is None:
        raise conflict("Không có báo giá chờ duyệt.")
    ticket.onsite_code_hash = None
    customer = ticket.customer
    apply_quote_decision(db, ticket, quote, customer, f"{customer.name} (xác nhận tại chỗ)", "approve", [], "")
    return ticket


def update_checklist(db: Session, user: User, ticket_id: str, checklist: list[dict]) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    ticket.checklist = [{"text": str(i.get("text", ""))[:200], "done": bool(i.get("done"))} for i in checklist if i.get("text")]
    touch(ticket)
    return ticket


def add_work_photos(db: Session, user: User, ticket_id: str, kind: str, photos: list[str]) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    if kind not in ("before", "after"):
        raise ApiError("Loại ảnh không hợp lệ.")
    if len(ticket.photos_of(kind)) + len(photos) > MAX_WORK_PHOTOS:
        raise ApiError(f"Mỗi loại ảnh tối đa {MAX_WORK_PHOTOS} ảnh.")
    for photo in photos:
        ticket.photos.append(Photo(kind=kind, url=media.save_image(photo)))
    touch(ticket)
    return ticket


def remove_work_photo(db: Session, user: User, ticket_id: str, kind: str, index: int) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    photos = ticket.photos_of(kind)
    if not 0 <= index < len(photos):
        raise ApiError("Không tìm thấy ảnh.")
    photo = photos[index]
    ticket.photos.remove(photo)
    media.delete_image(photo.url)
    touch(ticket)
    return ticket


def complete_work(db: Session, user: User, ticket_id: str) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    if not can_complete(len(ticket.photos_of("before")), len(ticket.photos_of("after"))):
        raise conflict("Cần ít nhất 1 ảnh trước và 1 ảnh sau khi xử lý (BR-11).")
    transition(db, ticket, Status.CHO_NGHIEM_THU, user, "Kỹ thuật viên báo hoàn thành")
    return ticket


def confirm_cash(db: Session, user: User, ticket_id: str) -> Ticket:
    """KTV xác nhận đã thu tiền mặt thì phiếu hoàn tất; điều phối viên đối soát sau (BR-08)."""
    ticket = find_ticket(db, ticket_id, lock=True)
    require_assigned_tech(db, user, ticket)
    payment = ticket.payment
    if ticket.status != Status.CHO_THANH_TOAN or payment is None or payment.status != "CHO_THANH_TOAN":
        raise conflict("Phiếu không chờ thu tiền mặt.")
    payment.method = "TIEN_MAT"
    payment.status = "DA_THU"
    payment.paid_at = utcnow()
    payment.confirmed_by = user.id
    payment.confirmed_by_name = user.name
    payment.confirmed_at = payment.paid_at
    complete(db, ticket, user, f"Đã thu tiền mặt {money(payment.amount)}", load_config(db))
    notify(db, dispatcher_ids(db), "Tiền mặt cần đối soát", f"{user.name} đã thu {money(payment.amount)} phiếu {ticket.id}.", ticket.id)
    return ticket


def tech_profile(db: Session, user: User) -> dict:
    require_roles(user, "KTV")
    tech = tech_of_user(db, user)
    tickets = (
        db.scalars(select(Ticket).join(Assignment, Assignment.ticket_id == Ticket.id).where(Assignment.tech_id == tech.id).distinct()).all()
        if tech
        else []
    )
    mine = [t for t in tickets if t.assignment and t.assignment.tech_id == tech.id]
    local = utcnow().astimezone(get_settings().tz)
    month_start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    done = [t for t in mine if t.status == Status.HOAN_TAT]
    done_month = [t for t in done if t.completed_at and t.completed_at >= month_start]
    reviewed = sorted((t for t in mine if t.review), key=lambda t: t.review.at, reverse=True)[:5]
    return {"tech": tech, "done": done, "doneMonth": done_month, "reviewed": reviewed}
