from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import decode_access_token
from app.db import get_db
from app.models import User
from app.services.common import load_config
from app.services.present import Presenter

bearer = HTTPBearer(auto_error=False)

Db = Annotated[Session, Depends(get_db)]


def current_user(db: Db, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> User:
    expired = ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401)
    if credentials is None:
        raise expired
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise expired
    user = db.get(User, int(payload["sub"]))
    if user is None or user.locked:
        raise expired
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def presenter(db: Session, user: User | None) -> Presenter:
    return Presenter(db, user, load_config(db))
