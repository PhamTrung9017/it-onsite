"""Nghiệp vụ phía khách hàng: tạo phiếu, theo dõi, hủy, đổi lịch, duyệt báo giá, nghiệm thu, thanh toán, bảo hành, đánh giá."""

from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, forbidden, not_found
from app.core.security import encrypt_secret
from app.domain.rules import (
    Booking,
    BusinessConfig,
    cancellation_policy,
    has_conflict,
    review_policy,
    validate_review,
    validate_slot,
    warranty_status,
)
from app.domain.status import BUSY_STATUSES, Status
from app.domain.vietqr import build_vietqr
from app.models import (
    Assignment,
    Category,
    Device,
    Part,
    Photo,
    Quote,
    Review,
    Service,
    Technician,
    Ticket,
    User,
    Warranty,
    WarrantyClaim,
)
from app.services import media
from app.services.common import (
    add_history,
    admin_ids,
    amount_due,
    audit,
    can_view,
    dispatcher_ids,
    find_ticket,
    load_config,
    money,
    notify,
    open_payment,
    require_roles,
    tech_user_id,
    touch,
    transition,
    utcnow,
)

MAX_REQUEST_PHOTOS = 5
AI_FIELDS = ("categoryCode", "confidence", "urgency", "reason", "state", "promptVersion", "ms")


def next_ticket_id(db: Session, now: datetime) -> str:
    day = now.astimezone(get_settings().tz).strftime("%Y%m%d")
    value = db.execute(
        text(
            "INSERT INTO daily_counters (day, value) VALUES (:day, 1) "
            "ON CONFLICT (day) DO UPDATE SET value = daily_counters.value + 1 RETURNING value"
        ),
        {"day": day},
    ).scalar_one()
    return f"YC-{day}-{value:03d}"


def bookings(db: Session) -> list[Booking]:
    """Các lịch hẹn đang giữ KTV, dùng kiểm tra trùng lịch (BR-04)."""
    rows = db.execute(
        select(Ticket.id, Ticket.status, Ticket.estimated_minutes, Assignment.tech_id, Assignment.appointment_at)
        .join(Assignment, Assignment.ticket_id == Ticket.id)
        .where(Ticket.status.in_([s.value for s in BUSY_STATUSES]))
        .order_by(Assignment.id)
    ).all()
    latest: dict[str, Booking] = {}
    for ticket_id, status, minutes, tech_id, appointment in rows:
        latest[ticket_id] = Booking(ticket_id, tech_id, status, appointment, minutes)
    return list(latest.values())


def create_ticket_record(
    db: Session,
    *,
    customer: User,
    device_id: int,
    description: str,
    address: str,
    ward: str,
    slot_start: datetime,
    category_code: str,
    actor_name: str,
    urgency: str = "TRUNG_BINH",
    ai_result: dict | None = None,
    credentials: str = "",
    is_warranty: bool = False,
    warranty_of: str | None = None,
    note: str = "",
) -> Ticket:
    category = db.get(Category, category_code) or db.get(Category, "KHAC")
    service = db.get(Service, category.service_id) if category.service_id else None
    now = utcnow()
    ticket = Ticket(
        id=next_ticket_id(db, now),
        customer_id=customer.id,
        device_id=device_id,
        description=description,
        address=address,
        ward=ward,
        contact_phone=customer.phone,
        slot_start=slot_start,
        category_code=category.code,
        urgency=urgency,
        estimated_minutes=service.duration_min if service else 60,
        ai_result=ai_result,
        device_credentials=encrypt_secret(credentials),
        status=Status.MOI,
        version=1,
        checklist=[],
        is_warranty=is_warranty,
        warranty_of=warranty_of,
        created_at=now,
        updated_at=now,
    )
    add_history(ticket, Status.MOI, actor_name, note)
    db.add(ticket)
    db.flush()
    return ticket


