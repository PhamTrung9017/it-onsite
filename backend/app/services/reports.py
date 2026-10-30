"""Báo cáo thống kê (UC21)."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.status import STATUS_LABEL, Status
from app.models import Category, Technician, Ticket, User
from app.services.common import require_roles, utcnow
from app.services.present import iso

ALLOWED_DAYS = (7, 30, 90)


def _revenue(tickets: list[Ticket]) -> int:
    return sum(t.payment.amount for t in tickets if t.status == Status.HOAN_TAT and t.payment)


def _done(tickets: list[Ticket]) -> list[Ticket]:
    return [t for t in tickets if t.status == Status.HOAN_TAT]


def _avg_hours(tickets: list[Ticket]) -> float:
    done = [t for t in _done(tickets) if t.completed_at]
    if not done:
        return 0
    return sum((t.completed_at - t.created_at).total_seconds() for t in done) / len(done) / 3600


def _avg_stars(tickets: list[Ticket]) -> float | None:
    reviewed = [t.review.stars for t in tickets if t.review]
    return sum(reviewed) / len(reviewed) if reviewed else None


def _check(user: User, days: int) -> None:
    require_roles(user, "QTV")
    if days not in ALLOWED_DAYS:
        raise ApiError("Khoảng thời gian báo cáo không hợp lệ.")


def report(db: Session, user: User, days: int) -> dict:
    _check(user, days)
    tz = get_settings().tz
    now = utcnow()
    since = now - timedelta(days=days)
    prev_since = since - timedelta(days=days)
    tickets = db.scalars(select(Ticket).where(Ticket.created_at >= prev_since)).all()
    current = [t for t in tickets if t.created_at >= since]
    previous = [t for t in tickets if t.created_at < since]

    today = now.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    completed = db.scalars(
        select(Ticket).where(Ticket.status == Status.HOAN_TAT, Ticket.completed_at >= today - timedelta(days=days))
    ).all()
    by_day = []
    for offset in range(days - 1, -1, -1):
        start = today - timedelta(days=offset)
        end = start + timedelta(days=1)
        revenue = sum(t.payment.amount for t in completed if t.payment and start <= t.completed_at < end)
        by_day.append({"date": start.isoformat(), "revenue": revenue})

    categories = db.scalars(select(Category).order_by(Category.position)).all()
    by_category = sorted(
        ({"name": c.name, "count": sum(1 for t in current if t.category_code == c.code)} for c in categories),
        key=lambda x: -x["count"],
    )
    by_tech = []
    for tech in db.scalars(select(Technician).order_by(Technician.id)):
        mine = [t for t in current if t.assignment and t.assignment.tech_id == tech.id]
        done = len(_done(mine))
        rating = _avg_stars(mine)
        if done or rating:
            by_tech.append({"name": tech.user.name, "done": done, "rating": rating, "revenue": _revenue(mine)})
    reviews = [t for t in current if t.review]
    return {
        "revenue": _revenue(current),
        "revenuePrev": _revenue(previous),
        "done": len(_done(current)),
        "donePrev": len(_done(previous)),
        "avgHours": _avg_hours(current),
        "avgHoursPrev": _avg_hours(previous),
        "rating": _avg_stars(current),
        "reviewCount": len(reviews),
        "cancelled": sum(1 for t in current if t.status == Status.DA_HUY),
        "total": len(current),
        "byDay": by_day,
        "byStatus": [{"status": s.value, "count": n} for s in STATUS_LABEL if (n := sum(1 for t in current if t.status == s))],
        "byCategory": [c for c in by_category if c["count"]],
        "byTech": by_tech,
    }


def ticket_rows(db: Session, user: User, days: int) -> list[dict]:
    """Danh sách phiếu tạo trong kỳ báo cáo, dùng cho file Excel xuất từ màn hình báo cáo."""
    _check(user, days)
    since = utcnow() - timedelta(days=days)
    tickets = db.scalars(select(Ticket).where(Ticket.created_at >= since).order_by(Ticket.created_at.desc())).all()
    categories = {c.code: c.name for c in db.scalars(select(Category))}
    technicians = {t.id: t.user.name for t in db.scalars(select(Technician))}
    return [
        {
            "id": t.id,
            "createdAt": iso(t.created_at),
            "customer": t.customer.name,
            "ward": t.ward,
            "category": categories.get(t.category_code, ""),
            "urgency": t.urgency,
            "status": t.status,
            "technician": technicians.get(t.assignment.tech_id, "") if t.assignment else "",
            "appointmentAt": iso(t.assignment.appointment_at if t.assignment else t.slot_start),
            "completedAt": iso(t.completed_at),
            "amount": t.payment.amount if t.payment else None,
            "paymentMethod": t.payment.method if t.payment else None,
            "paymentStatus": t.payment.status if t.payment else None,
            "stars": t.review.stars if t.review else None,
        }
        for t in tickets
    ]
