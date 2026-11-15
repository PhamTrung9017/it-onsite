import { Link } from 'react-router-dom';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Card, ErrorState, Loading } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

/* Điều khoản dịch vụ và Chính sách dữ liệu cá nhân: con số lấy từ tham số cấu hình đang dùng nên luôn khớp hệ thống. */

function PolicyShell({ title, sub, children }) {
  const { data, loading, error, reload } = useLoad(() => api.getCatalog(), []);
  return (
    <main className="container app-main narrow">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="sub">{sub}</p>
        </div>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && <div className="stack policy">{children(data)}</div>}
    </main>
  );
}

function Section({ title, items }) {
  return (
    <Card title={title}>
      <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((text) => <li key={text}>{text}</li>)}
      </ul>
    </Card>
  );
}

export function TermsPage() {
  return (
    <PolicyShell title="Điều khoản dịch vụ" sub="Áp dụng cho mọi yêu cầu hỗ trợ đặt trên IT OnSite, có hoặc không có tài khoản.">
      {({ config: c, services }) => {
        const noWarranty = services.filter((s) => !s.warrantyDays).map((s) => s.name.toLowerCase());
        return (
          <>
            <Section title="1. Dịch vụ" items={[
              'Kỹ thuật viên đến tận nhà hoặc văn phòng của khách để khảo sát và xử lý sự cố máy tính: cài đặt hệ điều hành, phần mềm, diệt virus, tối ưu, vệ sinh, mạng, nguồn, dữ liệu, lắp đặt linh kiện.',
              `Giờ phục vụ ${c.serviceHours.start}–${c.serviceHours.end}; khu vực phục vụ gồm ${c.areas.length} phường ở TP. Hồ Chí Minh (chọn khi đặt lịch).`,
              'Giá trên bảng giá là tiền công tham khảo; giá chính thức là báo giá kỹ thuật viên lập sau khi khảo sát.',
            ]} />
            <Section title="2. Đặt lịch và phí giữ lịch" items={[
              'Khung giờ hẹn phải cách thời điểm đặt ít nhất 2 giờ và nằm trong giờ phục vụ.',
              `Sau khi gửi yêu cầu, khách chuyển trước phí khảo sát ${money(c.surveyFee)} bằng mã VietQR trong ${c.depositMinutes} phút để giữ lịch; quá hạn chưa chuyển, yêu cầu tự hủy và không phát sinh phí.`,
              'Cửa hàng chỉ tiếp nhận yêu cầu sau khi đối chiếu đã nhận phí giữ lịch.',
              'Khách duyệt báo giá: phí giữ lịch được trừ vào tổng tiền. Khách từ chối báo giá: phí giữ lịch là phí khảo sát, không thu thêm.',
              'Yêu cầu bảo hành hợp lệ không thu phí giữ lịch.',
            ]} />
            <Section title="3. Hủy và đổi lịch" items={[
              'Hủy khi cửa hàng chưa tiếp nhận: hoàn lại phí giữ lịch.',
              'Hủy sau khi cửa hàng đã tiếp nhận, hoặc khách vắng mặt khi kỹ thuật viên đến đúng hẹn: phí giữ lịch không được hoàn.',
              'Cửa hàng hủy (không bố trí được kỹ thuật viên, sự cố bất khả kháng): hoàn lại phí giữ lịch.',
              'Sau khi kỹ thuật viên check-in tại nơi hẹn, yêu cầu không thể hủy.',
              `Đổi lịch miễn phí trên website khi còn ít nhất ${c.freeCancelHours} giờ trước giờ hẹn; sát giờ hơn, khách gọi cửa hàng.`,
            ]} />
            <Section title="4. Báo giá và phát sinh" items={[
              'Kỹ thuật viên chỉ lập báo giá từ bảng giá dịch vụ và danh mục linh kiện; đơn giá cố định tại thời điểm lập báo giá.',
              'Khách duyệt toàn bộ, chọn một phần hạng mục hoặc từ chối. Kỹ thuật viên chỉ làm các hạng mục đã duyệt.',
              'Phát sinh trong lúc làm phải lập báo giá bổ sung và chờ khách duyệt.',
            ]} />
            <Section title="5. Nghiệm thu và thanh toán" items={[
              'Kỹ thuật viên chụp ảnh trước và sau khi xử lý; khách nghiệm thu đạt hoặc báo chưa đạt để kỹ thuật viên làm tiếp.',
              'Số tiền thanh toán = tổng các hạng mục đã duyệt trừ phí giữ lịch đã trả; thanh toán bằng VietQR hoặc tiền mặt cho kỹ thuật viên.',
              'Khách xem và in biên nhận trên trang phiếu. Biên nhận không thay thế hóa đơn giá trị gia tăng.',
            ]} />
            <Section title="6. Bảo hành và đánh giá" items={[
              'Mỗi hạng mục có thời hạn bảo hành theo bảng giá, tính từ lúc phiếu hoàn tất; khách gửi yêu cầu bảo hành trên website khi còn hạn.',
              `Không bảo hành khi máy bị rơi vỡ, vào nước, bị người khác tháo lắp sau khi sửa, lỗi do phần mềm tự cài thêm hoặc virus nhiễm mới${noWarranty.length ? `; các dịch vụ ${noWarranty.join(', ')} không có bảo hành` : ''}.`,
              `Khách đánh giá dịch vụ một lần cho mỗi phiếu, trong ${c.reviewWindowDays} ngày sau khi hoàn tất.`,
            ]} />
            <p className="small muted">Xem thêm <Link to="/quy-trinh">quy trình xử lý yêu cầu</Link> và <Link to="/bao-ve-du-lieu">chính sách dữ liệu cá nhân</Link>.</p>
          </>
        );
      }}
    </PolicyShell>
  );
}

