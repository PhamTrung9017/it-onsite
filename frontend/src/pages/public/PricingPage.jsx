import { CalendarClock, Info } from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Alert, ButtonLink, Card, ErrorState, Loading, Money } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

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
                  <td className="muted">Chỉ thu khi bạn từ chối báo giá</td>
                  <td>—</td><td>—</td>
                  <td className="right"><Money value={data.config.surveyFee} /></td>
                </tr>
              </tbody>
            </table>
          </Card>
          <Alert title="Chính sách" icon={Info}>
            Hủy hoặc đổi lịch miễn phí khi thao tác trước giờ hẹn ít nhất {data.config.freeCancelHours} giờ; muộn hơn tính phí khảo sát {money(data.config.surveyFee)}.
            Giờ phục vụ {data.config.serviceHours.start}–{data.config.serviceHours.end} hằng ngày, tại các phường: {data.config.areas.join(', ')}.
          </Alert>
        </div>
      )}
    </div>
  );
}
