"""Báo cáo thống kê (UC21) và dữ liệu xuất file Excel cho quản trị viên."""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.status import STATUS_LABEL, DepositStatus, Status
from app.models import Assignment, Category, Deposit, Payment, Technician, Ticket, User
from app.services.common import load_config, main_quote_rejected, require_roles, ticket_revenue, utcnow
from app.services.present import iso

ALLOWED_DAYS = (7, 30, 90)
MAX_RANGE_DAYS = 366
OPEN_PAYMENT_STATUSES = ("CHO_THANH_TOAN", "CHO_XAC_NHAN", "DA_THU")


@dataclass
class Period:
    kind: str
    start: datetime
    end: datetime
    prev_start: datetime
    prev_end: datetime

    def contains(self, value: datetime | None) -> bool:
        return value is not None and self.start <= value < self.end

    def to_dict(self, now: datetime) -> dict:
        return {"kind": self.kind, "from": iso(self.start), "to": iso(min(self.end, now))}


@dataclass
class ReportFilter:
    """Lọc báo cáo theo kỹ thuật viên phụ trách, loại sự cố, phường."""

    tech_id: int | None = None
    category: str | None = None
    ward: str | None = None

    def matches(self, ticket: Ticket) -> bool:
        if self.tech_id is not None and not (ticket.assignment and ticket.assignment.tech_id == self.tech_id):
            return False
        if self.category and ticket.category_code != self.category:
            return False
        return not self.ward or ticket.ward == self.ward

    def apply(self, tickets) -> list[Ticket]:
        return [t for t in tickets if self.matches(t)]

    def to_dict(self) -> dict:
        return {"techId": self.tech_id, "category": self.category, "ward": self.ward}


