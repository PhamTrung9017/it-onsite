from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.domain.rules import WorkSchedule
from app.domain.status import Status

Timestamp = DateTime(timezone=True)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("uq_users_email_lower", func.lower(text("email")), unique=True),
        Index("uq_users_phone", "phone", unique=True, postgresql_where=text("phone <> ''")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(20), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    roles: Mapped[list[str]] = mapped_column(ARRAY(String(10)))
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    address: Mapped[str] = mapped_column(String(255), default="")
    ward: Mapped[str] = mapped_column(String(80), default="")
    telegram_chat_id: Mapped[str | None] = mapped_column(String(40))
    telegram_link_code: Mapped[str | None] = mapped_column(String(40), unique=True)
    failed_logins: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(Timestamp)
    consent_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(Timestamp, server_default=func.now())

    technician: Mapped["Technician | None"] = relationship(back_populates="user")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(Timestamp)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(Timestamp)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Technician(Base):
    __tablename__ = "technicians"
    __table_args__ = (CheckConstraint("rating BETWEEN 0 AND 5", name="ck_technicians_rating"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    skills: Mapped[list[str]] = mapped_column(ARRAY(String(20)))
    areas: Mapped[list[str]] = mapped_column(ARRAY(String(80)))
    rating: Mapped[float] = mapped_column(Numeric(2, 1), default=5)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    schedule: Mapped[dict] = mapped_column(JSONB, default=lambda: WorkSchedule().to_dict())

    user: Mapped[User] = relationship(back_populates="technician")


class Setting(Base):
    """Tham số nghiệp vụ do quản trị viên cấu hình (UC23), lưu một dòng duy nhất."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (CheckConstraint("price >= 0 AND duration_min > 0 AND warranty_days >= 0", name="ck_services_numbers"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    category_code: Mapped[str] = mapped_column(String(20))
    price: Mapped[int] = mapped_column(Integer)
    duration_min: Mapped[int] = mapped_column(Integer)
    warranty_days: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(Base):
    __tablename__ = "categories"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id"))
    position: Mapped[int] = mapped_column(SmallInteger, default=0)


class Part(Base):
    __tablename__ = "parts"
    __table_args__ = (CheckConstraint("price >= 0 AND stock >= 0 AND warranty_days >= 0", name="ck_parts_numbers"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    price: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    warranty_days: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    brand: Mapped[str] = mapped_column(String(80))
    model: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(String(255), default="")
    removed: Mapped[bool] = mapped_column(Boolean, default=False)


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint(f"status IN ({', '.join(repr(s.value) for s in Status)})", name="ck_tickets_status"),
        CheckConstraint("urgency IN ('THAP', 'TRUNG_BINH', 'CAO')", name="ck_tickets_urgency"),
    )

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"))
    description: Mapped[str] = mapped_column(Text)
    address: Mapped[str] = mapped_column(String(255))
    ward: Mapped[str] = mapped_column(String(80))
    contact_phone: Mapped[str] = mapped_column(String(20))
    slot_start: Mapped[datetime] = mapped_column(Timestamp)
    category_code: Mapped[str] = mapped_column(String(20))
    urgency: Mapped[str] = mapped_column(String(12), default="TRUNG_BINH")
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=60)
    ai_result: Mapped[dict | None] = mapped_column(JSONB)
    category_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    device_credentials: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    check_in_at: Mapped[datetime | None] = mapped_column(Timestamp)
    checklist: Mapped[list] = mapped_column(JSONB, default=list)
    acceptance: Mapped[dict | None] = mapped_column(JSONB)
    cancel: Mapped[dict | None] = mapped_column(JSONB)
    late_reschedule_fee: Mapped[int] = mapped_column(Integer, default=0)
    onsite_code_hash: Mapped[str | None] = mapped_column(String(64))
    onsite_code_expires_at: Mapped[datetime | None] = mapped_column(Timestamp)
    onsite_code_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(Timestamp)
    is_warranty: Mapped[bool] = mapped_column(Boolean, default=False)
    warranty_of: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(Timestamp)
    updated_at: Mapped[datetime] = mapped_column(Timestamp)

    customer: Mapped[User] = relationship(foreign_keys=[customer_id], lazy="joined", innerjoin=True)
    device: Mapped[Device] = relationship(lazy="joined", innerjoin=True)
    history: Mapped[list["TicketHistory"]] = relationship(order_by="TicketHistory.id", cascade="all, delete-orphan", lazy="selectin")
    assignments: Mapped[list["Assignment"]] = relationship(order_by="Assignment.id", cascade="all, delete-orphan", lazy="selectin")
    quotes: Mapped[list["Quote"]] = relationship(order_by="Quote.id", cascade="all, delete-orphan", lazy="selectin")
    photos: Mapped[list["Photo"]] = relationship(order_by="Photo.id", cascade="all, delete-orphan", lazy="selectin")
    payment: Mapped["Payment | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")
    review: Mapped["Review | None"] = relationship(cascade="all, delete-orphan", lazy="selectin")

    @property
    def assignment(self) -> "Assignment | None":
        return self.assignments[-1] if self.assignments else None

    def photos_of(self, kind: str) -> list["Photo"]:
        return [p for p in self.photos if p.kind == kind]


class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    at: Mapped[datetime] = mapped_column(Timestamp)
    by_name: Mapped[str] = mapped_column(String(160))
    note: Mapped[str] = mapped_column(Text, default="")


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    tech_id: Mapped[int] = mapped_column(ForeignKey("technicians.id"), index=True)
    appointment_at: Mapped[datetime] = mapped_column(Timestamp)
    assigned_at: Mapped[datetime] = mapped_column(Timestamp)
    deadline: Mapped[datetime] = mapped_column(Timestamp)
    result: Mapped[str | None] = mapped_column(String(10))
    responded_at: Mapped[datetime | None] = mapped_column(Timestamp)
    reject_reason: Mapped[str] = mapped_column(Text, default="")


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(16))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(Timestamp)
    created_by: Mapped[int] = mapped_column(ForeignKey("technicians.id"))
    decided_at: Mapped[datetime | None] = mapped_column(Timestamp)
    decided_by: Mapped[str] = mapped_column(String(160), default="")
    reject_reason: Mapped[str] = mapped_column(Text, default="")

    items: Mapped[list["QuoteItem"]] = relationship(order_by="QuoteItem.id", cascade="all, delete-orphan", lazy="selectin")


class QuoteItem(Base):
    __tablename__ = "quote_items"
    __table_args__ = (CheckConstraint("qty > 0 AND unit_price >= 0", name="ck_quote_items_numbers"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    ref_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(160))
    qty: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    warranty_days: Mapped[int] = mapped_column(Integer, default=0)
    selected: Mapped[bool] = mapped_column(Boolean, default=True)


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    url: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(Timestamp, server_default=func.now())


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount >= 0", name="ck_payments_amount"),)

    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True)
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[str | None] = mapped_column(String(14))
    status: Mapped[str] = mapped_column(String(16), index=True)
    paid_at: Mapped[datetime | None] = mapped_column(Timestamp)
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    confirmed_by_name: Mapped[str] = mapped_column(String(160), default="")
    confirmed_at: Mapped[datetime | None] = mapped_column(Timestamp)
    reconciled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reconciled_at: Mapped[datetime | None] = mapped_column(Timestamp)


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("stars BETWEEN 1 AND 5", name="ck_reviews_stars"),)

    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True)
    stars: Mapped[int] = mapped_column(SmallInteger)
    comment: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(Timestamp)


class Warranty(Base):
    __tablename__ = "warranties"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), index=True)
    quote_item_id: Mapped[int] = mapped_column(ForeignKey("quote_items.id"))
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    start_at: Mapped[datetime] = mapped_column(Timestamp)
    end_at: Mapped[datetime] = mapped_column(Timestamp)


class WarrantyClaim(Base):
    __tablename__ = "warranty_claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    warranty_id: Mapped[int] = mapped_column(ForeignKey("warranties.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    description: Mapped[str] = mapped_column(Text)
    slot_start: Mapped[datetime] = mapped_column(Timestamp)
    status: Mapped[str] = mapped_column(String(10), default="CHO_XU_LY")
    reason: Mapped[str] = mapped_column(Text, default="")
    new_ticket_id: Mapped[str | None] = mapped_column(String(20))
    decided_by: Mapped[str] = mapped_column(String(160), default="")
    decided_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(Timestamp)

    warranty: Mapped[Warranty] = relationship(lazy="joined", innerjoin=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    ticket_id: Mapped[str | None] = mapped_column(String(20))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(Timestamp)


class OutboxMessage(Base):
    """Hàng đợi gửi Telegram, email; lỗi thì gửi lại, tối đa 3 lần (NFR-14)."""

    __tablename__ = "outbox"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    channel: Mapped[str] = mapped_column(String(10))
    recipient: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="CHO_GUI", index=True)
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(Timestamp)
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(Timestamp, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    at: Mapped[datetime] = mapped_column(Timestamp, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer)
    user_name: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(Text, default="")


class DailyCounter(Base):
    """Số thứ tự phiếu theo ngày để tạo mã YC-yyyymmdd-nnn."""

    __tablename__ = "daily_counters"
    __table_args__ = (UniqueConstraint("day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[str] = mapped_column(String(8))
    value: Mapped[int] = mapped_column(Integer, default=0)
