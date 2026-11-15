import { CalendarClock } from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { ButtonLink, Card, ErrorState, Loading } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

/* Sơ đồ làn bơi: cột là người thực hiện, hàng là thứ tự các bước (khớp với trạng thái phiếu trong hệ thống). */
const LANES = ['Khách hàng', 'Hệ thống', 'Điều phối viên', 'Kỹ thuật viên'];
const LANE_W = 150;
const BOX_W = 140;
const BOX_H = 50;
const ROW_H = 70;
const TOP = 50;
const laneX = (lane) => 40 + lane * LANE_W + (LANE_W - BOX_W) / 2;
const centerX = (lane) => laneX(lane) + BOX_W / 2;
const rowY = (row) => TOP + row * ROW_H;

function steps(config) {
  return [
    { lane: 0, title: 'Đặt lịch', sub: 'Có thể đặt nhanh' },
    { lane: 1, title: 'AI phân loại', sub: 'Phiếu: Mới tạo' },
    { lane: 0, title: 'Trả phí giữ lịch', sub: `${money(config.surveyFee)}, ${config.depositMinutes} phút` },
    { lane: 2, title: 'Xác nhận phí', sub: 'Đã tiếp nhận' },
    { lane: 2, title: 'Phân công KTV', sub: 'Đã phân công' },
    { lane: 3, title: 'Nhận việc', sub: 'Web hoặc Telegram' },
    { lane: 3, title: 'Khảo sát, báo giá', sub: 'Chờ duyệt báo giá' },
    { lane: 0, title: 'Duyệt báo giá', sub: 'Đang thực hiện' },
    { lane: 3, title: 'Sửa chữa', sub: 'Ảnh trước và sau' },
    { lane: 0, title: 'Nghiệm thu', sub: 'Chờ thanh toán' },
    { lane: 0, title: 'Thanh toán', sub: 'VietQR hoặc tiền mặt' },
    { lane: 2, title: 'Xác nhận tiền', sub: 'Hoàn tất' },
    { lane: 1, title: 'Phát bảo hành', sub: 'Mở đánh giá' },
  ];
}

/** Đường nối hai bước liên tiếp: cùng cột thì đi thẳng, khác cột thì đi ngang rồi xuống. */
function link(a, b, row) {
  const y = rowY(row);
  if (a.lane === b.lane) return `M${centerX(a.lane)} ${y + BOX_H} L${centerX(b.lane)} ${y + ROW_H - 2}`;
  const fromX = b.lane > a.lane ? laneX(a.lane) + BOX_W : laneX(a.lane);
  return `M${fromX} ${y + BOX_H / 2} L${centerX(b.lane)} ${y + BOX_H / 2} L${centerX(b.lane)} ${y + ROW_H - 2}`;
}

const BRANCHES = [
  // KTV từ chối hoặc quá hạn phản hồi → điều phối viên phân công lại
  `M${laneX(3)} ${rowY(5) + 25} L${centerX(2)} ${rowY(5) + 25} L${centerX(2)} ${rowY(4) + BOX_H + 2}`,
  // Khách từ chối báo giá → thanh toán (phí giữ lịch là phí khảo sát)
  `M${laneX(0)} ${rowY(7) + 25} L28 ${rowY(7) + 25} L28 ${rowY(10) + 25} L${laneX(0) - 2} ${rowY(10) + 25}`,
  // Nghiệm thu chưa đạt → kỹ thuật viên làm tiếp
  `M${laneX(0) + BOX_W} ${rowY(9) + 30} L${laneX(3) + 105} ${rowY(9) + 30} L${laneX(3) + 105} ${rowY(8) + BOX_H + 2}`,
];

function SwimlaneDiagram({ config }) {
  const list = steps(config);
  const height = rowY(list.length) + 30;
  return (
    <svg className="process-svg" viewBox={`0 0 680 ${height}`} role="img" aria-labelledby="qt-title qt-desc">
      <title id="qt-title">Sơ đồ quy trình xử lý phiếu theo người thực hiện</title>
      <desc id="qt-desc">Bốn cột Khách hàng, Hệ thống, Điều phối viên, Kỹ thuật viên; các bước từ đặt lịch tới hoàn tất và bảo hành, kèm nhánh rẽ.</desc>
      <defs>
        <marker id="qt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {[1, 2, 3].map((i) => <line key={i} x1={40 + i * LANE_W} y1="6" x2={40 + i * LANE_W} y2={height - 10} className="lane-line" />)}
      {LANES.map((name, i) => <text key={name} x={40 + i * LANE_W + LANE_W / 2} y="26" textAnchor="middle" className="lane-title">{name}</text>)}
      {list.map((s, i) => (
        <g key={s.title} className={s.lane === 1 ? 'box system' : 'box'}>
          <rect x={laneX(s.lane)} y={rowY(i)} width={BOX_W} height={BOX_H} rx="8" />
          <text x={centerX(s.lane)} y={rowY(i) + 20} textAnchor="middle" className="box-title">{s.title}</text>
          <text x={centerX(s.lane)} y={rowY(i) + 38} textAnchor="middle" className="box-sub">{s.sub}</text>
        </g>
      ))}
      {list.slice(1).map((s, i) => <path key={s.title} d={link(list[i], s, i)} className="flow" markerEnd="url(#qt-arrow)" />)}
      {BRANCHES.map((d) => <path key={d} d={d} className="flow branch" markerEnd="url(#qt-arrow)" />)}
    </svg>
  );
}