def _day(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(f"{label} không hợp lệ.") from exc


def _period(days: int | None, month: str | None, now: datetime, date_from: str | None = None, date_to: str | None = None) -> Period:
    """Kỳ báo cáo theo giờ Việt Nam: N ngày gần nhất tính cả hôm nay, một tháng dương lịch, hoặc khoảng ngày tùy chọn (tính cả hai đầu).

    Kỳ trước để so sánh là khoảng cùng độ dài liền trước.
    """
    tz = get_settings().tz
    if date_from or date_to:
        if not (date_from and date_to):
            raise ApiError("Chọn đủ ngày bắt đầu và ngày kết thúc.")
        first, last = _day(date_from, "Ngày bắt đầu"), _day(date_to, "Ngày kết thúc")
        if first > last:
            raise ApiError("Ngày bắt đầu phải trước ngày kết thúc.")
        if (last - first).days + 1 > MAX_RANGE_DAYS:
            raise ApiError(f"Khoảng thời gian báo cáo tối đa {MAX_RANGE_DAYS} ngày.")
        start = datetime(first.year, first.month, first.day, tzinfo=tz)
        if start > now:
            raise ApiError("Chưa có số liệu cho khoảng thời gian này.")
        end = datetime(last.year, last.month, last.day, tzinfo=tz) + timedelta(days=1)
        return Period("range", start, end, start - (end - start), start)
    if month:
        if not re.fullmatch(r"\d{4}-\d{2}", month) or not 1 <= int(month[5:]) <= 12:
            raise ApiError("Tháng báo cáo không hợp lệ.")
        year, number = int(month[:4]), int(month[5:])
        start = datetime(year, number, 1, tzinfo=tz)
        if start > now:
            raise ApiError("Chưa có số liệu cho tháng này.")
        end = datetime(year + number // 12, number % 12 + 1, 1, tzinfo=tz)
        prev_start = datetime(year - (number == 1), (number - 2) % 12 + 1, 1, tzinfo=tz)
        return Period("month", start, end, prev_start, start)
    if days not in ALLOWED_DAYS:
        raise ApiError("Khoảng thời gian báo cáo không hợp lệ.")
    today = now.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)
    return Period("days", start, now, start - timedelta(days=days), start)


def _deposit_applied(ticket: Ticket) -> int:
    deposit = ticket.deposit
    return deposit.amount if deposit and deposit.status == DepositStatus.DA_TRU else 0


def _revenue(tickets: list[Ticket], forfeited: list[Ticket] = ()) -> int:
    return sum(ticket_revenue(t) for t in tickets) + sum(t.deposit.amount for t in forfeited)


def _avg_hours(tickets: list[Ticket]) -> float:
    if not tickets:
        return 0
    return sum((t.completed_at - t.created_at).total_seconds() for t in tickets) / len(tickets) / 3600


def _work_done_at(ticket: Ticket) -> datetime | None:
    """Lúc kỹ thuật viên báo hoàn thành lần cuối (chuyển sang chờ nghiệm thu)."""
    return max((h.at for h in ticket.history if h.status == Status.CHO_NGHIEM_THU), default=None)


def _onsite_hours(tickets: list[Ticket]) -> float | None:
    """Thời gian xử lý tại nhà khách: từ lúc check-in tới lúc báo hoàn thành."""
    spans = [(done - t.check_in_at).total_seconds() for t in tickets if t.check_in_at and (done := _work_done_at(t))]
    return sum(spans) / len(spans) / 3600 if spans else None


def _avg_stars(tickets: list[Ticket]) -> float | None:
    reviewed = [t.review.stars for t in tickets if t.review]
    return sum(reviewed) / len(reviewed) if reviewed else None


def _completed_between(db: Session, start: datetime, end: datetime) -> list[Ticket]:
    query = select(Ticket).where(Ticket.status == Status.HOAN_TAT, Ticket.completed_at >= start, Ticket.completed_at < end)
    return list(db.scalars(query))


def _forfeited_between(db: Session, start: datetime, end: datetime) -> list[Ticket]:
    """Phiếu hủy có phí giữ lịch không hoàn, tính theo thời điểm hủy."""
    query = (
        select(Ticket)
        .join(Deposit, Deposit.ticket_id == Ticket.id)
        .where(Deposit.status == DepositStatus.KHONG_HOAN, Deposit.settled_at >= start, Deposit.settled_at < end)
    )
    return list(db.scalars(query))


def report(
    db: Session,
    user: User,
    days: int | None = None,
    month: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    flt: ReportFilter | None = None,
) -> dict:
    """Doanh thu, phiếu hoàn tất, thời gian xử lý, đánh giá tính theo ngày hoàn tất; số phiếu tạo, hủy tính theo ngày tạo.

    Doanh thu gồm cả phí giữ lịch không hoàn của phiếu bị hủy, tính theo ngày hủy.
    """
    require_roles(user, "QTV")
    now = utcnow()
    period = _period(days, month, now, date_from, date_to)
    flt = flt or ReportFilter()
    tz = get_settings().tz
    created = flt.apply(db.scalars(select(Ticket).where(Ticket.created_at >= period.start, Ticket.created_at < period.end)))
    completed = flt.apply(_completed_between(db, period.start, period.end))
    completed_prev = flt.apply(_completed_between(db, period.prev_start, period.prev_end))
    forfeited = flt.apply(_forfeited_between(db, period.start, period.end))
    forfeited_prev = flt.apply(_forfeited_between(db, period.prev_start, period.prev_end))

    by_day = []
    day = period.start.astimezone(tz)
    while day < min(period.end, now):
        next_day = day + timedelta(days=1)
        revenue = _revenue(
            [t for t in completed if day <= t.completed_at < next_day],
            [t for t in forfeited if day <= t.deposit.settled_at < next_day],
        )
        by_day.append({"date": day.isoformat(), "revenue": revenue})
        day = next_day

    categories = db.scalars(select(Category).order_by(Category.position)).all()
    by_category = sorted(
        ({"name": c.name, "count": sum(1 for t in created if t.category_code == c.code)} for c in categories),
        key=lambda x: -x["count"],
    )
    by_tech = []
    for tech in db.scalars(select(Technician).order_by(Technician.id)):
        if flt.tech_id is not None and tech.id != flt.tech_id:
            continue
        mine = [t for t in completed if t.assignment and t.assignment.tech_id == tech.id]
        if mine:
            by_tech.append({"name": tech.user.name, "done": len(mine), "rating": _avg_stars(mine), "revenue": _revenue(mine)})
    created_done = sum(1 for t in created if t.status == Status.HOAN_TAT)
    return {
        "period": period.to_dict(now),
        "filter": flt.to_dict(),
        "revenue": _revenue(completed, forfeited),
        "revenuePrev": _revenue(completed_prev, forfeited_prev),
        "forfeitedDeposits": sum(t.deposit.amount for t in forfeited),
        "done": len(completed),
        "donePrev": len(completed_prev),
        "avgHours": _avg_hours(completed),
        "avgHoursPrev": _avg_hours(completed_prev),
        "onsiteHours": _onsite_hours(completed),
        "onsiteHoursPrev": _onsite_hours(completed_prev),
        "completionRate": created_done / len(created) * 100 if created else None,
        "rating": _avg_stars(completed),
        "reviewCount": sum(1 for t in completed if t.review),
        "cancelled": sum(1 for t in created if t.status == Status.DA_HUY),
        "total": len(created),
        "byDay": by_day,
        "byStatus": [{"status": s.value, "count": n} for s in STATUS_LABEL if (n := sum(1 for t in created if t.status == s))],
        "byCategory": [c for c in by_category if c["count"]],
        "byTech": by_tech,
    }


def _amounts(ticket: Ticket) -> dict:
    """Tách số tiền của phiếu: tiền công dịch vụ, linh kiện, phí khảo sát (khách từ chối báo giá chính)."""
    items = [item for quote in ticket.quotes if quote.status in ("DA_DUYET", "DUYET_MOT_PHAN") for item in quote.items if item.selected]
    service = sum(i.unit_price * i.qty for i in items if i.kind == "service")
    parts = sum(i.unit_price * i.qty for i in items if i.kind == "part")
    survey = 0
    if ticket.status == Status.HOAN_TAT and main_quote_rejected(ticket) and not ticket.is_warranty:
        survey = ticket_revenue(ticket)
    return {
        "serviceAmount": service,
        "partsAmount": parts,
        "surveyFee": survey,
        "parts": [{"name": i.name, "qty": i.qty, "unitPrice": i.unit_price} for i in items if i.kind == "part"],
    }


def export_data(
    db: Session,
    user: User,
    days: int | None = None,
    month: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    flt: ReportFilter | None = None,
) -> dict:
    """Dữ liệu từng phiếu liên quan tới kỳ báo cáo để lập file Excel (tổng hợp, lương kỹ thuật viên, đối soát)."""
    require_roles(user, "QTV")
    now = utcnow()
    period = _period(days, month, now, date_from, date_to)
    flt = flt or ReportFilter()
    config = load_config(db)
    start, end = period.start, period.end
    assigned = select(Assignment.ticket_id).where(Assignment.assigned_at >= start, Assignment.assigned_at < end)
    open_payment = select(Payment.ticket_id).where(Payment.status.in_(OPEN_PAYMENT_STATUSES))
    settled = select(Deposit.ticket_id).where(Deposit.settled_at >= start, Deposit.settled_at < end)
    tickets = db.scalars(
        select(Ticket)
        .where(
            or_(
                (Ticket.created_at >= start) & (Ticket.created_at < end),
                (Ticket.completed_at >= start) & (Ticket.completed_at < end),
                Ticket.id.in_(assigned),
                Ticket.id.in_(open_payment),
                Ticket.id.in_(settled),
            )
        )
        .order_by(Ticket.created_at.desc())
    ).all()
    categories = {c.code: c.name for c in db.scalars(select(Category))}
    technicians = list(db.scalars(select(Technician).order_by(Technician.id)))
    names = {t.id: t.user.name for t in technicians}
    rows = []
    for t in flt.apply(tickets):
        payment = t.payment
        deposit = t.deposit
        rows.append(
            {
                "id": t.id,
                "createdAt": iso(t.created_at),
                "completedAt": iso(t.completed_at),
                "customer": t.customer.name,
                "ward": t.ward,
                "category": categories.get(t.category_code, ""),
                "urgency": t.urgency,
                "status": t.status,
                "isWarranty": t.is_warranty,
                "techId": t.assignment.tech_id if t.assignment else None,
                "appointmentAt": iso(t.assignment.appointment_at if t.assignment else t.slot_start),
                "checkInAt": iso(t.check_in_at),
                "workDoneAt": iso(_work_done_at(t)),
                **_amounts(t),
                "amount": ticket_revenue(t) if payment else None,
                "depositApplied": _deposit_applied(t),
                "deposit": deposit
                and {
                    "amount": deposit.amount,
                    "status": deposit.status,
                    "confirmedAt": iso(deposit.confirmed_at),
                    "settledAt": iso(deposit.settled_at),
                },
                "cancel": t.cancel,
                "payment": payment
                and {
                    "amount": payment.amount,
                    "method": payment.method,
                    "status": payment.status,
                    "paidAt": iso(payment.paid_at),
                    "confirmedAt": iso(payment.confirmed_at),
                    "reconciledAt": iso(payment.reconciled_at),
                },
                "review": t.review and {"stars": t.review.stars, "comment": t.review.comment, "at": iso(t.review.at)},
                "assignments": [
                    {"techId": a.tech_id, "assignedAt": iso(a.assigned_at), "result": a.result, "respondedAt": iso(a.responded_at)}
                    for a in t.assignments
                ],
            }
        )
    return {
        "period": period.to_dict(now),
        "filter": flt.to_dict(),
        "payroll": {"baseSalary": config.base_salary, "commissionPercent": config.commission_percent},
        "technicians": [{"id": t.id, "name": names[t.id], "active": t.active} for t in technicians],
        "tickets": rows,
    }
