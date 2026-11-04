import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import account, admin, auth, catalog, dispatch, technician, tickets
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db import SessionLocal
from app.services.media import media_root
from app.workers import start_background_jobs

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = start_background_jobs() if get_settings().background_jobs else []
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="IT OnSite API", version="1.0.0", lifespan=lifespan)

API_PREFIX = "/api/v1"
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """NFR-09: chặn đoán kiểu nội dung, nhúng khung; dữ liệu API không lưu vào bộ nhớ đệm."""
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    if request.url.path.startswith(API_PREFIX):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"detail": exc.message}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields = sorted({str(err["loc"][-1]) for err in exc.errors() if err.get("loc")})
    message = "Dữ liệu gửi lên không hợp lệ" + (f": {', '.join(fields)}." if fields else ".")
    return JSONResponse({"detail": message, "errors": jsonable_errors(exc)}, status_code=422)


def jsonable_errors(exc: RequestValidationError) -> list[dict]:
    return [{"field": ".".join(str(p) for p in err.get("loc", [])), "message": err.get("msg", "")} for err in exc.errors()]


for module in (auth, account, catalog, tickets, technician, dispatch, admin):
    app.include_router(module.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health", tags=["Hệ thống"])
def health() -> dict:
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}


app.mount("/media", StaticFiles(directory=media_root()), name="media")
