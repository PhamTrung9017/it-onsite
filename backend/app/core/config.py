import hashlib
import hmac
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "khoa-chi-dung-khi-phat-trien-tren-may-ca-nhan"
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True)

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://itonsite:itonsite@localhost:5432/itonsite"
    jwt_secret: str = DEV_SECRET
    credential_key: str = DEV_SECRET
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    password_reset_minutes: int = 30

    timezone: str = "Asia/Ho_Chi_Minh"
    # Trên Render, khi không đặt APP_URL thì lấy địa chỉ công khai Render cấp cho dịch vụ.
    app_url: str = Field("http://localhost:5173", validation_alias=AliasChoices("APP_URL", "RENDER_EXTERNAL_URL"))
    cors_origins: list[str] = ["http://localhost:5173"]
    # Bản trình diễn: cho phép quản trị viên nạp lại dữ liệu mẫu
    demo_data: bool = False
    # Thư mục bản dựng giao diện (frontend/dist); đặt khi backend phục vụ luôn giao diện trên cùng một địa chỉ.
    frontend_dir: str = ""
    max_image_bytes: int = 3 * 1024 * 1024

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = 10

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    telegram_webhook_secret: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    # Gửi email qua HTTPS (Google Apps Script) khi máy chủ không mở được cổng SMTP.
    email_relay_url: str = ""
    email_relay_secret: str = ""

    background_jobs: bool = True
    sweep_interval_seconds: int = 30
    outbox_interval_seconds: int = 15

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Chuỗi kết nối dạng postgres:// hoặc postgresql:// (Neon, Render cấp) chuyển sang trình điều khiển psycopg 3."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @model_validator(mode="after")
    def check_production_secrets(self) -> "Settings":
        """Bản triển khai thật không được chạy với khóa mặc định hoặc khóa quá ngắn."""
        if self.app_env == "production":
            for name in ("jwt_secret", "credential_key"):
                value = getattr(self, name)
                if value == DEV_SECRET or len(value) < MIN_SECRET_LENGTH:
                    raise ValueError(f"{name.upper()} phải là chuỗi ngẫu nhiên ít nhất {MIN_SECRET_LENGTH} ký tự khi APP_ENV=production.")
        return self

    @property
    def webhook_secret(self) -> str:
        """Khóa xác thực webhook Telegram; không đặt riêng thì sinh cố định từ JWT_SECRET (chỉ gồm chữ số hex, hợp lệ với Telegram)."""
        if self.telegram_webhook_secret:
            return self.telegram_webhook_secret
        return hmac.new(self.jwt_secret.encode(), b"telegram-webhook", hashlib.sha256).hexdigest()

    @property
    def email_enabled(self) -> bool:
        return bool(self.email_relay_url or self.smtp_host)

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
