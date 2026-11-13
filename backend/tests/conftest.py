import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://itonsite:itonsite@localhost:5432/itonsite_test")
os.environ["BACKGROUND_JOBS"] = "false"
os.environ["GEMINI_API_KEY"] = ""
os.environ["SMTP_HOST"] = ""
os.environ["TELEGRAM_BOT_TOKEN"] = ""

import base64  # noqa: E402
from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import load_demo  # noqa: E402
from app.services import telegram
from app.services.common import utcnow  # noqa: E402

PNG = (
    "data:image/png;base64,"
    + base64.b64encode(
        bytes.fromhex(
            "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
            "1f15c4890000000d49444154789c6360f8cf00000301010018dd8db40000000049454e44ae426082"
        )
    ).decode()
)


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    config = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    config.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
def demo_data():
    with SessionLocal() as db:
        load_demo(db)
        db.commit()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class Api:
    """Gọi API dưới danh nghĩa một tài khoản."""

    def __init__(self, client: TestClient, email: str, password: str = "123456"):
        self.client = client
        response = client.post("/api/v1/auth/login", json={"identifier": email, "password": password})
        assert response.status_code == 200, response.text
        self.tokens = response.json()
        self.user = self.tokens["user"]

    @property
    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.tokens['accessToken']}"}

    def get(self, path: str, **kwargs):
        return self.client.get(f"/api/v1{path}", headers=self.headers, **kwargs)

    def post(self, path: str, json: dict | None = None):
        return self.client.post(f"/api/v1{path}", json=json or {}, headers=self.headers)

    def put(self, path: str, json: dict):
        return self.client.put(f"/api/v1{path}", json=json, headers=self.headers)

    def patch(self, path: str, json: dict):
        return self.client.patch(f"/api/v1{path}", json=json, headers=self.headers)

    def delete(self, path: str):
        return self.client.delete(f"/api/v1{path}", headers=self.headers)

    def ok(self, method: str, path: str, json: dict | None = None):
        response = getattr(self, method)(path, json) if json is not None else getattr(self, method)(path)
        assert response.status_code < 300, response.text
        return response.json() if response.content else None


@pytest.fixture
def khach(client):
    return Api(client, "khach@demo.vn")


@pytest.fixture
def ktv(client):
    return Api(client, "ktv@demo.vn")


@pytest.fixture
def dpv(client):
    return Api(client, "dpv@demo.vn")


@pytest.fixture
def qtv(client):
    return Api(client, "qtv@demo.vn")


def tomorrow_at(hour: int, minute: int = 0) -> str:
    local = (utcnow() + timedelta(days=1)).astimezone(get_settings().tz)
    return local.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


TELEGRAM_SECRET = "bi-mat"


@pytest.fixture
def bot(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", "token")
    monkeypatch.setattr(settings, "telegram_bot_username", "itonsite_bot")
    monkeypatch.setattr(settings, "telegram_webhook_secret", TELEGRAM_SECRET)
    calls = []
    monkeypatch.setattr(telegram, "call", lambda method, payload: calls.append((method, payload)))

    def send(update: dict) -> None:
        response = client.post("/api/v1/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": TELEGRAM_SECRET})
        assert response.status_code == 200, response.text

    send.calls = calls
    return send
