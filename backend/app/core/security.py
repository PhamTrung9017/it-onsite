"""Băm mật khẩu (NFR-04), JWT (NFR-05) và mã hóa thông tin đăng nhập thiết bị (NFR-07)."""

import base64
import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(user_id: int, roles: list[str]) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "roles": roles,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == "access" else None


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aes_key() -> bytes:
    return hashlib.sha256(get_settings().credential_key.encode()).digest()


def encrypt_secret(plain: str) -> str:
    """AES-256-GCM, lưu dạng base64(nonce + ciphertext)."""
    if not plain:
        return ""
    nonce = os.urandom(12)
    data = AESGCM(_aes_key()).encrypt(nonce, plain.encode(), None)
    return base64.b64encode(nonce + data).decode()


def decrypt_secret(stored: str) -> str:
    if not stored:
        return ""
    raw = base64.b64decode(stored)
    return AESGCM(_aes_key()).decrypt(raw[:12], raw[12:], None).decode()
