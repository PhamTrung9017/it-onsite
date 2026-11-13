"""Lệnh xem nhanh trong bot: /viec cho kỹ thuật viên, /tongquan cho quản trị viên và điều phối viên, /trogiup.

Chỉ đọc dữ liệu, không thay đổi phiếu. Tin trả lời không ghi số điện thoại, địa chỉ của khách nên dùng được cả trong nhóm chung.
"""

from datetime import datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.domain.status import STATUS_LABEL, DepositStatus, Status
from app.models import Assignment, Deposit, Payment, Ticket, TicketHistory, User
from app.services import telegram
from app.services.common import money, tech_of_user, utcnow
from app.services.reports import _completed_between, _forfeited_between, _revenue

MANAGERS = {"QTV", "DPV"}
IN_PROGRESS = [
    Status.KTV_DA_NHAN,
    Status.DANG_KHAO_SAT,
    Status.CHO_DUYET_BAO_GIA,
    Status.DANG_THUC_HIEN,
    Status.CHO_NGHIEM_THU,
    Status.CHO_THANH_TOAN,
]
WAITING_PAYMENT = ["CHO_XAC_NHAN", "DA_THU"]


def command_of(text: str) -> str | None:
    """ "/viec", "/viec@ten_bot" → "viec"; tin không phải lệnh → None."""
    if not text.startswith("/"):
        return None
    return text[1:].split(maxsplit=1)[0].split("@")[0].lower()


def help_text(user: User) -> str:
    lines = ["Các lệnh của bot IT OnSite:"]
    if "KTV" in user.roles:
        lines.append("/viec – việc hôm nay của bạn")
    if MANAGERS & set(user.roles):
        lines.append("/tongquan – tổng quan phiếu và doanh thu hôm nay")
    lines.append("/trogiup – xem lại danh sách lệnh")
    return "\n".join(lines)


def _today(now: datetime) -> tuple[datetime, datetime]:
    """Đầu và cuối ngày hôm nay theo giờ Việt Nam."""
    tz = get_settings().tz
    start = datetime.combine(now.astimezone(tz).date(), time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def jobs_today(db: Session, user: User) -> str:
    if "KTV" not in user.roles:
        return "Lệnh /viec dành cho kỹ thuật viên."
    tech = tech_of_user(db, user)
    if tech is None:
        return "Tài khoản chưa gắn với hồ sơ kỹ thuật viên."
    now = utcnow()
    start, end = _today(now)
    tickets = db.scalars(
        select(Ticket)
        .join(Assignment, Assignment.ticket_id == Ticket.id)
        .where(Assignment.tech_id == tech.id, Assignment.appointment_at >= start, Assignment.appointment_at < end)
        .where(Ticket.status.not_in([Status.DA_HUY, Status.DA_TIEP_NHAN]))
        .order_by(Assignment.appointment_at)
    ).all()
    mine = [t for t in tickets if t.assignment and t.assignment.tech_id == tech.id]
    waiting = db.scalar(
        select(func.count())
        .select_from(Ticket)
        .join(Assignment, Assignment.ticket_id == Ticket.id)
        .where(Assignment.tech_id == tech.id, Ticket.status == Status.DA_PHAN_CONG, Assignment.result.is_(None))
    )
    day = start.strftime("%d/%m")
    lines = [f"Việc hôm nay {day} của {user.name}:" if mine else f"Hôm nay {day} bạn chưa có việc nào."]
    lines += [f"• {telegram.job_summary(db, t)} · {STATUS_LABEL[Status(t.status)]}" for t in mine]
    if waiting:
        lines.append(f"\nĐang chờ bạn phản hồi: {waiting} việc (bấm Nhận việc / Từ chối trong tin phân công).")
    lines.append(f"\nXem chi tiết: {get_settings().app_url.rstrip('/')}/ktv/lich-viec")
    return "\n".join(lines)


def _count(db: Session, query) -> int:
    return db.scalar(select(func.count()).select_from(query.subquery())) or 0


def overview_today(db: Session, user: User) -> str:
    if not MANAGERS & set(user.roles):
        return "Lệnh /tongquan dành cho quản trị viên và điều phối viên."
    now = utcnow()
    start, end = _today(now)

    def by_status(*statuses: Status) -> int:
        return _count(db, select(Ticket.id).where(Ticket.status.in_(statuses)))

    created = _count(db, select(Ticket.id).where(Ticket.created_at >= start, Ticket.created_at < end))
    completed = _completed_between(db, start, end)
    cancelled = _count(
        db,
        select(TicketHistory.ticket_id)
        .where(TicketHistory.status == Status.DA_HUY, TicketHistory.at >= start, TicketHistory.at < end)
        .distinct(),
    )
    revenue = _revenue(completed, _forfeited_between(db, start, end))
    deposits = _count(db, select(Deposit.ticket_id).where(Deposit.status.in_([DepositStatus.CHO_XAC_NHAN, DepositStatus.CHO_HOAN])))
    payments = _count(db, select(Payment.ticket_id).where(Payment.status.in_(WAITING_PAYMENT)))
    return "\n".join(
        [
            f"Tổng quan hôm nay {start.strftime('%d/%m')} (lúc {telegram.local_time(now)[:5]}):",
            f"• Phiếu mới tạo: {created}",
            f"• Chờ tiếp nhận: {by_status(Status.MOI)} · Chờ phân công: {by_status(Status.DA_TIEP_NHAN)}"
            f" · Chờ KTV nhận: {by_status(Status.DA_PHAN_CONG)}",
            f"• Đang xử lý: {by_status(*IN_PROGRESS)}",
            f"• Hoàn tất hôm nay: {len(completed)} · Hủy hôm nay: {cancelled}",
            f"• Doanh thu hôm nay: {money(revenue)}",
            f"• Chờ đối soát: {deposits} phí giữ lịch, {payments} khoản thanh toán",
        ]
    )


def answer(db: Session, user: User, command: str) -> str:
    if command == "viec":
        return jobs_today(db, user)
    if command == "tongquan":
        return overview_today(db, user)
    return help_text(user)
