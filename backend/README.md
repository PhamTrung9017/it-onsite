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
| `locust -f loadtest/locustfile.py --host <địa chỉ> --headless -u 50 -r 10 -t 3m` | Kiểm thử tải 50 người dùng đồng thời (NFR-01), cài bằng `pip install -r loadtest/requirements.txt` |

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

Mọi thay đổi trạng thái phiếu đi qua một hàm duy nhất `services/common.py: transition`, hàm này kiểm tra chuyển trạng thái hợp lệ, tăng `version`, ghi lịch sử, ghi nhật ký (NFR-08) và gửi thông báo. Sửa bảng giá, linh kiện, kỹ thuật viên và cấu hình được ghi nhật ký kèm giá trị cũ → mới (`services/changes.py`).

## Quy tắc nghiệp vụ

| Mã | Cài đặt |
|---|---|
| BR-01, BR-13 | Đơn giá cố định trên báo giá lúc lập; phát sinh khi đang làm phải lập báo giá bổ sung (`services/technician.py: create_quote`) |
| BR-02 | Phí khảo sát trả trước làm phí giữ lịch, quá hạn chưa trả thì phiếu tự hủy; điều phối viên xác nhận đã nhận mới tiếp nhận phiếu; trừ vào tổng tiền khi khách duyệt báo giá, là phí khảo sát khi khách từ chối (`services/deposits.py`, `domain/rules.py: amount_due`) |
| BR-03 | Hủy khi cửa hàng chưa tiếp nhận thì hoàn phí giữ lịch; hủy sau đó do khách (kể cả vắng mặt) thì không hoàn, cửa hàng hủy thì hoàn; không hủy sau check-in; khách tự đổi lịch khi còn đủ thời gian trước giờ hẹn (`cancellation_policy`, `reschedule_policy`) |
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

Tất cả có tiền tố `/api/v1`. Xác thực bằng `Authorization: Bearer <accessToken>`; access token sống 15 phút, refresh token 7 ngày và chỉ dùng một lần.