def create_ticket(db: Session, user: User, data) -> Ticket:
    require_roles(user, "KHACH")
    config = load_config(db)
    device = db.get(Device, data.device_id)
    if device is None or device.customer_id != user.id or device.removed:
        raise ApiError("Vui lòng chọn thiết bị.")
    description = data.description.strip()
    if len(description) < 10:
        raise ApiError("Mô tả sự cố cần ít nhất 10 ký tự.")
    if not data.address.strip() or not data.ward:
        raise ApiError("Vui lòng nhập địa chỉ và chọn phường.")
    if data.ward not in config.areas:
        raise ApiError("Phường này hiện chưa nằm trong khu vực phục vụ.")
    error = validate_slot(data.slot_start, config, utcnow(), get_settings().tz)
    if error:
        raise ApiError(error)
    if not (data.accept_terms and data.accept_privacy):
        raise ApiError("Bạn cần đồng ý điều khoản dịch vụ và xử lý dữ liệu cá nhân.")
    if len(data.photos) > MAX_REQUEST_PHOTOS:
        raise ApiError(f"Mỗi yêu cầu đính kèm tối đa {MAX_REQUEST_PHOTOS} ảnh.")
    ai = {k: data.ai_result[k] for k in AI_FIELDS if k in data.ai_result} if data.ai_result else None
    category_code = data.category_code or (ai or {}).get("categoryCode") or "KHAC"
    urgency = (ai or {}).get("urgency") or "TRUNG_BINH"
    ticket = create_ticket_record(
        db,
        customer=user,
        device_id=device.id,
        description=description,
        address=data.address.strip(),
        ward=data.ward,
        slot_start=data.slot_start,
        category_code=category_code,
        actor_name=user.name,
        urgency=urgency if urgency in ("THAP", "TRUNG_BINH", "CAO") else "TRUNG_BINH",
        ai_result=ai,
        credentials=data.device_credentials.strip(),
    )
    for photo in data.photos:
        ticket.photos.append(Photo(kind="request", url=media.save_image(photo)))
    audit(db, user, "TAO_PHIEU", ticket.id)
    notify(db, dispatcher_ids(db), "Phiếu mới cần tiếp nhận", f"{user.name} vừa gửi phiếu {ticket.id}.", ticket.id)
    notify(
        db, [user.id], "Đã nhận yêu cầu", f"Phiếu {ticket.id} đã được ghi nhận. Điều phối viên sẽ phân công kỹ thuật viên sớm.", ticket.id
    )
    return ticket


def list_my_tickets(db: Session, user: User) -> list[Ticket]:
    return list(db.scalars(select(Ticket).where(Ticket.customer_id == user.id).order_by(Ticket.created_at.desc())))


def get_visible_ticket(db: Session, user: User, ticket_id: str) -> Ticket:
    ticket = find_ticket(db, ticket_id)
    if not can_view(db, user, ticket):
        raise forbidden("Bạn không có quyền xem phiếu này.")
    return ticket


def appointment_of(ticket: Ticket) -> datetime:
    return ticket.assignment.appointment_at if ticket.assignment else ticket.slot_start


def ticket_policies(ticket: Ticket, config: BusinessConfig) -> dict:
    now = utcnow()
    return {
        "policy": cancellation_policy(ticket.status, appointment_of(ticket), config, now).to_dict(),
        "reviewPolicy": review_policy(ticket.status, ticket.review is not None, ticket.completed_at, config, now).to_dict(),
        "config": {
            "surveyFee": config.survey_fee,
            "freeCancelHours": config.free_cancel_hours,
            "serviceHours": {"start": config.service_start, "end": config.service_end},
        },
    }


def _owned_or_dispatcher(user: User, ticket: Ticket, message: str) -> None:
    require_roles(user, "KHACH", "DPV")
    if "DPV" not in user.roles and ticket.customer_id != user.id:
        raise forbidden(message)


