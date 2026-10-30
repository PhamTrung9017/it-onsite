from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://itonsite:itonsite@localhost:5432/itonsite"
    jwt_secret: str = "khoa-chi-dung-khi-phat-trien-tren-may-ca-nhan"
    credential_key: str = "khoa-chi-dung-khi-phat-trien-tren-may-ca-nhan"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    password_reset_minutes: int = 30

    timezone: str = "Asia/Ho_Chi_Minh"
    app_url: str = "http://localhost:5173"
    cors_origins: list[str] = ["http://localhost:5173"]
    media_dir: str = "uploads"
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

    background_jobs: bool = True
    sweep_interval_seconds: int = 30
    outbox_interval_seconds: int = 15

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
