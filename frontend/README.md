# Frontend

Giao diện web của IT OnSite, xây dựng bằng React 18 và Vite 5. Khách hàng và kỹ thuật viên dùng giao diện ưu tiên điện thoại; điều phối viên và quản trị viên dùng giao diện có thanh điều hướng bên trái.

Hiện tại giao diện chạy trên **lớp API giả lập** (`src/services/mock`), dữ liệu lưu trong `localStorage` của trình duyệt. Lớp giả lập cài đặt đầy đủ máy trạng thái phiếu và các quy tắc nghiệp vụ trong SRS, nên cả nhóm có thể chạy thử toàn bộ quy trình trước khi backend FastAPI hoàn thành. Khi backend sẵn sàng, chỉ cần thay `src/services/api.js`.

## Chạy thử

Yêu cầu Node.js 18 trở lên.

```bash
cd frontend
npm install
npm run dev
```

Mở http://localhost:5173.

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy chế độ phát triển, tự tải lại khi sửa mã |
| `npm run build` | Đóng gói vào thư mục `dist/` |
| `npm run preview` | Chạy thử bản đã đóng gói tại http://localhost:4173 |
| `npm run lint` | Kiểm tra mã nguồn bằng ESLint |
| `npm test` | Kiểm thử đơn vị các quy tắc nghiệp vụ (Vitest) |
| `npm run test:e2e` | Kiểm thử đầu-cuối trên trình duyệt (Playwright) |

Lần đầu chạy kiểm thử đầu-cuối cần cài trình duyệt: `npx playwright install chromium`.

## Tài khoản dùng thử

Mật khẩu chung: `123456`. Trang đăng nhập có sẵn nút đăng nhập nhanh cho 4 vai trò.

| Vai trò | Email | Ghi chú |
|---|---|---|
| Khách hàng | khach@demo.vn | Có sẵn phiếu chờ duyệt báo giá, phiếu đã hoàn tất còn bảo hành |
| Kỹ thuật viên | ktv@demo.vn | Có sẵn một việc mới đang chờ phản hồi |
| Điều phối viên | dpv@demo.vn | |
| Quản trị viên | qtv@demo.vn | Có thêm vai trò điều phối viên, đổi vai trò ở menu tài khoản |

Dữ liệu mẫu gồm 30 ngày lịch sử phiếu để màn hình báo cáo có số liệu. Muốn quay về trạng thái ban đầu, chọn **Khôi phục dữ liệu mẫu** trong menu tài khoản. Số tài khoản ngân hàng trong mã VietQR là số mẫu, chưa phải tài khoản thật.

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
    │   ├── api.js           Điểm đổi giữa API giả lập và API thật
    │   └── mock/            Dữ liệu mẫu và API giả lập
    └── styles/