def cancel_ticket(db: Session, user: User, ticket_id: str, reason: str) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    _owned_or_dispatcher(user, ticket, "Bạn không có quyền hủy phiếu này.")
    config = load_config(db)
    policy = cancellation_policy(ticket.status, appointment_of(ticket), config, utcnow())
    if not policy.allowed:
        raise conflict(policy.reason)
    if not reason.strip():
        raise ApiError("Vui lòng cho biết lý do hủy.")
    ticket.cancel = {"by": user.id, "byName": user.name, "reason": reason.strip(), "fee": policy.fee, "at": utcnow().isoformat()}
    transition(db, ticket, Status.DA_HUY, user, reason.strip())
    return ticket


def reschedule_ticket(db: Session, user: User, ticket_id: str, slot_start: datetime) -> Ticket:
    ticket = find_ticket(db, ticket_id, lock=True)
    _owned_or_dispatcher(user, ticket, "Bạn không có quyền đổi lịch phiếu này.")
    config = load_config(db)
    now = utcnow()
    policy = cancellation_policy(ticket.status, appointment_of(ticket), config, now)
    if not policy.allowed:
        raise conflict(policy.reason)
    error = validate_slot(slot_start, config, now, get_settings().tz)
    if error:
        raise ApiError(error)
    assignment = ticket.assignment
    if assignment and ticket.status in (Status.DA_PHAN_CONG, Status.KTV_DA_NHAN):
        if has_conflict(assignment.tech_id, slot_start, ticket.estimated_minutes, bookings(db), config, ticket.id):
            raise conflict("Kỹ thuật viên phụ trách đã có lịch ở khung giờ này. Vui lòng chọn khung giờ khác.")
        assignment.appointment_at = slot_start
        notify(
            db,
            [tech_user_id(db, assignment.tech_id)],
            "Khách đổi lịch hẹn",
            f"Phiếu {ticket.id} đổi lịch hẹn, vui lòng xem giờ mới.",
            ticket.id,
        )
    ticket.slot_start = slot_start
    ticket.late_reschedule_fee += policy.fee
    touch(ticket)
    note = "Đổi lịch hẹn" + (f" (phí đổi lịch sát giờ {money(policy.fee)})" if policy.fee else "")
    add_history(ticket, ticket.status, user.name, note)
    notify(
        db, [d for d in dispatcher_ids(db) if d != user.id], "Khách đổi lịch hẹn", f"Phiếu {ticket.id} đổi sang khung giờ mới.", ticket.id
    )
    audit(db, user, "DOI_LICH", ticket.id, slot_start.isoformat())
    return ticket


def apply_quote_decision(
    db: Session,
    ticket: Ticket,
    quote: Quote,
    actor: User,
    actor_name: str,
    decision: str,
    item_ids: list[int],
    reason: str,
) -> None:
    config = load_config(db)
    quote.decided_at = utcnow()
    quote.decided_by = actor_name
    if decision == "reject":
        if not reason.strip():
            raise ApiError("Vui lòng cho biết lý do từ chối.")
        quote.status = "TU_CHOI"
        quote.reject_reason = reason.strip()
        for item in quote.items:
            item.selected = False
        if quote.type == "CHINH":
            note = "Khách từ chối báo giá" if ticket.is_warranty else "Khách từ chối báo giá, thu phí khảo sát"
            transition(db, ticket, Status.CHO_THANH_TOAN, actor, note, actor_name)
            open_payment(ticket, config)
        else:
            transition(db, ticket, Status.DANG_THUC_HIEN, actor, "Khách từ chối báo giá bổ sung, tiếp tục hạng mục đã duyệt", actor_name)
        return
    if decision == "partial":
        if not item_ids:
            raise ApiError("Chọn ít nhất một hạng mục, hoặc chọn từ chối báo giá.")
        for item in quote.items:
            item.selected = item.id in item_ids
        quote.status = "DA_DUYET" if all(i.selected for i in quote.items) else "DUYET_MOT_PHAN"
    else:
        for item in quote.items:
            item.selected = True
        quote.status = "DA_DUYET"
    for item in quote.items:
        if item.selected and item.kind == "part":
            part = db.get(Part, item.ref_id, with_for_update=True)
            if part:
                part.stock = max(0, part.stock - item.qty)
    note = "Khách duyệt một phần báo giá" if quote.status == "DUYET_MOT_PHAN" else "Khách duyệt báo giá"
    transition(db, ticket, Status.DANG_THUC_HIEN, actor, note, actor_name)


