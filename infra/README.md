# Infra

Chạy toàn bộ hệ thống bằng Docker Compose.

```bash
cd infra
cp .env.example .env        # điền DB_PASSWORD, JWT_SECRET, CREDENTIAL_KEY
docker compose up -d --build
docker compose exec backend python -m app.seed demo
```

Giao diện chạy tại http://localhost:8080, API tại http://localhost:8000 (tài liệu API: http://localhost:8000/docs). Backend tự chạy `alembic upgrade head` mỗi lần khởi động.

| Dịch vụ | Ảnh | Dữ liệu lưu ở |
|---|---|---|
| `db` | `postgres:16-alpine` | volume `db-data` |
| `backend` | build từ `backend/Dockerfile` | ảnh tải lên lưu trong CSDL (bảng `media_files`) |
| `frontend` | build từ `frontend/Dockerfile`, nginx phục vụ giao diện và chuyển tiếp `/api`, `/media` tới backend | |

## Triển khai lên Render

`Dockerfile` ở thư mục gốc dựng một image duy nhất: backend phục vụ API, ảnh và bản dựng giao diện trên cùng một địa chỉ (`FRONTEND_DIR`). `render.yaml` mô tả dịch vụ web gói miễn phí ở Singapore, cơ sở dữ liệu PostgreSQL đặt ở Neon.

1. Tạo cơ sở dữ liệu trên Neon, lấy chuỗi kết nối.
2. Render → New → Blueprint → chọn repo; điền `DATABASE_URL` và các khóa dịch vụ bên ngoài.
3. Mỗi lần khởi động, máy chủ chạy `alembic upgrade head`, `python -m app.seed auto` (chỉ nạp dữ liệu khi CSDL còn trống) rồi tự đăng ký webhook Telegram với địa chỉ `RENDER_EXTERNAL_URL`.

Render tự dựng và chạy bản mới mỗi khi `main` có commit mới.

Gói miễn phí của Render chặn cổng SMTP nên email gửi qua `infra/email-relay/Code.gs` (Google Apps Script, `EMAIL_RELAY_URL`, `EMAIL_RELAY_SECRET`). Dịch vụ tạm ngủ sau 15 phút không có truy cập; lần truy cập kế tiếp mất khoảng một phút để khởi động lại.

## Sao lưu và khôi phục

Workflow `.github/workflows/backup.yml` chạy lúc 02:00 mỗi ngày (chạy tay được ở tab Actions): sao lưu CSDL bằng `pg_dump`, khôi phục thử vào một CSDL tạm và kiểm tra dữ liệu, mã hóa AES-256 rồi lưu thành artifact giữ 7 ngày (7 bản gần nhất). Cần hai secret của repo: `BACKUP_DATABASE_URL` (chuỗi kết nối Neon) và `BACKUP_PASSPHRASE`.

Khôi phục từ một bản sao lưu:

```bash
gpg -d -o itonsite.dump itonsite.dump.gpg                 # nhập BACKUP_PASSPHRASE
pg_restore --clean --if-exists --no-owner --no-privileges -d "<chuỗi kết nối CSDL>" itonsite.dump
```
