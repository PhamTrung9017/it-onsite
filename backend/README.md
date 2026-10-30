# Backend

REST API của IT OnSite: Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL 16, Alembic.

## Chạy trên máy

Yêu cầu: Python 3.12 trở lên, PostgreSQL 16.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # điền DATABASE_URL, JWT_SECRET, CREDENTIAL_KEY
alembic upgrade head
python -m app.seed demo            # dữ liệu trình diễn, mật khẩu mọi tài khoản: 123456
uvicorn app.main:app --reload
```

Tài liệu API tự sinh: http://localhost:8000/docs

| Lệnh | Tác dụng |
|---|---|
| `python -m app.seed catalog` | Nạp tham số nghiệp vụ, loại sự cố, bảng giá, linh kiện (không xóa dữ liệu cũ) |
| `python -m app.seed admin --email ... --name ...` | Tạo tài khoản quản trị viên đầu tiên, nhập mật khẩu khi được hỏi |
| `python -m app.seed demo` | Xóa toàn bộ dữ liệu và nạp dữ liệu trình diễn |
| `pytest --cov` | Chạy kiểm thử và đo độ bao phủ, yêu cầu tối thiểu 80% (cần cơ sở dữ liệu `itonsite_test`) |
| `ruff check . && ruff format --check .` | Kiểm tra quy ước mã nguồn |

Kiểm thử dùng cơ sở dữ liệu riêng, mặc định `postgresql+psycopg://itonsite:itonsite@localhost:5432/itonsite_test`; đổi bằng biến môi trường `DATABASE_URL`.

## Cấu trúc

```
backend/
├── app/
│   ├── api/          Các nhóm endpoint theo vai trò
│   ├── core/         Cấu hình, lỗi, bảo mật (Argon2, JWT, AES-256-GCM)
│   ├── domain/       Quy tắc nghiệp vụ thuần: máy trạng thái, BR-02 → BR-11, VietQR, lọc dữ liệu cá nhân
│   ├── services/     Nghiệp vụ theo use case, thao tác cơ sở dữ liệu
│   ├── models.py     Bảng dữ liệu
│   ├── schemas.py    Dữ liệu đầu vào
│   ├── seed.py       Dữ liệu ban đầu và dữ liệu trình diễn
│   ├── workers.py    Tác vụ nền
│   └── main.py
├── migrations/       Alembic
└── tests/
```

Mọi thay đổi trạng thái phiếu đi qua một hàm duy nhất `services/common.py: transition`, hàm này kiểm tra chuyển trạng thái hợp lệ, tăng `version`, ghi lịch sử, ghi nhật ký (NFR-08) và gửi thông báo.

## Quy tắc nghiệp vụ

| Mã | Cài đặt |
|---|---|
| BR-01, BR-13 | Đơn giá cố định trên báo giá lúc lập; phát sinh khi đang làm phải lập báo giá bổ sung (`services/technician.py: create_quote`) |
| BR-02 | Phí khảo sát chỉ thu khi khách từ chối báo giá chính (`domain/rules.py: amount_due`) |
| BR-03 | Hủy, đổi lịch miễn phí trước mốc cấu hình, sát giờ tính phí khảo sát, không hủy sau check-in (`cancellation_policy`) |
| BR-04 | Không phân công trùng lịch, tính cả thời lượng dịch vụ và thời gian đệm di chuyển (`has_conflict`) |
| BR-05 | Gợi ý kỹ thuật viên: đúng kỹ năng → đúng khu vực → ít việc trong ngày → đánh giá cao (`rank_technicians`); kỹ thuật viên trùng lịch hoặc ngoài lịch làm việc (UC18, `off_duty`) xếp cuối và không phân công được |
| BR-06 | Quá hạn phản hồi thì tự thu hồi phân công (`services/dispatch.py: sweep_overdue_assignments`) |
| BR-07 | Bảo hành phát hành theo từng hạng mục khi hoàn tất; chỉ chấp nhận yêu cầu còn hạn, phiếu bảo hành không tính phí |
| BR-08 | Chuyển khoản hoàn tất khi điều phối viên xác nhận; tiền mặt hoàn tất khi kỹ thuật viên xác nhận đã thu, điều phối viên đối soát sau |
| BR-09 | Gợi ý AI chỉ để tham khảo, giá lấy từ bảng giá; điều phối viên chốt loại sự cố khi tiếp nhận |
| BR-10 | Đánh giá một lần trong thời hạn cấu hình; từ 2 sao trở xuống bắt buộc ghi lý do và báo quản trị viên |
| BR-11 | Cần ít nhất 1 ảnh trước và 1 ảnh sau mới báo hoàn thành |
| BR-12 | Thông tin đăng nhập máy mã hóa AES-256-GCM, chỉ kỹ thuật viên phụ trách xem, tự xóa khi phiếu kết thúc |
| UC08 ngoại lệ 4a | Thao tác gửi kèm `version` của phiếu; dữ liệu cũ bị từ chối với mã 409 |

