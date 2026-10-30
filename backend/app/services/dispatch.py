"""Nghiệp vụ điều phối: tiếp nhận, phân công, thu hồi quá hạn, đối soát thanh toán, xử lý bảo hành (UC08, UC14, UC15)."""

from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, not_found
from app.domain.rules import Candidate, has_conflict, rank_technicians, response_deadline, warranty_status
from app.domain.status import CLOSED_STATUSES, Status
from app.models import Assignment, Category, Payment, Service, Technician, Ticket, User, WarrantyClaim
from app.services.common import (
    audit,
    check_version,
    complete,
    dispatcher_ids,
    find_ticket,
    load_config,
    notify,
    require_roles,
    transition,
    utcnow,
)
from app.services.tickets import bookings, create_ticket_record

BOARD_RECENT_DAYS = 2
PENDING_PAYMENT_STATUSES = ("CHO_XAC_NHAN", "DA_THU")
DONE_PAYMENT_STATUSES = ("DA_XAC_NHAN", "DA_DOI_SOAT")
RECENT_PAYMENTS = 60


def sweep_overdue_assignments(db: Session) -> int:
    """BR-06: KTV không phản hồi đúng hạn thì thu hồi phân công và báo điều phối viên."""
    now = utcnow()
    overdue = db.scalars(
        select(Ticket)
        .join(Assignment, Assignment.ticket_id == Ticket.id)
        .where(Ticket.status == Status.DA_PHAN_CONG, Assignment.result.is_(None), Assignment.deadline < now)
        .with_for_update(of=Ticket, skip_locked=True)
    ).all()
    for ticket in dict.fromkeys(overdue):
        assignment = ticket.assignment
        if assignment.result or assignment.deadline >= now:
            continue
        assignment.result = "QUA_HAN"
        assignment.responded_at = now
        tech = db.get(Technician, assignment.tech_id)
        transition(db, ticket, Status.DA_TIEP_NHAN, None, f"{tech.user.name} quá hạn phản hồi, đã thu hồi phân công")
        notify(db, dispatcher_ids(db), "Phân công quá hạn", f"KTV chưa phản hồi phiếu {ticket.id}. Vui lòng phân công lại.", ticket.id)
    return len(overdue)


def board(db: Session, user: User) -> list[Ticket]:
    require_roles(user, "DPV", "QTV")
    sweep_overdue_assignments(db)
    recent = utcnow() - timedelta(days=BOARD_RECENT_DAYS)
    return list(
        db.scalars(
            select(Ticket)
            .where(or_(Ticket.status.not_in([s.value for s in CLOSED_STATUSES]), Ticket.updated_at > recent))
            .order_by(Ticket.created_at)
        )
    )


def receive(db: Session, user: User, ticket_id: str, category_code: str, urgency: str | None, version: int | None) -> Ticket:
    """BR-09: điều phối viên chốt loại sự cố cuối cùng."""
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id, lock=True)
    check_version(ticket, version)
    category = db.get(Category, category_code)
    if category is None:
        raise ApiError("Vui lòng chọn loại sự cố.")
    service = db.get(Service, category.service_id) if category.service_id else None
    ticket.category_code = category.code
    if urgency in ("THAP", "TRUNG_BINH", "CAO"):
        ticket.urgency = urgency
    ticket.category_confirmed = True
    ticket.estimated_minutes = service.duration_min if service else 60
    transition(db, ticket, Status.DA_TIEP_NHAN, user, f"Loại sự cố: {category.name}")
    return ticket


def suggest(db: Session, user: User, ticket_id: str, appointment_at: datetime) -> list[dict]:
    """BR-05 kèm cờ trùng lịch BR-04 để giao diện hiển thị lý do."""
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id)
    config = load_config(db)
    techs = {
        t.id: t
        for t in db.scalars(
            select(Technician).join(User, User.id == Technician.user_id).where(Technician.active.is_(True), User.locked.is_(False))
        )
        if "KTV" in t.user.roles
    }
    candidates = [Candidate(t.id, list(t.skills), list(t.areas), float(t.rating)) for t in techs.values()]
    ranked = rank_technicians(
        candidates,
        ticket.category_code,
        ticket.ward,
        appointment_at,
        ticket.estimated_minutes,
        bookings(db),
        config,
        get_settings().tz,
        ticket.id,
    )
    return [
        {"tech": techs[r.candidate.tech_id], "skill": r.skill, "area": r.area, "jobsToday": r.jobs_today, "conflict": r.conflict}
        for r in ranked
    ]


