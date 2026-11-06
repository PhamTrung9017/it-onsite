"""Mở bước thanh toán và hoàn tất phiếu: phát hành bảo hành, gửi biên nhận, báo nhóm chung."""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.domain.rules import BusinessConfig
from app.domain.status import DepositStatus, Status
from app.models import Payment, Technician, Ticket, User, Warranty
from app.services import telegram
from app.services.common import amount_due, notify, transition, utcnow
from app.services.receipts import send_receipt


def open_payment(db: Session, ticket: Ticket, actor: User, config: BusinessConfig) -> None:
    """Mở bước thanh toán; phí giữ lịch được trừ vào số tiền. Không còn phải trả thêm thì phiếu hoàn tất luôn."""
    amount = amount_due(ticket, config)
    if ticket.deposit and ticket.deposit.status == DepositStatus.DA_XAC_NHAN:
        ticket.deposit.status = DepositStatus.DA_TRU
        ticket.deposit.settled_at = utcnow()
    if amount > 0:
        ticket.payment = Payment(amount=amount, method=None, status="CHO_THANH_TOAN")
        return
    ticket.payment = Payment(amount=0, method=None, status="MIEN_PHI", paid_at=utcnow())
    complete(db, ticket, actor, "Đã trừ phí giữ lịch, không phải trả thêm" if ticket.deposit else "Không phát sinh chi phí", config)


def complete(db: Session, ticket: Ticket, actor: User, note: str, config: BusinessConfig) -> None:
    """Hoàn tất phiếu và phát hành bảo hành theo từng hạng mục đã duyệt (BR-07).

    Phiếu bảo hành không phát hành bảo hành mới, thời hạn vẫn tính theo phiếu gốc.
    """
    transition(db, ticket, Status.HOAN_TAT, actor, note, notified_separately=(ticket.customer_id,))
    now = utcnow()
    ticket.completed_at = now
    for quote in [] if ticket.is_warranty else ticket.quotes:
        if quote.status not in ("DA_DUYET", "DUYET_MOT_PHAN"):
            continue
        for item in quote.items:
            if item.selected and item.warranty_days > 0:
                db.add(
                    Warranty(
                        ticket_id=ticket.id,
                        quote_item_id=item.id,
                        device_id=ticket.device_id,
                        customer_id=ticket.customer_id,
                        name=item.name,
                        start_at=now,
                        end_at=now + timedelta(days=item.warranty_days),
                    )
                )
    notify(
        db,
        [ticket.customer_id],
        "Phiếu đã hoàn tất",
        f"Cảm ơn bạn! Phiếu {ticket.id} đã hoàn tất. Bạn có thể đánh giá dịch vụ trong {config.review_window_days} ngày.",
        ticket.id,
        email=False,
    )
    send_receipt(db, ticket)
    tech = db.get(Technician, ticket.assignment.tech_id) if ticket.assignment else None
    telegram.post_group(db, f"Phiếu {ticket.id} đã hoàn tất" + (f" ({tech.user.name})." if tech else "."))
