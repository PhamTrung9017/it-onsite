"""Báo cáo thống kê (UC21) và dữ liệu xuất file Excel cho quản trị viên."""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.status import STATUS_LABEL, Status
from app.models import Assignment, Category, Payment, Technician, Ticket, User
from app.services.common import load_config, main_quote_rejected, require_roles, utcnow
from app.services.present import iso

ALLOWED_DAYS = (7, 30, 90)
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


def _period(days: int | None, month: str | None, now: datetime) -> Period:
    """Kỳ báo cáo theo giờ Việt Nam: N ngày gần nhất tính cả hôm nay, hoặc một tháng dương lịch."""
    if month:
        if not re.fullmatch(r"\d{4}-\d{2}", month) or not 1 <= int(month[5:]) <= 12:
            raise ApiError("Tháng báo cáo không hợp lệ.")
        tz = get_settings().tz
        year, number = int(month[:4]), int(month[5:])
        start = datetime(year, number, 1, tzinfo=tz)
        if start > now:
            raise ApiError("Chưa có số liệu cho tháng này.")
        end = datetime(year + number // 12, number % 12 + 1, 1, tzinfo=tz)
        prev_start = datetime(year - (number == 1), (number - 2) % 12 + 1, 1, tzinfo=tz)
        return Period("month", start, end, prev_start, start)
    if days not in ALLOWED_DAYS:
        raise ApiError("Khoảng thời gian báo cáo không hợp lệ.")
    today = now.astimezone(get_settings().tz).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)
    return Period("days", start, now, start - timedelta(days=days), start)


def _revenue(tickets: list[Ticket]) -> int:
    return sum(t.payment.amount for t in tickets if t.payment)


def _avg_hours(tickets: list[Ticket]) -> float:
    if not tickets:
        return 0
    return sum((t.completed_at - t.created_at).total_seconds() for t in tickets) / len(tickets) / 3600


def _avg_stars(tickets: list[Ticket]) -> float | None:
    reviewed = [t.review.stars for t in tickets if t.review]
    return sum(reviewed) / len(reviewed) if reviewed else None


def _completed_between(db: Session, start: datetime, end: datetime) -> list[Ticket]:
    query = select(Ticket).where(Ticket.status == Status.HOAN_TAT, Ticket.completed_at >= start, Ticket.completed_at < end)
    return list(db.scalars(query))


def report(db: Session, user: User, days: int | None = None, month: str | None = None) -> dict:
    """Doanh thu, phiếu hoàn tất, thời gian xử lý, đánh giá tính theo ngày hoàn tất; số phiếu tạo, hủy tính theo ngày tạo."""
    require_roles(user, "QTV")
    now = utcnow()
    period = _period(days, month, now)
    tz = get_settings().tz
    created = list(db.scalars(select(Ticket).where(Ticket.created_at >= period.start, Ticket.created_at < period.end)))
    completed = _completed_between(db, period.start, period.end)
    completed_prev = _completed_between(db, period.prev_start, period.prev_end)

    by_day = []
    day = period.start.astimezone(tz)
    while day < min(period.end, now):
        next_day = day + timedelta(days=1)
        by_day.append({"date": day.isoformat(), "revenue": _revenue([t for t in completed if day <= t.completed_at < next_day])})
        day = next_day

    categories = db.scalars(select(Category).order_by(Category.position)).all()
    by_category = sorted(
        ({"name": c.name, "count": sum(1 for t in created if t.category_code == c.code)} for c in categories),
        key=lambda x: -x["count"],
    )
    by_tech = []
    for tech in db.scalars(select(Technician).order_by(Technician.id)):
        mine = [t for t in completed if t.assignment and t.assignment.tech_id == tech.id]
        if mine:
            by_tech.append({"name": tech.user.name, "done": len(mine), "rating": _avg_stars(mine), "revenue": _revenue(mine)})
    return {
        "period": period.to_dict(now),
        "revenue": _revenue(completed),
        "revenuePrev": _revenue(completed_prev),
        "done": len(completed),
        "donePrev": len(completed_prev),
        "avgHours": _avg_hours(completed),
        "avgHoursPrev": _avg_hours(completed_prev),
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
    """Tách số tiền của phiếu: tiền công dịch vụ, linh kiện, phí khảo sát, phí đổi lịch sát giờ."""
    items = [item for quote in ticket.quotes if quote.status in ("DA_DUYET", "DUYET_MOT_PHAN") for item in quote.items if item.selected]
    service = sum(i.unit_price * i.qty for i in items if i.kind == "service")
    parts = sum(i.unit_price * i.qty for i in items if i.kind == "part")
    late_fee = ticket.late_reschedule_fee
    survey = 0
    if ticket.payment and main_quote_rejected(ticket) and not ticket.is_warranty:
        survey = max(ticket.payment.amount - late_fee, 0)
    return {
        "serviceAmount": service,
        "partsAmount": parts,
        "surveyFee": survey,
        "lateFee": late_fee,
        "parts": [{"name": i.name, "qty": i.qty, "unitPrice": i.unit_price} for i in items if i.kind == "part"],
    }


def export_data(db: Session, user: User, days: int | None = None, month: str | None = None) -> dict:
    """Dữ liệu từng phiếu liên quan tới kỳ báo cáo để lập file Excel (tổng hợp, lương kỹ thuật viên, đối soát)."""
    require_roles(user, "QTV")
    now = utcnow()
    period = _period(days, month, now)
    config = load_config(db)
    start, end = period.start, period.end
    assigned = select(Assignment.ticket_id).where(Assignment.assigned_at >= start, Assignment.assigned_at < end)
    open_payment = select(Payment.ticket_id).where(Payment.status.in_(OPEN_PAYMENT_STATUSES))
    tickets = db.scalars(
        select(Ticket)
        .where(
            or_(
                (Ticket.created_at >= start) & (Ticket.created_at < end),
                (Ticket.completed_at >= start) & (Ticket.completed_at < end),
                Ticket.id.in_(assigned),
                Ticket.id.in_(open_payment),
            )
        )
        .order_by(Ticket.created_at.desc())
    ).all()
    categories = {c.code: c.name for c in db.scalars(select(Category))}
    technicians = list(db.scalars(select(Technician).order_by(Technician.id)))
    names = {t.id: t.user.name for t in technicians}
    rows = []
    for t in tickets:
        payment = t.payment
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
                **_amounts(t),
                "amount": payment.amount if payment else None,
                "payment": payment
                and {
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
        "payroll": {"baseSalary": config.base_salary, "commissionPercent": config.commission_percent},
        "technicians": [{"id": t.id, "name": names[t.id], "active": t.active} for t in technicians],
        "tickets": rows,
    }
