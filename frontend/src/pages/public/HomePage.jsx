import { Link } from 'react-router-dom';
import {
  BadgeCheck, CalendarClock, CheckCircle2, ClipboardCheck, Clock, FileCheck2, HandCoins, MessageSquareText, ShieldCheck,
  Sparkles, UserCheck, Wrench, Receipt,
} from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Badge, ButtonLink, Money } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

const STEPS = [
  { icon: MessageSquareText, title: 'Mô tả sự cố', text: 'Chọn thiết bị, mô tả vấn đề, đính kèm ảnh. Hệ thống gợi ý loại sự cố và dịch vụ phù hợp.' },
  { icon: UserCheck, title: 'Phân công kỹ thuật viên', text: 'Điều phối viên chọn kỹ thuật viên đúng chuyên môn, phụ trách khu vực của bạn và còn trống lịch.' },
  { icon: ClipboardCheck, title: 'Khảo sát và báo giá', text: 'Kỹ thuật viên kiểm tra tại chỗ, gửi báo giá từng hạng mục. Bạn duyệt toàn bộ, một phần hoặc từ chối.' },
  { icon: Wrench, title: 'Thực hiện', text: 'Chỉ làm các hạng mục bạn đã duyệt. Có ảnh trước và sau khi xử lý để đối chiếu.' },
  { icon: Receipt, title: 'Nghiệm thu, thanh toán', text: 'Bạn kiểm tra kết quả rồi thanh toán tiền mặt hoặc quét mã VietQR.' },
  { icon: ShieldCheck, title: 'Bảo hành, đánh giá', text: 'Phiếu bảo hành điện tử theo từng hạng mục. Gửi yêu cầu bảo hành ngay trên hệ thống.' },
];

export default function HomePage() {
  const { data } = useLoad(() => api.getCatalog(), []);
  const services = data?.services.slice(0, 6) || [];
  const fee = data?.config.surveyFee;
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="eyebrow"><Sparkles aria-hidden />Hỗ trợ máy tính tận nơi tại TP. Hồ Chí Minh</span>
            <h1>Sửa máy tính, cài phần mềm <em>tận nhà</em> với giá minh bạch</h1>
            <p className="lead">Đặt lịch trong vài phút, biết giá trước khi làm, theo dõi từng bước xử lý và nhận bảo hành điện tử cho mọi hạng mục.</p>
            <div className="cta">
              <ButtonLink to="/khach/tao-yeu-cau" variant="accent" size="lg" icon={CalendarClock}>Đặt lịch hỗ trợ</ButtonLink>
              <ButtonLink to="/bang-gia" variant="outline" size="lg">Xem bảng giá</ButtonLink>
            </div>
            <div className="trust">
              <div><BadgeCheck aria-hidden />Duyệt báo giá trước khi làm</div>
              <div><FileCheck2 aria-hidden />Ảnh trước và sau khi xử lý</div>
              <div><ShieldCheck aria-hidden />Bảo hành theo hạng mục</div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden>
            <div className="mock-phone">
              <div className="row-between" style={{ marginBottom: 14 }}>
                <span className="mono tiny muted">YC-PHIEU-MAU</span>
                <Badge tone="primary">Đang thực hiện</Badge>
              </div>
              <div className="strong">Nâng cấp SSD và vệ sinh máy</div>
              <div className="tiny muted" style={{ marginBottom: 16 }}>Laptop Dell Inspiron 15 · phường Bến Thành</div>
              <ol className="timeline">
                <li className="done"><span className="dot"><CheckCircle2 size={12} /></span><div className="t">Kỹ thuật viên đã nhận việc</div><div className="s">08:20 · Nguyễn Văn An</div></li>
                <li className="done"><span className="dot"><CheckCircle2 size={12} /></span><div className="t">Khách đã duyệt báo giá</div><div className="s">09:35 · 3 hạng mục</div></li>
                <li className="current"><span className="dot" /><div className="t">Đang thực hiện</div><div className="s">Dự kiến xong 11:00</div></li>
                <li className="todo"><span className="dot" /><div className="t">Chờ nghiệm thu</div></li>
              </ol>
              <div className="row-between" style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 14px' }}>
                <span className="small strong">Tổng đã duyệt</span><Money value={1050000} />
              </div>
            </div>
            <div className="float-card"><span className="list-icon"><HandCoins size={18} /></span><div><div className="strong">Biết giá trước khi làm</div><div className="tiny muted">Không phát sinh ngoài báo giá</div></div></div>
          </div>
        </div>
      </section>

      <section className="section" id="quy-trinh">
        <div className="container">
          <div className="section-head">
            <h2>Quy trình 6 bước rõ ràng</h2>
            <p>Mỗi bước đều được ghi lại trên phiếu yêu cầu, bạn theo dõi được từ lúc đặt lịch tới khi hết hạn bảo hành.</p>
          </div>
          <div className="steps">
            {STEPS.map(({ icon: I, title, text }, i) => (
              <div className="card step-card" key={title}>
                <div className="row-between"><span className="n"><I aria-hidden /></span><span className="mono faint">0{i + 1}</span></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
        <div className="container">
          <div className="row-between wrap" style={{ marginBottom: 28, alignItems: 'flex-end' }}>
            <div className="section-head" style={{ margin: 0 }}>
              <h2>Dịch vụ phổ biến</h2>
              <p>Giá tham khảo cho phần công. Linh kiện và hạng mục phát sinh chỉ thực hiện khi bạn duyệt báo giá.</p>
            </div>
            <Link to="/bang-gia" className="btn btn-outline">Xem toàn bộ bảng giá</Link>
          </div>
          <div className="grid-3">
            {services.length === 0 && [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}
            {services.map((s) => (
              <div className="card svc-card" key={s.id}>
                <div className="top"><h3>{s.name}</h3></div>
                <div className="meta">
                  <span><Clock aria-hidden />{s.durationMin} phút</span>
                  <span><ShieldCheck aria-hidden />{s.warrantyDays ? `Bảo hành ${s.warrantyDays} ngày` : 'Không bảo hành'}</span>
                </div>
                <div className="row-between" style={{ marginTop: 'auto' }}>
                  <span className="small muted">Từ</span>
                  <span className="price">{money(s.price)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="promise">
            <div>
              <span className="ico"><HandCoins aria-hidden /></span>
              <h3>Phí khảo sát {fee !== undefined ? money(fee) : ''}</h3>
              <p>Được miễn khi bạn đồng ý báo giá. Chỉ thu khi bạn không sửa sau khi kỹ thuật viên đã kiểm tra.</p>
            </div>
            <div>
              <span className="ico"><CalendarClock aria-hidden /></span>
              <h3>Hủy, đổi lịch linh hoạt</h3>
              <p>Miễn phí khi thao tác trước giờ hẹn ít nhất {data?.config.freeCancelHours ?? 2} giờ.</p>
            </div>
            <div>
              <span className="ico"><ShieldCheck aria-hidden /></span>
              <h3>Dữ liệu được bảo vệ</h3>
              <p>Chỉ dùng thông tin của bạn để thực hiện yêu cầu. Bạn xem, tải về hoặc yêu cầu xóa dữ liệu bất cứ lúc nào.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
