# Frontend

Giao diện web của IT OnSite, xây dựng bằng React 18 và Vite 5. Khách hàng và kỹ thuật viên dùng giao diện ưu tiên điện thoại; điều phối viên và quản trị viên dùng giao diện có thanh điều hướng bên trái.

Giao diện chạy được theo hai cách:

- **Gọi backend thật** (`src/services/http`): đặt `VITE_API_URL=/api`. Vite chuyển tiếp `/api` và `/media` tới backend ở `VITE_PROXY_TARGET` (mặc định http://localhost:8000).
- **Dữ liệu giả lập** (`src/services/mock`): để trống `VITE_API_URL`. Dữ liệu lưu trong `localStorage` của trình duyệt, áp dụng cùng máy trạng thái và quy tắc nghiệp vụ như backend; dùng để trình bày giao diện khi không có máy chủ.

## Chạy thử

Yêu cầu Node.js 18 trở lên.

```bash
cd frontend
npm install
cp .env.example .env       # bỏ dòng VITE_API_URL nếu muốn chạy bằng dữ liệu giả lập
npm run dev
```

Mở http://localhost:5173. Khi gọi backend thật, chạy backend trước theo hướng dẫn trong `backend/README.md`.

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy chế độ phát triển, tự tải lại khi sửa mã |
| `npm run build` | Đóng gói vào thư mục `dist/` |
| `npm run preview` | Chạy thử bản đã đóng gói tại http://localhost:4173 |
| `npm run lint` | Kiểm tra mã nguồn bằng ESLint |
| `npm test` | Kiểm thử đơn vị các quy tắc nghiệp vụ (Vitest) |
| `npm run test:e2e` | Kiểm thử đầu-cuối trên trình duyệt với dữ liệu giả lập (Playwright) |
| `npm run test:e2e:backend` | Kiểm thử đầu-cuối với backend thật đang chạy ở cổng 8000; nạp lại dữ liệu trình diễn trước mỗi kịch bản |

Lần đầu chạy kiểm thử đầu-cuối cần cài trình duyệt: `npx playwright install chromium`.

## Tài khoản dùng thử

Có sau khi nạp dữ liệu trình diễn (`python -m app.seed demo` ở backend) hoặc khi chạy bằng dữ liệu giả lập. Mật khẩu chung: `123456`. Nút đăng nhập nhanh hiện khi chạy dữ liệu giả lập hoặc khi đặt `VITE_DEMO_ACCOUNTS=true`.

| Vai trò | Email | Ghi chú |
|---|---|---|
| Khách hàng | khach@demo.vn | Có sẵn phiếu chờ duyệt báo giá, phiếu đã hoàn tất còn bảo hành |
| Kỹ thuật viên | ktv@demo.vn | Có sẵn một việc mới đang chờ phản hồi |
| Điều phối viên | dpv@demo.vn | |
| Quản trị viên | qtv@demo.vn | Có thêm vai trò điều phối viên, đổi vai trò ở menu tài khoản |

Dữ liệu trình diễn gồm 30 ngày lịch sử phiếu để màn hình báo cáo có số liệu. Với dữ liệu giả lập, chọn **Khôi phục dữ liệu mẫu** trong menu tài khoản để quay về trạng thái ban đầu. Số tài khoản ngân hàng trong mã VietQR là số mẫu, quản trị viên đổi trong màn hình cấu hình tham số.

## Cấu trúc thư mục

```
frontend/
├── e2e/                     Kiểm thử đầu-cuối (Playwright)
├── public/                  Biểu tượng trang
└── src/
    ├── components/          Thành phần dùng chung: ui, bố cục, phiếu
    ├── context/             Đăng nhập, thông báo, toast
    ├── hooks/               useLoad, useAction
    ├── lib/                 Quy tắc nghiệp vụ, máy trạng thái, VietQR, phân loại sự cố
    ├── pages/
    │   ├── public/          Trang chủ, bảng giá, đăng nhập, đăng ký
    │   ├── customer/        Khách hàng
    │   ├── technician/      Kỹ thuật viên
    │   ├── dispatcher/      Điều phối viên
    │   └── admin/           Quản trị viên
    ├── services/
    │   ├── api.js           Chọn API thật hoặc API giả lập theo VITE_API_URL
    │   ├── http/            Gọi REST API, gắn JWT, tự làm mới phiên
    │   └── mock/            Dữ liệu mẫu và API giả lập
    └── styles/
```

## Màn hình và use case

| Đường dẫn | Màn hình | Use case |
|---|---|---|
| `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` | Đăng nhập, đăng ký, quên và đặt lại mật khẩu | UC01 |
| `/`, `/bang-gia` | Trang chủ, bảng giá dịch vụ | UC03 |
| `/khach/ho-so` | Hồ sơ, thiết bị, tải về và yêu cầu xóa dữ liệu | UC02 |
| `/khach/tao-yeu-cau` | Đặt lịch 3 bước, gợi ý loại sự cố | UC04, UC05 |
| `/khach/phieu`, `/khach/phieu/:id` | Danh sách, chi tiết phiếu, hủy, đổi lịch, nghiệm thu, đánh giá | UC06, UC07, UC13, UC16 |
| `/khach/phieu/:id/bao-gia` | Duyệt toàn bộ, một phần hoặc từ chối báo giá | UC11 |
| `/khach/phieu/:id/thanh-toan` | Chuyển khoản VietQR hoặc tiền mặt | UC14 |
| `/khach/phieu/:id/bien-nhan` | Biên nhận dịch vụ in được sau khi hoàn tất | UC06 |
| `/khach/bao-hanh` | Phiếu bảo hành, gửi yêu cầu bảo hành | UC15 |
| `/ktv/lich-viec`, `/ktv/viec/:id` | Lịch việc, nhận hoặc từ chối, check-in, ảnh, checklist, hoàn thành, thu tiền | UC09, UC12, UC14 |
| `/ktv/viec/:id/bao-gia` | Lập báo giá chính và báo giá bổ sung | UC10 |
| `/dieu-phoi` | Bảng điều phối: tiếp nhận, xác nhận loại sự cố, phân công theo kỹ năng, khu vực và lịch làm việc | UC05, UC08 |
| `/dieu-phoi/thanh-toan` | Xác nhận chuyển khoản, đối soát tiền mặt | UC14 |
| `/dieu-phoi/bao-hanh` | Xử lý yêu cầu bảo hành | UC15 |
| `.../thong-bao` | Thông báo trên web (mọi vai trò) | UC17 |
| `/quan-tri/ky-thuat-vien` | Kỹ thuật viên: kỹ năng, khu vực, lịch làm việc, ngày nghỉ, khóa | UC18 |
| `/quan-tri/dich-vu`, `/quan-tri/linh-kien` | Dịch vụ, bảng giá, linh kiện | UC19, UC20 |
| `/quan-tri/bao-cao` | Báo cáo thống kê theo 7 ngày, 30 ngày hoặc theo tháng; xuất file Excel gồm tổng quan, doanh thu, bảng lương và hiệu suất kỹ thuật viên, đối soát, linh kiện, đánh giá, danh sách phiếu | UC21 |
| `/quan-tri/tai-khoan` | Tài khoản nội bộ và phân quyền | UC22 |
| `/quan-tri/cau-hinh`, `/quan-tri/nhat-ky` | Tham số nghiệp vụ (kể cả lương cứng, % hoa hồng kỹ thuật viên), nhật ký hệ thống | UC23, NFR-08 |

## Gọi API

Màn hình chỉ gọi qua đối tượng `api` trong `src/services/api.js`; `httpApi` và `mockApi` có cùng tên hàm và cùng dạng dữ liệu trả về. `httpApi` lưu access token và refresh token, tự làm mới khi access token hết hạn (NFR-05) và đưa người dùng về trang đăng nhập khi phiên kết thúc. Lỗi từ máy chủ được chuyển thành `ApiError` mang thông báo tiếng Việt để hiển thị.

Quy tắc nghiệp vụ được kiểm tra ở backend; `src/lib` giữ bản dùng cho giao diện (hiển thị phí hủy, trạng thái nút) và cho dữ liệu giả lập.

## Kiểm thử

- `src/lib/lib.test.js`: 17 ca kiểm thử đơn vị cho máy trạng thái, phí, trùng lịch, xếp hạng kỹ thuật viên, bảo hành, đánh giá, VietQR (CRC-16), phân loại sự cố.
- `e2e/luong-nghiep-vu.spec.js`: chạy trọn quy trình từ khách đặt lịch tới bảo hành qua 4 vai trò, nhánh từ chối báo giá, quá hạn phản hồi, hủy phiếu, phân quyền. Chạy được với cả dữ liệu giả lập và backend thật.
- `e2e/giao-dien.spec.js`: mở mọi màn hình trên máy tính và điện thoại, kiểm tra không lỗi JavaScript và không tràn ngang.
