"""Phí giữ lịch (BR-02, BR-03): phí khảo sát khách chuyển khoản trước khi cửa hàng tiếp nhận phiếu."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import conflict, forbidden
from app.domain.rules import BusinessConfig, deposit_deadline
from app.domain.status import DEPOSIT_RECEIVED, DepositStatus, Status
from app.domain.vietqr import build_vietqr, sanitize_content
from app.models import Deposit, Ticket, User
from app.services.common import (
    SYSTEM_NAME,
    add_history,
    audit,
    dispatcher_ids,
    find_ticket,
    load_config,
    money,
    notify,
    require_roles,
    touch,
    transition,
    utcnow,
)

PENDING = (DepositStatus.CHO_XAC_NHAN, DepositStatus.CHO_HOAN)
RECENT = 40


def open_deposit(ticket: Ticket, config: BusinessConfig) -> None:
    """Phiếu thường phải trả phí giữ lịch; phiếu bảo hành hợp lệ thì không."""
    if not ticket.is_warranty and config.survey_fee > 0:
        ticket.deposit = Deposit(amount=config.survey_fee, status=DepositStatus.CHO_THANH_TOAN)


def deposit_content(ticket: Ticket) -> str:
    return sanitize_content(f"ITONSITE {ticket.id} GL")


def deposit_info(db: Session, user: User, ticket: Ticket) -> dict:
    config = load_config(db)
    deposit = ticket.deposit
    content = deposit_content(ticket)
    return {
        "amount": deposit.amount,
        "status": deposit.status,
        "deadline": deposit_deadline(ticket.created_at, config),
        "content": content,
        "bank": config.to_dict()["bank"],
        "qrPayload": build_vietqr(config.bank_bin, config.bank_account_number, deposit.amount, content),
    }


def _customer_deposit(db: Session, user: User, ticket_id: str) -> Ticket:
    require_roles(user, "KHACH")
    ticket = find_ticket(db, ticket_id, lock=True)
    if ticket.customer_id != user.id:
        raise forbidden("Bạn không có quyền thao tác trên phiếu này.")
    if ticket.deposit is None:
        raise conflict("Phiếu này không cần trả phí giữ lịch.")
    return ticket


def get_deposit(db: Session, user: User, ticket_id: str) -> dict:
    ticket = _customer_deposit(db, user, ticket_id)
    return deposit_info(db, user, ticket)


def report_transfer(db: Session, user: User, ticket_id: str) -> Ticket:
    """Khách báo đã chuyển phí giữ lịch."""
    ticket = _customer_deposit(db, user, ticket_id)
    deposit = ticket.deposit
    if ticket.status != Status.MOI or deposit.status != DepositStatus.CHO_THANH_TOAN:
        raise conflict("Phí giữ lịch của phiếu này không chờ thanh toán.")
    deposit.status = DepositStatus.CHO_XAC_NHAN
    deposit.reported_at = utcnow()
    touch(ticket)
    notify(
        db,
        dispatcher_ids(db),
        "Khách báo đã chuyển phí giữ lịch",
        f"Phiếu {ticket.id}: {money(deposit.amount)} cần đối chiếu sao kê trước khi tiếp nhận.",
        ticket.id,
    )
    return ticket


def confirm(db: Session, user: User, ticket_id: str) -> Ticket:
    """Điều phối viên đối chiếu sao kê, xác nhận đã nhận phí giữ lịch."""
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id, lock=True)
    deposit = ticket.deposit
    if ticket.status != Status.MOI or deposit is None or deposit.status not in (DepositStatus.CHO_THANH_TOAN, DepositStatus.CHO_XAC_NHAN):
        raise conflict("Phí giữ lịch của phiếu này không chờ xác nhận.")
    deposit.status = DepositStatus.DA_XAC_NHAN
    deposit.confirmed_at = utcnow()
    deposit.confirmed_by_name = user.name
    touch(ticket)
    add_history(ticket, ticket.status, user.name, f"Đã nhận phí giữ lịch {money(deposit.amount)}")
    audit(db, user, "XAC_NHAN_PHI_GIU_LICH", ticket.id, money(deposit.amount))
    notify(db, [ticket.customer_id], "Đã nhận phí giữ lịch", f"Cửa hàng đã nhận {money(deposit.amount)} cho phiếu {ticket.id}.", ticket.id)
    return ticket


def settle_on_cancel(ticket: Ticket, forfeit: bool) -> int:
    """Xử lý phí giữ lịch khi phiếu bị hủy; trả về số tiền khách mất."""
    deposit = ticket.deposit
    if deposit is None:
        return 0
    now = utcnow()
    if deposit.status == DepositStatus.DA_XAC_NHAN and forfeit:
        deposit.status = DepositStatus.KHONG_HOAN
        deposit.settled_at = now
        return deposit.amount
    if deposit.status in DEPOSIT_RECEIVED:
        deposit.status = DepositStatus.CHO_HOAN
    elif deposit.status == DepositStatus.CHO_THANH_TOAN:
        deposit.status = DepositStatus.KHONG_PHAT_SINH
        deposit.settled_at = now
    return 0


def refund(db: Session, user: User, ticket_id: str, received: bool) -> Ticket:
    """Điều phối viên chuyển trả phí giữ lịch, hoặc ghi nhận khách báo chuyển nhưng cửa hàng không nhận được tiền."""
    require_roles(user, "DPV")
    ticket = find_ticket(db, ticket_id, lock=True)
    deposit = ticket.deposit
    if deposit is None or deposit.status != DepositStatus.CHO_HOAN:
        raise conflict("Phí giữ lịch của phiếu này không chờ hoàn.")
    deposit.status = DepositStatus.DA_HOAN if received else DepositStatus.KHONG_PHAT_SINH
    deposit.settled_at = utcnow()
    deposit.settled_by_name = user.name
    touch(ticket)
    if received:
        add_history(ticket, ticket.status, user.name, f"Đã hoàn phí giữ lịch {money(deposit.amount)}")
        notify(
            db,
            [ticket.customer_id],
            "Đã hoàn phí giữ lịch",
            f"Cửa hàng đã chuyển trả {money(deposit.amount)} của phiếu {ticket.id}.",
            ticket.id,
        )
    audit(db, user, "HOAN_PHI_GIU_LICH" if received else "KHONG_NHAN_PHI_GIU_LICH", ticket.id, money(deposit.amount))
    return ticket


def list_deposits(db: Session, user: User) -> list[Ticket]:
    """Khoản cần xử lý (chờ xác nhận, chờ hoàn) trước, sau đó các khoản đã xử lý gần đây."""
    require_roles(user, "DPV", "QTV")
    base = select(Ticket).join(Deposit, Deposit.ticket_id == Ticket.id)
    pending = db.scalars(base.where(Deposit.status.in_(PENDING)).order_by(Ticket.created_at)).all()
    done = db.scalars(
        base.where(Deposit.status.in_((DepositStatus.DA_XAC_NHAN, DepositStatus.DA_HOAN, DepositStatus.KHONG_HOAN)))
        .order_by(Deposit.confirmed_at.desc().nulls_last())
        .limit(RECENT)
    ).all()
    return [*pending, *done]


def sweep_unpaid(db: Session) -> int:
    """Phiếu quá hạn mà khách chưa chuyển phí giữ lịch thì tự hủy."""
    config = load_config(db)
    now = utcnow()
    unpaid = db.scalars(
        select(Ticket)
        .join(Deposit, Deposit.ticket_id == Ticket.id)
        .where(Ticket.status == Status.MOI, Deposit.status == DepositStatus.CHO_THANH_TOAN)
        .with_for_update(of=Ticket, skip_locked=True)
    ).all()
    expired = [t for t in unpaid if deposit_deadline(t.created_at, config) < now]
    for ticket in expired:
        settle_on_cancel(ticket, forfeit=False)
        reason = "Quá hạn thanh toán phí giữ lịch"
        ticket.cancel = {"by": None, "byName": SYSTEM_NAME, "reason": reason, "fee": 0, "at": now.isoformat()}
        transition(db, ticket, Status.DA_HUY, None, reason)
    return len(expired)
