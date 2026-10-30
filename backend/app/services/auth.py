"""Đăng ký, đăng nhập, phiên làm việc và mật khẩu (UC01)."""

import re
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, conflict, forbidden
from app.core.security import (
    create_access_token,
    hash_password,
    new_opaque_token,
    token_digest,
    verify_password,
)
from app.models import OutboxMessage, PasswordResetToken, RefreshToken, User
from app.services.common import audit, utcnow
from app.services.present import user_json

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+\.[\w.]+$")
PHONE_RE = re.compile(r"^0\d{9}$")
MIN_PASSWORD = 8
MAX_PENDING_RESETS = 3


def validate_email(email: str) -> str:
    email = email.strip()
    if not EMAIL_RE.match(email):
        raise ApiError("Email không hợp lệ.")
    return email


def validate_phone(phone: str) -> str:
    phone = re.sub(r"\s", "", phone)
    if not PHONE_RE.match(phone):
        raise ApiError("Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.")
    return phone


def validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise ApiError(f"Mật khẩu cần ít nhất {MIN_PASSWORD} ký tự.")


def email_taken(db: Session, email: str, phone: str | None = None) -> bool:
    conditions = [func.lower(User.email) == email.lower()]
    if phone:
        conditions.append(User.phone == phone)
    return db.scalar(select(func.count()).select_from(User).where(or_(*conditions))) > 0


def issue_tokens(db: Session, user: User) -> dict:
    settings = get_settings()
    refresh = new_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_digest(refresh),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        )
    )
    return {"user": user_json(user), "accessToken": create_access_token(user.id, list(user.roles)), "refreshToken": refresh}


def register(db: Session, name: str, email: str, phone: str, password: str, consent: bool) -> User:
    if not consent:
        raise ApiError("Bạn cần đồng ý điều khoản và chính sách xử lý dữ liệu cá nhân.")
    if not name.strip():
        raise ApiError("Vui lòng nhập họ tên.")
    email = validate_email(email)
    phone = validate_phone(phone)
    validate_new_password(password)
    if email_taken(db, email, phone):
        raise conflict("Email hoặc số điện thoại đã được đăng ký.")
    now = utcnow()
    user = User(
        name=name.strip(),
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        roles=["KHACH"],
        consent_at=now,
        created_at=now,
    )
    db.add(user)
    db.flush()
    audit(db, user, "DANG_KY", str(user.id))
    return user


def login(db: Session, identifier: str, password: str) -> User:
    """Khóa tạm thời sau nhiều lần nhập sai để chống dò mật khẩu (NFR-06)."""
    settings = get_settings()
    key = identifier.strip().lower()
    user = db.scalar(select(User).where(or_(func.lower(User.email) == key, User.phone == re.sub(r"\s", "", key))))
    invalid = ApiError("Email/số điện thoại hoặc mật khẩu không đúng.", 401)
    if user is None:
        raise invalid
    now = utcnow()
    if user.locked_until and user.locked_until > now:
        minutes = int((user.locked_until - now).total_seconds() // 60) + 1
        raise ApiError(f"Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau {minutes} phút.", 429)
    if not verify_password(password, user.password_hash):
        user.failed_logins += 1
        if user.failed_logins >= settings.login_max_failures:
            user.failed_logins = 0
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
            audit(db, user, "KHOA_TAM_DANG_NHAP", str(user.id))
        db.commit()
        raise invalid
    if user.locked:
        raise forbidden("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.")
    user.failed_logins = 0
    user.locked_until = None
    audit(db, user, "DANG_NHAP", str(user.id))
    return user


def refresh(db: Session, token: str) -> dict:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_digest(token)).with_for_update())
    if row is None or row.revoked or row.expires_at < utcnow():
        raise ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401)
    user = db.get(User, row.user_id)
    if user is None or user.locked:
        raise ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401)
    row.revoked = True
    return issue_tokens(db, user)


def logout(db: Session, token: str) -> None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_digest(token)))
    if row:
        row.revoked = True


def request_password_reset(db: Session, email: str) -> None:
    """Luôn trả cùng một kết quả để không lộ email nào đã đăng ký."""
    settings = get_settings()
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None or user.locked:
        return
    pending = db.scalar(
        select(func.count())
        .select_from(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False), PasswordResetToken.expires_at > utcnow())
    )
    if pending >= MAX_PENDING_RESETS:
        return
    token = new_opaque_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_digest(token),
            expires_at=utcnow() + timedelta(minutes=settings.password_reset_minutes),
        )
    )
    link = f"{settings.app_url}/dat-lai-mat-khau?token={token}"
    db.add(
        OutboxMessage(
            channel="email",
            recipient=user.email,
            subject="[IT OnSite] Đặt lại mật khẩu",
            body=(
                f"Chào {user.name},\n\nBấm vào liên kết sau để đặt mật khẩu mới (hiệu lực "
                f"{settings.password_reset_minutes} phút):\n{link}\n\n"
                "Nếu bạn không yêu cầu, hãy bỏ qua email này."
            ),
            next_attempt_at=utcnow(),
        )
    )
    audit(db, user, "YEU_CAU_DAT_LAI_MAT_KHAU", str(user.id))


def reset_password(db: Session, token: str, password: str) -> None:
    validate_new_password(password)
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_digest(token)).with_for_update())
    if row is None or row.used or row.expires_at < utcnow():
        raise ApiError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.")
    user = db.get(User, row.user_id)
    user.password_hash = hash_password(password)
    user.failed_logins = 0
    user.locked_until = None
    row.used = True
    revoke_all_sessions(db, user)
    audit(db, user, "DAT_LAI_MAT_KHAU", str(user.id))


def change_password(db: Session, user: User, current: str, new: str) -> dict:
    """Đổi mật khẩu thì đăng xuất mọi thiết bị khác, cấp phiên mới cho thiết bị đang dùng."""
    if not verify_password(current, user.password_hash):
        raise ApiError("Mật khẩu hiện tại không đúng.")
    validate_new_password(new)
    user.password_hash = hash_password(new)
    revoke_all_sessions(db, user)
    audit(db, user, "DOI_MAT_KHAU", str(user.id))
    return issue_tokens(db, user)


def revoke_all_sessions(db: Session, user: User) -> None:
    for row in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))):
        row.revoked = True
