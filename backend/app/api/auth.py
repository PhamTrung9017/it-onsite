from fastapi import APIRouter

from app.api.deps import CurrentUser, Db
from app.schemas import ChangePasswordBody, ForgotPasswordBody, LoginBody, RegisterBody, ResetPasswordBody, TokenBody
from app.services import auth
from app.services.present import user_json

router = APIRouter(prefix="/auth", tags=["Xác thực"])


@router.post("/register", status_code=201)
def register(body: RegisterBody, db: Db) -> dict:
    user = auth.register(db, body.name, body.email, body.phone, body.password, body.consent)
    tokens = auth.issue_tokens(db, user)
    db.commit()
    return tokens


@router.post("/login")
def login(body: LoginBody, db: Db) -> dict:
    user = auth.login(db, body.identifier, body.password)
    tokens = auth.issue_tokens(db, user)
    db.commit()
    return tokens


@router.post("/refresh")
def refresh(body: TokenBody, db: Db) -> dict:
    tokens = auth.refresh(db, body.refresh_token)
    db.commit()
    return tokens


@router.post("/logout", status_code=204)
def logout(body: TokenBody, db: Db) -> None:
    auth.logout(db, body.refresh_token)
    db.commit()


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordBody, db: Db) -> dict:
    auth.request_password_reset(db, body.email)
    db.commit()
    return {"ok": True}


@router.post("/reset-password")
def reset_password(body: ResetPasswordBody, db: Db) -> dict:
    auth.reset_password(db, body.token, body.password)
    db.commit()
    return {"ok": True}


@router.post("/change-password")
def change_password(body: ChangePasswordBody, user: CurrentUser, db: Db) -> dict:
    tokens = auth.change_password(db, user, body.current, body.next)
    db.commit()
    return tokens


@router.get("/me")
def me(user: CurrentUser) -> dict:
    return user_json(user)