export function PrivacyPage() {
  return (
    <PolicyShell title="Chính sách dữ liệu cá nhân" sub="IT OnSite thu thập và xử lý dữ liệu cá nhân của khách theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.">
      {() => (
        <>
          <Section title="1. Dữ liệu thu thập" items={[
            'Họ tên, số điện thoại, email (không bắt buộc), địa chỉ và phường nơi hẹn.',
            'Thông tin thiết bị, mô tả sự cố, ảnh khách đính kèm và ảnh kỹ thuật viên chụp trước, sau khi xử lý.',
            'Thông tin đăng nhập máy nếu khách tự cung cấp để kỹ thuật viên làm việc.',
          ]} />
          <Section title="2. Mục đích" items={[
            'Tiếp nhận, phân công, thực hiện, thanh toán và bảo hành yêu cầu của khách.',
            'Gửi thông báo về yêu cầu trên website, qua Telegram (khi khách liên kết) và email (khi khách cung cấp).',
            'Thống kê nội bộ để cải thiện dịch vụ.',
          ]} />
          <Section title="3. Bảo vệ dữ liệu" items={[
            'Chỉ điều phối viên, quản trị viên và kỹ thuật viên phụ trách phiếu được xem dữ liệu của phiếu.',
            'Thông tin đăng nhập máy được mã hóa, chỉ kỹ thuật viên phụ trách xem được và tự xóa khi phiếu kết thúc.',
            'Mô tả sự cố được lọc số điện thoại, email, địa chỉ, mật khẩu trước khi gửi cho dịch vụ AI phân loại sự cố.',
            'Mật khẩu tài khoản được lưu dạng băm, không ai đọc được.',
          ]} />
          <Section title="4. Quyền của khách" items={[
            'Khách có tài khoản: xem, sửa hồ sơ; tải về dữ liệu của mình và gửi yêu cầu xóa dữ liệu ở trang Hồ sơ.',
            'Khách đặt nhanh không có tài khoản: tra cứu đơn bằng mã đơn và số điện thoại; muốn tải về hoặc xóa dữ liệu thì tạo tài khoản bằng cùng số điện thoại hoặc liên hệ cửa hàng.',
            'Khách có thể rút lại sự đồng ý bất cứ lúc nào; việc rút lại không ảnh hưởng tới các xử lý đã thực hiện trước đó.',
          ]} />
          <p className="small muted">Xem thêm <Link to="/dieu-khoan">điều khoản dịch vụ</Link>.</p>
        </>
      )}
    </PolicyShell>
  );
}