def assign(db: Session, user: User, ticket_id: str, tech_id: int, appointment_at: datetime, version: int | None) -> Ticket:
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id, lock=True)
    check_version(ticket, version)
    if ticket.status != Status.DA_TIEP_NHAN:
        raise conflict("Chỉ phân công phiếu ở trạng thái Đã tiếp nhận.")
    tech = db.get(Technician, tech_id, with_for_update=True)
    if tech is None or not tech.active or tech.user.locked or "KTV" not in tech.user.roles:
        raise ApiError("Kỹ thuật viên không khả dụng.")
    now = utcnow()
    if appointment_at < now:
        raise ApiError("Giờ hẹn phải ở tương lai.")
    config = load_config(db)
    if has_conflict(tech.id, appointment_at, ticket.estimated_minutes, bookings(db), config, ticket.id):
        raise conflict("Kỹ thuật viên bị trùng lịch ở khung giờ này (BR-04).")
    ticket.assignments.append(
        Assignment(tech_id=tech.id, appointment_at=appointment_at, assigned_at=now, deadline=response_deadline(now, config))
    )
    transition(db, ticket, Status.DA_PHAN_CONG, user, f"Phân công {tech.user.name}", notified_separately=(tech.user_id,))
    notify(
        db,
        [tech.user_id],
        "Việc mới được phân công",
        f"Bạn được phân công phiếu {ticket.id}. Vui lòng phản hồi trong {config.tech_response_minutes} phút.",
        ticket.id,
    )
    return ticket


def list_payments(db: Session, user: User) -> list[Ticket]:
    """Mọi khoản đang chờ xử lý, kèm các khoản đã xong gần đây."""
    require_roles(user, "DPV", "QTV")
    base = select(Ticket).join(Payment, Payment.ticket_id == Ticket.id).order_by(Payment.paid_at.desc().nulls_last())
    pending = db.scalars(base.where(Payment.status.in_(PENDING_PAYMENT_STATUSES))).all()
    done = db.scalars(base.where(Payment.status.in_(DONE_PAYMENT_STATUSES)).limit(RECENT_PAYMENTS)).all()
    return [*pending, *done]


def confirm_transfer(db: Session, user: User, ticket_id: str) -> Ticket:
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id, lock=True)
    payment = ticket.payment
    if payment is None or payment.status != "CHO_XAC_NHAN":
        raise conflict("Khoản chuyển khoản này không chờ xác nhận.")
    payment.status = "DA_XAC_NHAN"
    payment.confirmed_by = user.id
    payment.confirmed_by_name = user.name
    payment.confirmed_at = utcnow()
    complete(db, ticket, user, "Đã xác nhận chuyển khoản", load_config(db))
    return ticket


def reconcile_cash(db: Session, user: User, ticket_id: str) -> Ticket:
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id, lock=True)
    payment = ticket.payment
    if payment is None or payment.status != "DA_THU":
        raise conflict("Khoản tiền mặt này không chờ đối soát.")
    payment.status = "DA_DOI_SOAT"
    payment.reconciled_by = user.id
    payment.reconciled_at = utcnow()
    audit(db, user, "DOI_SOAT_TIEN_MAT", ticket.id)
    return ticket


def list_claims(db: Session, user: User) -> list[WarrantyClaim]:
    require_roles(user, "DPV", "QTV")
    return list(db.scalars(select(WarrantyClaim).order_by(WarrantyClaim.created_at.desc())))


def decide_claim(db: Session, user: User, claim_id: int, valid: bool, reason: str) -> WarrantyClaim:
    """BR-07: chỉ chấp nhận khi còn hạn; phiếu bảo hành hợp lệ không tính phí."""
    require_roles(user, "DPV")
    claim = db.get(WarrantyClaim, claim_id, with_for_update=True)
    if claim is None:
        raise not_found("Không tìm thấy yêu cầu bảo hành.")
    if claim.status != "CHO_XU_LY":
        raise conflict("Yêu cầu không còn chờ xử lý.")
    warranty = claim.warranty
    if valid:
        if not warranty_status(warranty.end_at, utcnow())["valid"]:
            raise conflict("Bảo hành đã hết hạn, không thể chấp nhận (BR-07).")
        original = db.get(Ticket, warranty.ticket_id)
        customer = db.get(User, claim.customer_id)
        new_ticket = create_ticket_record(
            db,
            customer=customer,
            device_id=warranty.device_id,
            description=f"[Bảo hành {warranty.name}] {claim.description}",
            address=original.address,
            ward=original.ward,
            slot_start=claim.slot_start,
            category_code=original.category_code,
            actor_name=user.name,
            is_warranty=True,
            warranty_of=warranty.ticket_id,
            note=f"Bảo hành cho phiếu {warranty.ticket_id}",
        )
        claim.status = "HOP_LE"
        claim.new_ticket_id = new_ticket.id
        notify(
            db,
            [claim.customer_id],
            "Yêu cầu bảo hành được chấp nhận",
            f"Đã tạo phiếu bảo hành {new_ticket.id}, không tính phí.",
            new_ticket.id,
        )
    else:
        if not reason.strip():
            raise ApiError("Vui lòng ghi lý do từ chối.")
        claim.status = "TU_CHOI"
        claim.reason = reason.strip()
        notify(db, [claim.customer_id], "Yêu cầu bảo hành bị từ chối", f'"{warranty.name}": {claim.reason}')
    claim.decided_by = user.name
    claim.decided_at = utcnow()
    audit(db, user, "XU_LY_BAO_HANH", str(claim.id), "Hợp lệ" if valid else f"Từ chối: {claim.reason}")
    return claim