def decide_quote(db: Session, user: User, ticket_id: str, quote_id: int, decision: str, item_ids: list[int], reason: str) -> Ticket:
    require_roles(user, "KHACH")
    ticket = find_ticket(db, ticket_id, lock=True)
    if ticket.customer_id != user.id:
        raise forbidden("Bạn không có quyền duyệt báo giá này.")
    quote = next((q for q in ticket.quotes if q.id == quote_id), None)
    if quote is None or quote.status != "CHO_DUYET" or ticket.status != Status.CHO_DUYET_BAO_GIA:
        raise conflict("Báo giá không còn ở trạng thái chờ duyệt.")
    apply_quote_decision(db, ticket, quote, user, user.name, decision, item_ids, reason)
    return ticket


def accept_work(db: Session, user: User, ticket_id: str, ok: bool, reason: str) -> Ticket:
    """UC13: nghiệm thu đạt thì mở thanh toán, chưa đạt thì trả về cho KTV làm tiếp."""
    require_roles(user, "KHACH")
    ticket = find_ticket(db, ticket_id, lock=True)
    if ticket.customer_id != user.id:
        raise forbidden("Bạn không có quyền nghiệm thu phiếu này.")
    if ticket.status != Status.CHO_NGHIEM_THU:
        raise conflict("Phiếu chưa ở bước nghiệm thu.")
    now = utcnow().isoformat()
    if ok:
        ticket.acceptance = {"result": "DAT", "at": now}
        transition(db, ticket, Status.CHO_THANH_TOAN, user, "Khách nghiệm thu đạt")
        open_payment(ticket, load_config(db))
    else:
        if not reason.strip():
            raise ApiError("Vui lòng mô tả điểm chưa đạt để kỹ thuật viên xử lý lại.")
        ticket.acceptance = {"result": "CHUA_DAT", "reason": reason.strip(), "at": now}
        transition(db, ticket, Status.DANG_THUC_HIEN, user, f"Chưa đạt: {reason.strip()}")
    return ticket


def payment_info(db: Session, user: User, ticket_id: str) -> dict:
    ticket = get_visible_ticket(db, user, ticket_id)
    config = load_config(db)
    amount = ticket.payment.amount if ticket.payment else amount_due(ticket, config)
    payable = ticket.status == Status.CHO_THANH_TOAN and ticket.payment is not None and ticket.payment.status == "CHO_THANH_TOAN"
    return {
        "ticket": ticket,
        "amount": amount,
        "content": f"ITONSITE {ticket.id}",
        "bank": config.to_dict()["bank"],
        "qrPayload": build_vietqr(config.bank_bin, config.bank_account_number, amount, f"ITONSITE {ticket.id}"),
        "payable": payable,
    }


def _payable_ticket(db: Session, user: User, ticket_id: str) -> Ticket:
    require_roles(user, "KHACH")
    ticket = find_ticket(db, ticket_id, lock=True)
    if ticket.customer_id != user.id or ticket.status != Status.CHO_THANH_TOAN:
        raise conflict("Phiếu không ở bước thanh toán.")
    if ticket.payment is None or ticket.payment.status != "CHO_THANH_TOAN":
        raise conflict("Phiếu này đã được ghi nhận thanh toán.")
    return ticket


def report_transfer(db: Session, user: User, ticket_id: str) -> Ticket:
    ticket = _payable_ticket(db, user, ticket_id)
    payment = ticket.payment
    payment.method = "CHUYEN_KHOAN"
    payment.status = "CHO_XAC_NHAN"
    payment.paid_at = utcnow()
    touch(ticket)
    notify(db, dispatcher_ids(db), "Khách báo đã chuyển khoản", f"Phiếu {ticket.id}: {money(payment.amount)} cần đối soát.", ticket.id)
    return ticket


