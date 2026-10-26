# IT OnSite – Hệ thống quản lý dịch vụ hỗ trợ IT tận nơi

Đồ án thực tế Công nghệ phần mềm – Mã học phần 010412203902 – Học kỳ 1, năm học 2026–2027
Trường Đại học Giao thông vận tải TP. Hồ Chí Minh

Giảng viên hướng dẫn: Vũ Đình Long

## Giới thiệu

IT OnSite là ứng dụng web giúp một dịch vụ cài đặt phần mềm, sửa chữa và bảo trì máy tính tận nơi quản lý toàn bộ vòng đời một yêu cầu hỗ trợ:

1. Khách đặt lịch và mô tả sự cố; AI gợi ý loại sự cố và dịch vụ phù hợp.
2. Điều phối viên phân công kỹ thuật viên theo kỹ năng, khu vực và lịch trống.
3. Kỹ thuật viên khảo sát, lập báo giá tại chỗ; khách duyệt báo giá trước khi làm.
4. Kỹ thuật viên cập nhật tiến độ kèm ảnh trước và sau; khách nghiệm thu.
5. Thanh toán tiền mặt hoặc chuyển khoản VietQR; phát hành phiếu bảo hành; khách đánh giá dịch vụ.

Đơn vị đặt hàng: dịch vụ Cài Win Dạo (TP. Hồ Chí Minh).

## Thành viên

| Mã | Họ và tên | Vai trò | Phụ trách chính |
|---|---|---|---|
| TV1 | Phạm Ngọc Trung | Trưởng nhóm | Backend, AI, triển khai |
| TV2 | Trần Quốc Anh Hoàng | Thành viên | Frontend, giao diện |
| TV3 | Nguyễn Văn Thu | Thành viên | Phân tích nghiệp vụ, kiểm thử, tài liệu |

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Giao diện | React |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic |
| Cơ sở dữ liệu | PostgreSQL 16 |
| AI phân loại sự cố | Gemini API |
| Thông báo | Telegram Bot API, email (SMTP) |
| Kiểm thử | Pytest, Playwright |
| Đóng gói, triển khai | Docker, GitHub Actions |

## Cấu trúc thư mục

```
it-onsite/
├── backend/        Mã nguồn REST API (FastAPI)
├── frontend/       Mã nguồn giao diện (React)
├── infra/          Docker Compose, cấu hình triển khai
├── docs/           Tài liệu dự án
│   ├── srs/        Tài liệu đặc tả yêu cầu phần mềm (SRS)
│   └── quan-ly/    WBS, bảng phân công nhiệm vụ
└── .github/        Mẫu Issue, mẫu Pull Request
```

## Tài liệu

| Tài liệu | Vị trí | Trạng thái |
|---|---|---|
| Đặc tả yêu cầu phần mềm (SRS) v0.1 | [docs/srs/SRS_IT_OnSite_v0.1.docx](docs/srs/SRS_IT_OnSite_v0.1.docx) | Đã duyệt |
| WBS và kế hoạch | [docs/quan-ly/WBS_IT_OnSite.xlsx](docs/quan-ly/WBS_IT_OnSite.xlsx) | Đã duyệt |
| Phân công nhiệm vụ theo giai đoạn | [docs/quan-ly/PhanCong_IT_OnSite.xlsx](docs/quan-ly/PhanCong_IT_OnSite.xlsx) | Đang theo dõi |

## Quản lý công việc

- Mỗi công việc trong bảng phân công là một [Issue](../../issues), tiêu đề bắt đầu bằng mã công việc, ví dụ `[GĐ2-01]`.
- Nhãn `GĐ1` … `GĐ6` cho biết giai đoạn; nhãn `TV1`, `TV2`, `TV3` cho biết người thực hiện.
- Mốc `Giữa kỳ` và `Cuối kỳ` nhóm các công việc theo đợt nộp kết quả.
- Mỗi Issue có danh sách các bước dạng ô đánh dấu; đánh dấu từng bước khi làm xong, đóng Issue khi đạt đủ tiêu chí hoàn thành.

## Quy trình làm việc với Git

### Nhánh

| Nhánh | Mục đích |
|---|---|
| `main` | Bản ổn định, dùng để nộp và demo |
| `develop` | Nhánh tích hợp, mọi công việc gộp vào đây trước |
| `feature/<mã công việc>-<tên ngắn>` | Làm một công việc, ví dụ `feature/gd4-03-phieu-yeu-cau` |
| `fix/<tên ngắn>` | Sửa lỗi, ví dụ `fix/sai-tong-tien-bao-gia` |

### Các bước làm một công việc

```bash
git checkout develop
git pull origin develop
git checkout -b feature/gd2-04-dac-ta-uc-khach-hang
# ... làm việc, commit ...
git push -u origin feature/gd2-04-dac-ta-uc-khach-hang
```

Sau đó mở Pull Request vào `develop`, ghi `Closes #<số Issue>` trong phần mô tả và nhờ người review ghi trong Issue.

### Quy ước commit

Theo [Conventional Commits](https://www.conventionalcommits.org/):

| Tiền tố | Dùng khi |
|---|---|
| `feat:` | Thêm chức năng |
| `fix:` | Sửa lỗi |
| `docs:` | Thêm hoặc sửa tài liệu |
| `test:` | Thêm hoặc sửa kiểm thử |
| `refactor:` | Cải tổ mã nguồn, không đổi chức năng |
| `chore:` | Cấu hình, công cụ, việc lặt vặt |

Ví dụ: `feat: thêm API tạo phiếu yêu cầu (UC04)`

### Pull Request

- Chỉ gộp vào `develop` và `main` qua Pull Request, không push trực tiếp.
- Mỗi Pull Request cần ít nhất 1 thành viên khác review và đồng ý.
- `develop` được gộp vào `main` ở mỗi mốc nộp kết quả.
