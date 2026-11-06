"""Email biên nhận gửi khách khi phiếu hoàn tất (UC06)."""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.domain.status import DepositStatus
from app.models import OutboxMessage, Technician, Ticket
from app.services.common import main_quote_rejected, money, utcnow

METHOD_LABEL = {"TIEN_MAT": "Tiền mặt", "CHUYEN_KHOAN": "Chuyển khoản VietQR"}


def _local(value: datetime, fmt: str) -> str:
    return value.astimezone(get_settings().tz).strftime(fmt)


def receipt_lines(ticket: Ticket, completed_at: datetime) -> list[str]:
    """Hạng mục đã duyệt kèm thời hạn bảo hành; khách từ chối báo giá thì chỉ có phí khảo sát."""
    lines = []
    for quote in ticket.quotes:
        if quote.status not in ("DA_DUYET", "DUYET_MOT_PHAN"):
            continue
        for item in quote.items:
            if not item.selected:
                continue
            warranty = "không bảo hành"
            if item.warranty_days and not ticket.is_warranty:
                end = _local(completed_at + timedelta(days=item.warranty_days), "%d/%m/%Y")
                warranty = f"bảo hành {item.warranty_days} ngày, đến {end}"
            lines.append(f"- {item.name} × {item.qty}: {money(item.unit_price * item.qty)} ({warranty})")
    return lines


def receipt_body(ticket: Ticket, tech_name: str | None) -> str:
    customer, device, payment, deposit = ticket.customer, ticket.device, ticket.payment, ticket.deposit
    completed_at = ticket.completed_at or utcnow()
    prepaid = deposit.amount if deposit and deposit.status == DepositStatus.DA_TRU else 0
    paid = payment.amount if payment else 0
    lines = receipt_lines(ticket, completed_at)
    if main_quote_rejected(ticket) and paid + prepaid > 0:
        lines.append(f"- Phí khảo sát (khách từ chối báo giá): {money(paid + prepaid)}")
    if not lines:
        lines.append("- Không có hạng mục tính phí" + (" (phiếu bảo hành)" if ticket.is_warranty else ""))
    totals = [f"Tổng tiền dịch vụ: {money(paid + prepaid)}"]
    if prepaid:
        totals.append(f"Phí giữ lịch đã trả trước: −{money(prepaid)}")
    method = METHOD_LABEL.get(payment.method, "") if payment else ""
    totals.append(f"Thanh toán khi hoàn tất: {money(paid)}" + (f" ({method})" if method and paid else ""))
    settings = get_settings()
    return "\n".join(
        [
            f"Chào {customer.name},",
            "",
            f"Phiếu {ticket.id} đã hoàn tất lúc {_local(completed_at, '%H:%M %d/%m/%Y')}. Cảm ơn bạn đã sử dụng dịch vụ IT OnSite.",
            "",
            "BIÊN NHẬN DỊCH VỤ",
            f"Số phiếu: {ticket.id}",
            f"Thiết bị: {device.type} {device.brand} {device.model}" if device else "Thiết bị: —",
            f"Địa chỉ: {ticket.address}, phường {ticket.ward}, TP. Hồ Chí Minh",
            f"Kỹ thuật viên: {tech_name or '—'}",
            "",
            "Nội dung:",
            *lines,
            "",
            *totals,
            "",
            f"Xem và in biên nhận: {settings.app_url}/khach/phieu/{ticket.id}/bien-nhan",
            "Bạn có thể đánh giá dịch vụ trên trang phiếu. Khi cần bảo hành, vui lòng gửi yêu cầu trong mục Bảo hành của tài khoản.",
            "",
            "Biên nhận xác nhận dịch vụ đã thực hiện và số tiền đã thanh toán; không thay thế hóa đơn giá trị gia tăng.",
        ]
    )


def send_receipt(db: Session, ticket: Ticket) -> None:
    """Khách có email thì nhận biên nhận qua email; không có email thì xem biên nhận trên web."""
    if not ticket.customer.email:
        return
    tech = db.get(Technician, ticket.assignment.tech_id) if ticket.assignment else None
    db.add(
        OutboxMessage(
            channel="email",
            recipient=ticket.customer.email,
            subject=f"[IT OnSite] Biên nhận dịch vụ phiếu {ticket.id}",
            body=receipt_body(ticket, tech.user.name if tech else None),
            next_attempt_at=utcnow(),
        )
    )
