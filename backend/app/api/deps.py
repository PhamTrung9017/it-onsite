import re
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query, Request, Response
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


# Phiên tra cứu đơn chỉ gọi được các API của đơn đó, thông báo và bảo hành của đơn đó
SCOPED_PATHS = (r"/auth/me", r"/notifications(/.*)?", r"/warranties/mine", r"/warranty-claims")


def _allowed_for_scope(path: str, ticket_id: str) -> bool:
    path = path.removeprefix("/api/v1")
    if path == f"/tickets/{ticket_id}" or path.startswith(f"/tickets/{ticket_id}/"):
        return True
    return any(re.fullmatch(pattern, path) for pattern in SCOPED_PATHS)


def current_user(request: Request, db: Db, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> User:
    expired = ApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", 401)
    if credentials is None:
        raise expired
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise expired
    user = db.get(User, int(payload["sub"]))
    if user is None or user.locked:
        raise expired
    scope = payload.get("ticket")
    if scope:
        if not _allowed_for_scope(request.url.path, scope):
            raise ApiError(f"Phiên tra cứu chỉ dùng cho đơn {scope}. Vui lòng đăng nhập để dùng chức năng này.", 403)
        user.scope_ticket = scope
    return user


CurrentUser = Annotated[User, Depends(current_user)]


@dataclass
class Paging:
    """Phân trang danh sách dài: `limit` bản ghi từ vị trí `offset`; tổng số bản ghi trả trong header X-Total-Count."""

    limit: int
    offset: int
    response: Response

    def total(self, count: int) -> None:
        self.response.headers["X-Total-Count"] = str(count)


def paging(response: Response, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)) -> Paging:
    return Paging(limit, offset, response)


Page = Annotated[Paging, Depends(paging)]


def presenter(db: Session, user: User | None) -> Presenter:
    return Presenter(db, user, load_config(db))