def choose_cash(db: Session, user: User, ticket_id: str) -> Ticket:
    ticket = _payable_ticket(db, user, ticket_id)
    ticket.payment.method = "TIEN_MAT"
    touch(ticket)
    tech_user = tech_user_id(db, ticket.assignment.tech_id if ticket.assignment else None)
    notify(db, [tech_user], "Khách chọn trả tiền mặt", f"Phiếu {ticket.id}: thu {money(ticket.payment.amount)} tiền mặt.", ticket.id)
    return ticket


def submit_review(db: Session, user: User, ticket_id: str, stars: int, comment: str) -> Ticket:
    require_roles(user, "KHACH")
    ticket = find_ticket(db, ticket_id, lock=True)
    if ticket.customer_id != user.id:
        raise forbidden("Bạn không có quyền đánh giá phiếu này.")
    config = load_config(db)
    policy = review_policy(ticket.status, ticket.review is not None, ticket.completed_at, config, utcnow())
    if not policy.allowed:
        raise conflict(policy.reason)
    error = validate_review(stars, comment)
    if error:
        raise ApiError(error)
    ticket.review = Review(stars=stars, comment=comment.strip(), at=utcnow())
    if ticket.assignment:
        tech = db.get(Technician, ticket.assignment.tech_id, with_for_update=True)
        total = float(tech.rating) * tech.rating_count + stars
        tech.rating_count += 1
        tech.rating = round(total / tech.rating_count, 1)
    if stars <= 2:
        notify(db, admin_ids(db), "Cảnh báo đánh giá thấp", f'Phiếu {ticket.id} nhận {stars} sao: "{comment.strip()}"', ticket.id)
    audit(db, user, "DANH_GIA", ticket.id, f"{stars} sao")
    return ticket


def list_my_warranties(db: Session, user: User) -> list[dict]:
    now = utcnow()
    warranties = db.scalars(select(Warranty).where(Warranty.customer_id == user.id)).all()
    claims = db.scalars(select(WarrantyClaim).where(WarrantyClaim.customer_id == user.id, WarrantyClaim.status != "TU_CHOI")).all()
    claim_by_warranty = {c.warranty_id: c for c in claims}
    result = []
    for w in warranties:
        status = warranty_status(w.end_at, now)
        result.append({"warranty": w, "status": status, "device": db.get(Device, w.device_id), "claim": claim_by_warranty.get(w.id)})
    result.sort(key=lambda r: (not r["status"]["valid"], -r["warranty"].end_at.timestamp()))
    return result


def create_warranty_claim(db: Session, user: User, warranty_id: int, description: str, slot_start: datetime) -> WarrantyClaim:
    require_roles(user, "KHACH")
    warranty = db.get(Warranty, warranty_id)
    if warranty is None or warranty.customer_id != user.id:
        raise not_found("Không tìm thấy phiếu bảo hành.")
    now = utcnow()
    if not warranty_status(warranty.end_at, now)["valid"]:
        raise conflict("Phiếu bảo hành đã hết hạn.")
    pending = db.scalar(select(WarrantyClaim).where(WarrantyClaim.warranty_id == warranty.id, WarrantyClaim.status == "CHO_XU_LY"))
    if pending:
        raise conflict("Hạng mục này đang có yêu cầu bảo hành chờ xử lý.")
    if len(description.strip()) < 10:
        raise ApiError("Vui lòng mô tả lỗi ít nhất 10 ký tự.")
    error = validate_slot(slot_start, load_config(db), now, get_settings().tz)
    if error:
        raise ApiError(error)
    claim = WarrantyClaim(
        warranty_id=warranty.id, customer_id=user.id, description=description.strip(), slot_start=slot_start, created_at=now
    )
    db.add(claim)
    db.flush()
    notify(
        db, dispatcher_ids(db), "Yêu cầu bảo hành mới", f'{user.name} yêu cầu bảo hành "{warranty.name}" (phiếu gốc {warranty.ticket_id}).'
    )
    audit(db, user, "YEU_CAU_BAO_HANH", str(claim.id), warranty.ticket_id)
    return claim
