# Infra

Chạy cơ sở dữ liệu và backend bằng Docker Compose.

```bash
cd infra
cp .env.example .env        # điền DB_PASSWORD, JWT_SECRET, CREDENTIAL_KEY
docker compose up -d --build
docker compose exec backend python -m app.seed demo
```

API chạy tại http://localhost:8000, tài liệu API tại http://localhost:8000/docs. Backend tự chạy `alembic upgrade head` mỗi lần khởi động.

| Dịch vụ | Ảnh | Dữ liệu lưu ở |
|---|---|---|
| `db` | `postgres:16-alpine` | volume `db-data` |
| `backend` | build từ `backend/Dockerfile` | volume `uploads` (ảnh tải lên) |