```

## Màn hình và use case

| Đường dẫn | Màn hình | Use case |
|---|---|---|
| `/dang-nhap`, `/dang-ky`, `/quen-mat-khau` | Đăng nhập, đăng ký, quên mật khẩu | UC01 |
| `/`, `/bang-gia` | Trang chủ, bảng giá dịch vụ | UC03 |
| `/khach/ho-so` | Hồ sơ, thiết bị, tải về và yêu cầu xóa dữ liệu | UC02 |
| `/khach/tao-yeu-cau` | Đặt lịch 3 bước, gợi ý loại sự cố | UC04, UC05 |
| `/khach/phieu`, `/khach/phieu/:id` | Danh sách, chi tiết phiếu, hủy, đổi lịch, nghiệm thu, đánh giá | UC06, UC07, UC13, UC16 |
| `/khach/phieu/:id/bao-gia` | Duyệt toàn bộ, một phần hoặc từ chối báo giá | UC11 |
| `/khach/phieu/:id/thanh-toan` | Chuyển khoản VietQR hoặc tiền mặt | UC14 |
| `/khach/bao-hanh` | Phiếu bảo hành, gửi yêu cầu bảo hành | UC15 |
| `/ktv/lich-viec`, `/ktv/viec/:id` | Lịch việc, nhận hoặc từ chối, check-in, ảnh, checklist, hoàn thành, thu tiền | UC09, UC12, UC14 |
| `/ktv/viec/:id/bao-gia` | Lập báo giá chính và báo giá bổ sung | UC10 |
| `/dieu-phoi` | Bảng điều phối: tiếp nhận, xác nhận loại sự cố, phân công | UC05, UC08 |
| `/dieu-phoi/thanh-toan` | Xác nhận chuyển khoản, đối soát tiền mặt | UC14 |
| `/dieu-phoi/bao-hanh` | Xử lý yêu cầu bảo hành | UC15 |
| `.../thong-bao` | Thông báo trên web (mọi vai trò) | UC17 |
| `/quan-tri/ky-thuat-vien` | Kỹ thuật viên: kỹ năng, khu vực, khóa | UC18 |
| `/quan-tri/dich-vu`, `/quan-tri/linh-kien` | Dịch vụ, bảng giá, linh kiện | UC19, UC20 |
| `/quan-tri/bao-cao` | Báo cáo thống kê | UC21 |
| `/quan-tri/tai-khoan` | Tài khoản nội bộ và phân quyền | UC22 |
| `/quan-tri/cau-hinh`, `/quan-tri/nhat-ky` | Tham số nghiệp vụ, nhật ký hệ thống | UC23, NFR-08 |

## Quy tắc nghiệp vụ đã cài đặt

| Mã | Nơi cài đặt |
|---|---|
| BR-01, BR-13 | Báo giá cố định đơn giá lúc lập; hạng mục phát sinh qua báo giá bổ sung (`mockApi.createQuote`) |
| BR-02 | Phí khảo sát chỉ thu khi từ chối báo giá (`lib/rules.js` – `amountDue`) |
| BR-03 | Hủy, đổi lịch miễn phí trước mốc cấu hình; không hủy sau check-in (`cancellationPolicy`) |
| BR-04, BR-05 | Kiểm tra trùng lịch có thời gian đệm; xếp hạng kỹ thuật viên gợi ý (`hasConflict`, `rankTechnicians`) |
| BR-06 | Hết hạn phản hồi thì tự thu hồi phân công (`mockApi` – `sweep`) |
| BR-07 | Bảo hành theo từng hạng mục, tính từ ngày hoàn tất (`warrantyStatus`) |
| BR-08 | Chuyển khoản: hoàn tất khi điều phối viên xác nhận. Tiền mặt: hoàn tất khi kỹ thuật viên xác nhận đã thu, điều phối viên đối soát cuối ngày |
| BR-09 | Gợi ý loại sự cố chỉ để tham khảo; điều phối viên chốt loại sự cố |
| BR-10 | Đánh giá một lần trong 7 ngày; từ 2 sao trở xuống bắt buộc nhập lý do |
| BR-11 | Cần ít nhất 1 ảnh trước và 1 ảnh sau mới báo hoàn thành (`canComplete`) |
| BR-12 | Thông tin đăng nhập máy chỉ kỹ thuật viên phụ trách xem, tự xóa khi phiếu kết thúc |
| NFR-03 | Gợi ý loại sự cố quá 10 giây thì bỏ qua, không chặn tạo phiếu |
| NFR-10 | Xin đồng ý khi đăng ký và khi tạo phiếu; che số điện thoại, email trước khi phân loại |

UC08 ngoại lệ 4a (hai điều phối viên thao tác cùng lúc) được xử lý bằng trường `version` của phiếu: thao tác trên dữ liệu cũ bị từ chối với mã 409.

## Kết nối backend

`src/services/api.js` xuất một đối tượng `api` có các hàm trả về `Promise`, ví dụ `api.createTicket(data)`, `api.assignTechnician(id, data)`. Các màn hình chỉ gọi qua đối tượng này. Để chuyển sang FastAPI:

1. Viết `src/services/http/httpApi.js` cài cùng tên hàm, gọi REST API theo `openapi.yaml`, gắn JWT và tự làm mới token (NFR-05).
2. Ném `ApiError(message, status)` khi API trả lỗi để màn hình hiển thị đúng thông báo.
3. Trong `api.js`, chọn `httpApi` khi có biến môi trường `VITE_API_URL`, ngược lại dùng `mockApi`.

Các phần lớp giả lập đang làm thay và backend phải đảm nhận:

| Phần việc | Ở backend |
|---|---|
| Băm mật khẩu, JWT, phân quyền | NFR-04, NFR-05 |
| Thu hồi phân công quá hạn (BR-06) | Tác vụ chạy định kỳ |
| Phân loại sự cố | Gọi Gemini API, che dữ liệu cá nhân trước khi gửi |
| Mã hóa thông tin đăng nhập máy | AES-256 (NFR-07) |
| Tạo chuỗi VietQR | Có thể giữ ở frontend hoặc chuyển sang backend |
| Lưu ảnh | Lưu tệp ở máy chủ, chỉ trả về đường dẫn |
| Thông báo | Gửi thêm qua Telegram, email, có hàng đợi gửi lại (NFR-14) |

## Kiểm thử

- `src/lib/lib.test.js`: 17 ca kiểm thử đơn vị cho máy trạng thái, phí, trùng lịch, xếp hạng kỹ thuật viên, bảo hành, đánh giá, VietQR (CRC-16), phân loại sự cố.
- `e2e/luong-nghiep-vu.spec.js`: chạy trọn quy trình từ khách đặt lịch tới bảo hành qua 4 vai trò, nhánh từ chối báo giá, quá hạn phản hồi, hủy phiếu, phân quyền.
- `e2e/giao-dien.spec.js`: mở mọi màn hình trên máy tính và điện thoại, kiểm tra không lỗi JavaScript và không tràn ngang.
