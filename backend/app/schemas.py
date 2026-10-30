"""Dữ liệu đầu vào của API (khóa dạng camelCase như giao diện gửi lên)."""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Body(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=False)


class RegisterBody(Body):
    name: str = Field(max_length=120)
    email: str = Field(max_length=160)
    phone: str = Field(max_length=20)
    password: str = Field(max_length=128)
    consent: bool = False


class LoginBody(Body):
    identifier: str = Field(max_length=160)
    password: str = Field(max_length=128)


class TokenBody(Body):
    refresh_token: str = Field(max_length=200)


class ForgotPasswordBody(Body):
    email: str = Field(max_length=160)


class ResetPasswordBody(Body):
    token: str = Field(max_length=200)
    password: str = Field(max_length=128)


class ChangePasswordBody(Body):
    current: str = Field(max_length=128)
    next: str = Field(max_length=128)


class ProfileBody(Body):
    name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=255)
    ward: str | None = Field(default=None, max_length=80)


class DeviceBody(Body):
    type: str = Field(max_length=20)
    brand: str = Field(max_length=80)
    model: str = Field(max_length=120)


class ReasonBody(Body):
    reason: str = Field(default="", max_length=1000)


class ClassifyBody(Body):
    description: str = Field(max_length=2000)


class CreateTicketBody(Body):
    device_id: int
    description: str = Field(max_length=2000)
    photos: list[str] = Field(default_factory=list, max_length=5)
    address: str = Field(max_length=255)
    ward: str = Field(max_length=80)
    slot_start: AwareDatetime
    category_code: str | None = Field(default=None, max_length=20)
    ai_result: dict | None = None
    device_credentials: str = Field(default="", max_length=500)
    accept_terms: bool = False
    accept_privacy: bool = False


class RescheduleBody(Body):
    slot_start: AwareDatetime


class QuoteDecisionBody(Body):
    decision: Literal["approve", "partial", "reject"]
    item_ids: list[int] = Field(default_factory=list)
    reason: str = Field(default="", max_length=1000)


class AcceptanceBody(Body):
    ok: bool
    reason: str = Field(default="", max_length=1000)


class ReviewBody(Body):
    stars: int
    comment: str = Field(default="", max_length=1000)


class WarrantyClaimBody(Body):
    warranty_id: int
    description: str = Field(max_length=2000)
    slot_start: AwareDatetime


class AssignmentResponseBody(Body):
    accept: bool
    reason: str = Field(default="", max_length=1000)


class QuoteItemBody(Body):
    kind: Literal["service", "part"]
    ref_id: int
    qty: int = Field(ge=1, le=99)


class CreateQuoteBody(Body):
    items: list[QuoteItemBody] = Field(max_length=30)
    note: str = Field(default="", max_length=2000)


class OnsiteCodeBody(Body):
    code: str = Field(max_length=10)


class ChecklistBody(Body):
    checklist: list[dict] = Field(max_length=50)


class PhotosBody(Body):
    kind: Literal["before", "after"]
    photos: list[str] = Field(min_length=1, max_length=6)


class ReceiveBody(Body):
    category_code: str = Field(max_length=20)
    urgency: str | None = None
    version: int | None = None


class AssignBody(Body):
    tech_id: int
    appointment_at: AwareDatetime
    version: int | None = None


class ClaimDecisionBody(Body):
    valid: bool
    reason: str = Field(default="", max_length=1000)


class MarkReadBody(Body):
    ids: list[int] | None = None


class ServiceBody(Body):
    id: int | None = None
    name: str = Field(max_length=160)
    category_code: str = Field(max_length=20)
    price: int
    duration_min: int
    warranty_days: int = 0
    active: bool = True


class PartBody(Body):
    id: int | None = None
    name: str = Field(max_length=160)
    price: int
    stock: int = 0
    warranty_days: int = 0
    active: bool = True


class TechnicianBody(Body):
    id: int | None = None
    name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=20)
    skills: list[str]
    areas: list[str]
    active: bool = True


class RolesBody(Body):
    roles: list[str]
    locked: bool = False


class InternalUserBody(Body):
    name: str = Field(max_length=120)
    email: str = Field(max_length=160)
    phone: str = Field(default="", max_length=20)
    roles: list[str]
