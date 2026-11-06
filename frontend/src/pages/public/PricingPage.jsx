import { CalendarClock, Info } from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Alert, ButtonLink, Card, ErrorState, Loading, Money } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';
import { oldWardText } from '../../lib/wards.js';

export default function PricingPage() {
  const { data, loading, error, reload } = useLoad(() => api.getCatalog(), []);
  return (
    <div className="container app-main">
      <div className="page-head">
        <div>
          <h1>Bảng giá dịch vụ</h1>
          <p className="sub">Giá phần công tham khảo. Giá chính thức là báo giá kỹ thuật viên gửi sau khi khảo sát, bạn duyệt rồi mới thực hiện.</p>
        </div>
        <ButtonLink to="/khach/tao-yeu-cau" variant="accent" icon={CalendarClock}>Đặt lịch hỗ trợ</ButtonLink>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack">
          <Card bodyClass="table-wrap">
            <table className="table">
              <thead><tr><th>Dịch vụ</th><th>Loại sự cố</th><th>Thời gian dự kiến</th><th>Bảo hành</th><th className="right">Giá từ</th></tr></thead>
              <tbody>
                {data.services.map((s) => (
                  <tr key={s.id}>
                    <td className="strong">{s.name}</td>
                    <td className="muted">{data.categories.find((c) => c.code === s.categoryCode)?.name}</td>
                    <td>{s.durationMin} phút</td>
                    <td>{s.warrantyDays ? `${s.warrantyDays} ngày` : 'Không áp dụng'}</td>
                    <td className="right"><Money value={s.price} /></td>
                  </tr>
                ))}
                <tr>
                  <td className="strong">Phí khảo sát</td>
                  <td className="muted">Trả trước để giữ lịch, trừ vào tổng tiền khi bạn duyệt báo giá</td>
                  <td>—</td><td>—</td>
                  <td className="right"><Money value={data.config.surveyFee} /></td>
                </tr>
              </tbody>
            </table>
          </Card>
          <Alert title="Chính sách" icon={Info}>
            Sau khi gửi yêu cầu, bạn chuyển khoản phí giữ lịch {money(data.config.surveyFee)} trong {data.config.depositMinutes} phút; quá hạn yêu cầu tự hủy.
            Hủy khi cửa hàng chưa tiếp nhận được hoàn phí; hủy sau khi cửa hàng đã tiếp nhận hoặc vắng mặt khi kỹ thuật viên đến thì không hoàn.
            Đổi lịch miễn phí khi còn ít nhất {data.config.freeCancelHours} giờ trước giờ hẹn; sát giờ hơn vui lòng gọi cửa hàng.
            Giờ phục vụ {data.config.serviceHours.start}–{data.config.serviceHours.end} hằng ngày, tại các phường dưới đây.
          </Alert>
          <Card title="Khu vực phục vụ" bodyClass="table-wrap">
            <table className="table">
              <thead><tr><th>Phường (từ 01/07/2025)</th><th>Gồm địa bàn cũ</th></tr></thead>
              <tbody>{data.config.areas.map((a) => <tr key={a}><td className="strong nowrap">{a}</td><td className="small muted">{oldWardText(a) || '—'}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