| Nhóm | Endpoint | Use case |
|---|---|---|
| Xác thực | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `GET /auth/me` | UC01 |
| Hồ sơ | `PATCH /me`, `GET/POST /me/devices`, `DELETE /me/devices/{id}`, `GET /me/export`, `POST /me/deletion-request`, `POST /me/telegram-link` | UC02, NFR-10 |
| Danh mục | `GET /catalog`, `GET /parts` | UC03 |
| Khách hàng | `POST /classify`, `POST /tickets`, `GET /tickets/mine`, `GET /tickets/{id}`, `POST /tickets/{id}/cancel`, `/reschedule`, `/quotes/{qid}/decision`, `/acceptance`, `GET /tickets/{id}/deposit`, `POST /tickets/{id}/deposit/transfer`, `GET /tickets/{id}/payment`, `POST /tickets/{id}/payment/transfer`, `/payment/cash`, `/review`, `GET /warranties/mine`, `POST /warranty-claims` | UC04–UC07, UC11, UC13–UC16 |
| Kỹ thuật viên | `GET /tech/jobs`, `GET /tech/profile`, `POST /tickets/{id}/assignment/response`, `/check-in`, `/quotes`, `/onsite-code`, `/onsite-code/confirm`, `PUT /tickets/{id}/checklist`, `POST/DELETE /tickets/{id}/photos`, `POST /tickets/{id}/complete`, `/payment/cash-received` | UC09, UC10, UC12, UC14 |
| Điều phối | `GET /dispatch/board`, `POST /tickets/{id}/receive`, `GET /tickets/{id}/technician-suggestions`, `POST /tickets/{id}/assign`, `GET /deposits`, `POST /tickets/{id}/deposit/confirm`, `/deposit/refund`, `GET /payments`, `POST /tickets/{id}/payment/confirm`, `/payment/reconcile`, `GET /warranty-claims`, `POST /warranty-claims/{id}/decision` | UC05, UC08, UC14, UC15 |
| Thông báo | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read` | UC17 |
| Quản trị | `GET /admin/overview`, `GET /admin/users` (tìm `q=`, lọc `role=`), `GET /admin/audit`, `PUT /admin/services`, `/admin/parts`, `/admin/technicians`, `/admin/users/{id}/roles`, `POST /admin/users`, `PUT /admin/config`, `GET /admin/reports`, `GET /admin/reports/export` (kỳ `days=`, `month=` hoặc `from=`&`to=`; lọc `techId=`, `category=`, `ward=`) | UC18–UC23 |

Danh sách có thể dài (`/tickets/mine` lọc `group=open|done|cancelled`, `/notifications`, `/warranty-claims`, `/admin/users`, `/admin/audit`) phân trang bằng `limit` (mặc định 20, tối đa 100) và `offset`; tổng số bản ghi trả trong header `X-Total-Count`.

Lỗi nghiệp vụ trả về `{"detail": "<thông báo tiếng Việt>"}` với mã 400, 401, 403, 404, 409 hoặc 429.

## Bảo mật

- Mọi endpoint trừ đăng ký, đăng nhập, làm mới phiên, quên mật khẩu, danh mục và kiểm tra trạng thái đều cần đăng nhập; quyền theo vai trò kiểm tra ở backend (NFR-05). `tests/test_security.py` thử toàn bộ endpoint với từng vai trò.
- Truy vấn qua ORM có tham số; nội dung người dùng nhập được trả về dạng chữ thuần, giao diện React không chèn HTML; ảnh tải lên chỉ nhận JPEG, PNG, WebP đúng chữ ký tệp (NFR-09).
- Phản hồi có `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`; dữ liệu API không lưu bộ nhớ đệm. Giao diện qua nginx có thêm Content-Security-Policy (`frontend/security-headers.conf`).
- Khi `APP_ENV=production`, backend không khởi động nếu `JWT_SECRET`, `CREDENTIAL_KEY` là giá trị mặc định hoặc ngắn hơn 32 ký tự.

## Tác vụ nền

Chạy cùng tiến trình API (tắt bằng `BACKGROUND_JOBS=false`):

- Mỗi 30 giây thu hồi phân công quá hạn phản hồi (BR-06) và hủy phiếu quá hạn chưa trả phí giữ lịch (BR-02). Bảng điều phối cũng kiểm tra mỗi lần tải.
- Mỗi 15 giây gửi tin trong hàng đợi `outbox` qua Telegram và email. Gửi lỗi thì thử lại sau 2, 4, 8 phút, tối đa 3 lần gửi lại (NFR-14). Khi chưa cấu hình cách gửi email, nội dung email được ghi ra log.

## Dịch vụ bên ngoài

- **Gemini API**: đặt `GEMINI_API_KEY`. Mô tả sự cố được lọc số điện thoại, email, mật khẩu, số nhà trước khi gửi (NFR-10); quá 10 giây thì bỏ qua (NFR-03); kết quả sai định dạng thì gửi lại một lần (UC05 luồng 3a). Không có khóa thì hệ thống phân loại theo từ khóa.
- **Telegram**: đặt `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (`TELEGRAM_WEBHOOK_SECRET` không bắt buộc, để trống thì sinh từ `JWT_SECRET`). Khi `APP_URL` là địa chỉ HTTPS, backend tự đăng ký webhook `<APP_URL>/api/v1/telegram/webhook` mỗi lần khởi động. Người dùng bấm liên kết từ `POST /me/telegram-link` để gắn tài khoản. Nhóm chat chung của đội: thêm bot vào nhóm, quản trị viên đã gắn tài khoản gửi `/ketnoinhom@<tên bot>` trong nhóm (ghi kèm tên bot để bot nhận được lệnh cả khi bật chế độ riêng tư); bot báo phiếu chờ phân công, phân công, phản hồi của kỹ thuật viên, phiếu hủy, phiếu hoàn tất (không ghi số điện thoại, địa chỉ của khách). Tin phân công gửi riêng cho kỹ thuật viên có nút Nhận việc, Từ chối (`services/telegram.py`, `services/telegram_bot.py`). Lệnh xem nhanh, dùng trong tin riêng hoặc trong nhóm: `/viec` (kỹ thuật viên: việc hôm nay), `/tongquan` (quản trị viên, điều phối viên: phiếu và doanh thu hôm nay), `/trogiup`; menu lệnh được đăng ký khi khởi động (`services/telegram_commands.py`).
- **Tình trạng hệ thống**: `GET /admin/system-status` (quản trị viên) kiểm tra CSDL, tác vụ nền, hàng đợi thông báo, bot và nhóm Telegram, email, Gemini; không gửi tin hay email thật (`services/system_status.py`).
- **Email**: đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`; hoặc, khi máy chủ chặn cổng SMTP, đặt `EMAIL_RELAY_URL`, `EMAIL_RELAY_SECRET` để gửi qua Google Apps Script (`infra/email-relay/Code.gs`). Khách có email nhận thư chào mừng khi đăng ký và biên nhận dịch vụ khi phiếu hoàn tất (`services/receipts.py`).