## Endpoint chính

Tất cả có tiền tố `/api`. Xác thực bằng `Authorization: Bearer <accessToken>`; access token sống 15 phút, refresh token 7 ngày và chỉ dùng một lần.

| Nhóm | Endpoint | Use case |
|---|---|---|
| Xác thực | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `GET /auth/me` | UC01 |
| Hồ sơ | `PATCH /me`, `GET/POST /me/devices`, `DELETE /me/devices/{id}`, `GET /me/export`, `POST /me/deletion-request`, `POST /me/telegram-link` | UC02, NFR-10 |
| Danh mục | `GET /catalog`, `GET /parts` | UC03 |
| Khách hàng | `POST /classify`, `POST /tickets`, `GET /tickets/mine`, `GET /tickets/{id}`, `POST /tickets/{id}/cancel`, `/reschedule`, `/quotes/{qid}/decision`, `/acceptance`, `GET /tickets/{id}/payment`, `POST /tickets/{id}/payment/transfer`, `/payment/cash`, `/review`, `GET /warranties/mine`, `POST /warranty-claims` | UC04–UC07, UC11, UC13–UC16 |
| Kỹ thuật viên | `GET /tech/jobs`, `GET /tech/profile`, `POST /tickets/{id}/assignment/response`, `/check-in`, `/quotes`, `/onsite-code`, `/onsite-code/confirm`, `PUT /tickets/{id}/checklist`, `POST/DELETE /tickets/{id}/photos`, `POST /tickets/{id}/complete`, `/payment/cash-received` | UC09, UC10, UC12, UC14 |
| Điều phối | `GET /dispatch/board`, `POST /tickets/{id}/receive`, `GET /tickets/{id}/technician-suggestions`, `POST /tickets/{id}/assign`, `GET /payments`, `POST /tickets/{id}/payment/confirm`, `/payment/reconcile`, `GET /warranty-claims`, `POST /warranty-claims/{id}/decision` | UC05, UC08, UC14, UC15 |
| Thông báo | `GET /notifications`, `POST /notifications/read` | UC17 |
| Quản trị | `GET /admin/overview`, `PUT /admin/services`, `/admin/parts`, `/admin/technicians`, `/admin/users/{id}/roles`, `POST /admin/users`, `PUT /admin/config`, `GET /admin/reports?days=`, `GET /admin/reports/tickets?days=` | UC18–UC23 |

Lỗi nghiệp vụ trả về `{"detail": "<thông báo tiếng Việt>"}` với mã 400, 401, 403, 404, 409 hoặc 429.

## Tác vụ nền

Chạy cùng tiến trình API (tắt bằng `BACKGROUND_JOBS=false`):

- Mỗi 30 giây thu hồi phân công quá hạn phản hồi (BR-06). Bảng điều phối cũng kiểm tra mỗi lần tải.
- Mỗi 15 giây gửi tin trong hàng đợi `outbox` qua Telegram và email. Gửi lỗi thì thử lại sau 2, 4, 8 phút, tối đa 3 lần gửi lại (NFR-14). Khi chưa cấu hình SMTP, nội dung email được ghi ra log.

## Dịch vụ bên ngoài

- **Gemini API**: đặt `GEMINI_API_KEY`. Mô tả sự cố được lọc số điện thoại, email, mật khẩu, số nhà trước khi gửi (NFR-10); quá 10 giây thì bỏ qua (NFR-03); kết quả sai định dạng thì gửi lại một lần (UC05 luồng 3a). Không có khóa thì hệ thống phân loại theo từ khóa.
- **Telegram**: đặt `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, rồi đăng ký webhook `https://<tên miền>/api/telegram/webhook` với `secret_token` bằng `TELEGRAM_WEBHOOK_SECRET`. Người dùng bấm liên kết từ `POST /me/telegram-link` để gắn tài khoản.
- **Email**: đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
