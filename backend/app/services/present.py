"""Chuyển dữ liệu sang JSON trả cho giao diện (khóa dạng camelCase)."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decrypt_secret
from app.domain.rules import BusinessConfig
from app.models import Category, Device, Quote, Technician, Ticket, User
from app.services.common import amount_due, tech_of_user

MASK = "••••••"


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def user_json(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "roles": list(user.roles),
        "address": user.address,
        "ward": user.ward,
        "locked": user.locked,
        "telegramLinked": bool(user.telegram_chat_id),
    }


def device_json(device: Device) -> dict:
    return {"id": device.id, "customerId": device.customer_id, "type": device.type, "brand": device.brand, "model": device.model}


def category_json(category: Category) -> dict:
    return {"code": category.code, "name": category.name, "serviceId": category.service_id}


def tech_json(tech: Technician) -> dict:
    return {
        "id": tech.id,
        "userId": tech.user_id,
        "name": tech.user.name,
        "phone": tech.user.phone,
        "skills": list(tech.skills),
        "areas": list(tech.areas),
        "rating": float(tech.rating),
        "ratingCount": tech.rating_count,
        "active": tech.active,
    }


def quote_json(quote: Quote) -> dict:
    return {
        "id": quote.id,
        "type": quote.type,
        "status": quote.status,
        "items": [
            {
                "id": item.id,
                "kind": item.kind,
                "refId": item.ref_id,
                "name": item.name,
                "qty": item.qty,
                "unitPrice": item.unit_price,
                "warrantyDays": item.warranty_days,
                "selected": item.selected,
            }
            for item in quote.items
        ],
        "note": quote.note,
        "createdAt": iso(quote.created_at),
        "createdBy": quote.created_by,
        "decidedAt": iso(quote.decided_at),
        "decidedBy": quote.decided_by,
        "rejectReason": quote.reject_reason,
    }


class Presenter:
    """Gom dữ liệu tham chiếu một lần cho mỗi yêu cầu để tránh truy vấn lặp."""

    def __init__(self, db: Session, viewer: User | None, config: BusinessConfig):
        self.db = db
        self.viewer = viewer
        self.config = config
        self.categories = {c.code: c for c in db.scalars(select(Category))}
        self.viewer_tech = tech_of_user(db, viewer) if viewer else None
        self._techs: dict[int, Technician] = {}

    def tech(self, tech_id: int) -> Technician | None:
        if tech_id not in self._techs:
            self._techs[tech_id] = self.db.get(Technician, tech_id)
        return self._techs[tech_id]

    def ticket(self, t: Ticket, **extra) -> dict:
        assignment = t.assignment
        tech = self.tech(assignment.tech_id) if assignment else None
        is_assigned_tech = bool(tech and self.viewer_tech and tech.id == self.viewer_tech.id)
        credentials = ""
        if t.device_credentials:
            credentials = decrypt_secret(t.device_credentials) if is_assigned_tech else MASK
        category = self.categories.get(t.category_code)
        payment = t.payment
        data = {
            "id": t.id,
            "customerId": t.customer_id,
            "deviceId": t.device_id,
            "description": t.description,
            "photos": [p.url for p in t.photos_of("request")],
            "address": t.address,
            "ward": t.ward,
            "contactPhone": t.contact_phone,
            "slotStart": iso(t.slot_start),
            "categoryCode": t.category_code,
            "urgency": t.urgency,
            "estimatedMinutes": t.estimated_minutes,
            "aiResult": t.ai_result,
            "categoryConfirmed": t.category_confirmed,
            "deviceCredentials": credentials,
            "status": t.status,
            "version": t.version,
            "createdAt": iso(t.created_at),
            "updatedAt": iso(t.updated_at),
            "history": [{"status": h.status, "at": iso(h.at), "by": h.by_name, "note": h.note} for h in t.history],
            "assignment": assignment
            and {
                "techId": assignment.tech_id,
                "appointmentAt": iso(assignment.appointment_at),
                "assignedAt": iso(assignment.assigned_at),
                "deadline": iso(assignment.deadline),
                "result": assignment.result,
                "respondedAt": iso(assignment.responded_at),
                "rejectReason": assignment.reject_reason,
            },
            "quotes": [quote_json(q) for q in t.quotes],
            "checkInAt": iso(t.check_in_at),
            "checklist": t.checklist or [],
            "photosBefore": [p.url for p in t.photos_of("before")],
            "photosAfter": [p.url for p in t.photos_of("after")],
            "acceptance": t.acceptance,
            "payment": payment
            and {
                "amount": payment.amount,
                "method": payment.method,
                "status": payment.status,
                "paidAt": iso(payment.paid_at),
                "confirmedBy": payment.confirmed_by,
                "confirmedByName": payment.confirmed_by_name,
                "confirmedAt": iso(payment.confirmed_at),
                "reconciledBy": payment.reconciled_by,
                "reconciledAt": iso(payment.reconciled_at),
            },
            "review": t.review and {"stars": t.review.stars, "comment": t.review.comment, "at": iso(t.review.at)},
            "cancel": t.cancel,
            "completedAt": iso(t.completed_at),
            "isWarranty": t.is_warranty,
            "warrantyOf": t.warranty_of,
            "lateRescheduleFee": t.late_reschedule_fee,
            "customer": {"id": t.customer.id, "name": t.customer.name, "phone": t.customer.phone},
            "device": device_json(t.device),
            "category": category_json(category) if category else None,
            "technician": tech
            and {
                "id": tech.id,
                "name": tech.user.name,
                "phone": tech.user.phone,
                "rating": float(tech.rating),
                "ratingCount": tech.rating_count,
            },
            "amountDue": amount_due(t, self.config),
        }
        data.update(extra)
        return data
