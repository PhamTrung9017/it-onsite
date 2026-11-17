import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import text

from app.api import account, admin, auth, catalog, dispatch, guest, technician, tickets
from app.api.deps import Db
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db import SessionLocal
from app.services import media, telegram
from app.workers import start_background_jobs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = start_background_jobs() if get_settings().background_jobs else []
    await asyncio.to_thread(telegram.register_webhook)
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="IT OnSite API", version="1.0.0", lifespan=lifespan)

API_PREFIX = "/api/v1"
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}
# Giống frontend/security-headers.conf (nginx) để hai cách triển khai có cùng chính sách.
PAGE_HEADERS = {
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), payment=()",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    ),
}
MEDIA_HEADERS = {
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": "public, max-age=2592000",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """NFR-09: chặn đoán kiểu nội dung, nhúng khung; dữ liệu API không lưu vào bộ nhớ đệm; trang giao diện có CSP."""
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    path = request.url.path
    if path.startswith(API_PREFIX):
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers.setdefault("Cache-Control", "no-store")
    elif path.startswith(media.MEDIA_PREFIX):
        response.headers.update(MEDIA_HEADERS)
    else:
        response.headers.update(PAGE_HEADERS)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)
# Nén phản hồi lớn (danh sách phiếu, báo cáo) để tải nhanh trên điện thoại
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"detail": exc.message}, status_code=exc.status_code)


FIELD_LABELS = {
    "name": "Họ tên",
    "email": "Email",
    "phone": "Số điện thoại",
    "password": "Mật khẩu",
    "current": "Mật khẩu hiện tại",
    "next": "Mật khẩu mới",
    "identifier": "Email hoặc số điện thoại",
    "address": "Địa chỉ",
    "ward": "Phường",
    "description": "Mô tả sự cố",
    "deviceType": "Loại thiết bị",
    "deviceBrand": "Hãng",
    "deviceModel": "Dòng máy",
    "brand": "Hãng",
    "model": "Dòng máy",
    "type": "Loại",
    "note": "Ghi chú",
    "slotStart": "Khung giờ hẹn",
    "appointmentAt": "Giờ hẹn",
    "reason": "Lý do",
    "comment": "Nhận xét",
    "stars": "Số sao",
    "code": "Mã",
    "ticketId": "Mã đơn",
    "price": "Đơn giá",
    "stock": "Tồn kho",
    "qty": "Số lượng",
    "durationMin": "Thời lượng",
    "warrantyDays": "Số ngày bảo hành",
    "deviceCredentials": "Thông tin đăng nhập máy",
    "items": "Hạng mục",
    "photos": "Ảnh",
    "roles": "Vai trò",
    "skills": "Kỹ năng",
    "areas": "Khu vực",
    "schedule": "Lịch làm việc",
    "categoryCode": "Loại sự cố",
    "urgency": "Mức khẩn",
}


def _field_message(err: dict) -> str:
    field = str(err["loc"][-1]) if err.get("loc") else ""
    label = FIELD_LABELS.get(field, field or "Dữ liệu")
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    if kind == "string_too_long":
        return f"{label} dài quá {ctx.get('max_length')} ký tự"
    if kind == "missing":
        return f"thiếu {label.lower()}"
    if kind in ("greater_than_equal", "greater_than", "less_than_equal", "less_than"):
        return f"{label} vượt giới hạn cho phép"
    return f"{label} không hợp lệ"


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    parts = list(dict.fromkeys(_field_message(err) for err in exc.errors()))
    message = "Dữ liệu chưa hợp lệ" + (f": {'; '.join(parts)}." if parts else ".")
    return JSONResponse({"detail": message, "errors": jsonable_errors(exc)}, status_code=422)


def jsonable_errors(exc: RequestValidationError) -> list[dict]:
    return [{"field": ".".join(str(p) for p in err.get("loc", [])), "message": err.get("msg", "")} for err in exc.errors()]


for module in (auth, account, catalog, guest, tickets, technician, dispatch, admin):
    app.include_router(module.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["Hệ thống"])
def health() -> dict:
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.api_route(media.MEDIA_PREFIX + "{name}", methods=["GET", "HEAD"], include_in_schema=False)
def media_file(name: str, db: Db) -> Response:
    file = media.load(db, name)
    if not file:
        return JSONResponse({"detail": "Không tìm thấy ảnh."}, status_code=404)
    return Response(file.data, media_type=file.mime)


@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def frontend(path: str) -> Response:
    """Phục vụ bản dựng giao diện (FRONTEND_DIR) trên cùng địa chỉ với API; đường dẫn của ứng dụng trả về index.html."""
    directory = get_settings().frontend_dir
    root = Path(directory).resolve() if directory else None
    if root is None or path.startswith(API_PREFIX.lstrip("/")) or not (root / "index.html").is_file():
        return JSONResponse({"detail": "Không tìm thấy."}, status_code=404)
    target = (root / path).resolve()
    if path and target.is_relative_to(root) and target.is_file():
        cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
        return FileResponse(target, headers={"Cache-Control": cache})
    return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})