export default function ProcessPage() {
  const { data, loading, error, reload } = useLoad(() => api.getCatalog(), []);
  if (loading) return <div className="container app-main"><Loading /></div>;
  if (error) return <div className="container app-main"><ErrorState error={error} onRetry={reload} /></div>;
  const c = data.config;
  const rows = [
    ['Đặt lịch', 'Khách hàng', 'Mới tạo', 'Mô tả sự cố, ảnh, địa chỉ, khung giờ. Đặt bằng tài khoản hoặc đặt nhanh không cần tài khoản; AI gợi ý loại sự cố.'],
    ['Trả phí giữ lịch', 'Khách hàng', 'Mới tạo', `Chuyển ${money(c.surveyFee)} bằng VietQR trong ${c.depositMinutes} phút; quá hạn hệ thống tự hủy phiếu.`],
    ['Tiếp nhận', 'Điều phối viên', 'Đã tiếp nhận', 'Đối chiếu sao kê, xác nhận phí giữ lịch, chốt loại sự cố.'],
    ['Phân công', 'Điều phối viên', 'Đã phân công', `Chọn kỹ thuật viên theo gợi ý (kỹ năng, khu vực, lịch trống), giờ hẹn trong ${c.serviceHours.start}–${c.serviceHours.end}.`],
    ['Nhận việc', 'Kỹ thuật viên', 'KTV đã nhận', `Nhận hoặc từ chối trên web hoặc Telegram trong ${c.techResponseMinutes} phút; quá hạn hệ thống thu hồi để phân công lại.`],
    ['Khảo sát, báo giá', 'Kỹ thuật viên', 'Đang khảo sát → Chờ duyệt báo giá', 'Check-in tại nhà khách, chụp ảnh trước khi xử lý, lập báo giá từ bảng giá.'],
    ['Duyệt báo giá', 'Khách hàng', 'Đang thực hiện', 'Duyệt toàn bộ, một phần, hoặc từ chối. Khách không thao tác được thì đọc mã xác nhận gửi qua Telegram/email.'],
    ['Sửa chữa', 'Kỹ thuật viên', 'Chờ nghiệm thu', 'Chỉ làm hạng mục đã duyệt; phát sinh thì lập báo giá bổ sung. Chụp ảnh sau khi xử lý.'],
    ['Nghiệm thu', 'Khách hàng', 'Chờ thanh toán', 'Đạt thì sang thanh toán; chưa đạt thì kỹ thuật viên làm tiếp.'],
    ['Thanh toán', 'Khách hàng', 'Chờ thanh toán', 'Trả phần còn lại (đã trừ phí giữ lịch) bằng VietQR hoặc tiền mặt.'],
    ['Xác nhận tiền', 'Điều phối viên / Kỹ thuật viên', 'Hoàn tất', 'Điều phối viên đối chiếu chuyển khoản; kỹ thuật viên xác nhận đã thu tiền mặt. Không còn phải trả thêm thì phiếu hoàn tất ngay.'],
    ['Bảo hành, đánh giá', 'Hệ thống, Khách hàng', 'Hoàn tất', `Phát phiếu bảo hành theo từng hạng mục; khách đánh giá trong ${c.reviewWindowDays} ngày.`],
  ];
  return (
    <main className="container app-main">
      <div className="page-head">
        <div>
          <h1>Quy trình xử lý yêu cầu</h1>
          <p className="sub">Một yêu cầu đi qua những ai, theo thứ tự nào, rẽ nhánh ở đâu. Mỗi bước là một trạng thái của phiếu trên hệ thống.</p>
        </div>
        <ButtonLink to="/dat-lich" variant="accent" icon={CalendarClock}>Đặt lịch hỗ trợ</ButtonLink>
      </div>
      <div className="stack">
        <Card title="Sơ đồ theo người thực hiện">
          <div className="process-diagram"><SwimlaneDiagram config={c} /></div>
          <p className="small muted" style={{ marginTop: 8 }}>Đường nét đứt là nhánh rẽ: kỹ thuật viên từ chối hoặc quá hạn phản hồi, khách từ chối báo giá, nghiệm thu chưa đạt.</p>
        </Card>
        <Card title="Các bước">
          <ol className="process-steps">
            {rows.map(([step, who, status, text]) => (
              <li key={step}>
                <div className="strong">{step}</div>
                <div className="small"><span className="process-who">{who}</span> · Trạng thái phiếu: {status}</div>
                <div className="small muted">{text}</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Nhánh rẽ và hủy">
          <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Kỹ thuật viên từ chối hoặc quá {c.techResponseMinutes} phút không phản hồi: phiếu về Đã tiếp nhận, điều phối viên phân công lại.</li>
            <li>Khách từ chối báo giá: phí giữ lịch là phí khảo sát, phiếu qua Chờ thanh toán rồi hoàn tất ngay vì không phải trả thêm.</li>
            <li>Nghiệm thu chưa đạt: phiếu về Đang thực hiện, kỹ thuật viên làm tiếp.</li>
            <li>Hủy trước khi cửa hàng tiếp nhận: hoàn phí giữ lịch. Hủy sau khi tiếp nhận hoặc khách vắng mặt: không hoàn. Cửa hàng hủy: hoàn. Sau khi kỹ thuật viên check-in không hủy được.</li>
            <li>Đổi lịch miễn phí khi còn ít nhất {c.freeCancelHours} giờ trước giờ hẹn; sát giờ thì gọi cửa hàng.</li>
            <li>Bảo hành hợp lệ: điều phối viên duyệt, hệ thống tạo phiếu bảo hành mới không thu phí và không cần phí giữ lịch, đi lại từ bước tiếp nhận.</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
