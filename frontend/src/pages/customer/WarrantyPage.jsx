import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Loading, Modal, PageHead } from '../../components/ui.jsx';
import { combineDateTime, formatDate, timeSlots, toDateInput } from '../../lib/format.js';

const CLAIM = { CHO_XU_LY: ['warning', 'Đang chờ xử lý'], HOP_LE: ['success', 'Đã chấp nhận'] };

export default function WarrantyPage() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [warranties, catalog] = await Promise.all([api.listMyWarranties(), api.getCatalog()]);
    return { warranties, config: catalog.config };
  }, []);
  const { busy, run } = useAction();
  const [target, setTarget] = useState(null);
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(toDateInput(Date.now() + 86400000));
  const [time, setTime] = useState('09:00');
  const slots = useMemo(() => (data ? timeSlots(data.config.serviceHours.start, data.config.serviceHours.end) : []), [data]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { warranties } = data;
  async function submit() {
    const r = await run('claim', () => api.createWarrantyClaim({ warrantyId: target.id, description: desc, slotStart: combineDateTime(date, time) }), 'Đã gửi yêu cầu bảo hành. Điều phối viên sẽ kiểm tra và phản hồi.');
    if (r) { setTarget(null); setDesc(''); reload(true); }
  }
  return (
    <>
      <PageHead title="Bảo hành" sub="Phiếu bảo hành điện tử theo từng hạng mục đã thực hiện" />
      <Card bodyClass="list">
        {warranties.length === 0 ? <Empty icon={ShieldCheck} title="Chưa có phiếu bảo hành">Sau khi phiếu hoàn tất, các hạng mục có bảo hành sẽ hiện ở đây.</Empty> : warranties.map((w) => (
          <div key={w.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div className="list-icon" style={w.valid ? undefined : { background: 'var(--muted-bg)', color: 'var(--ink-4)' }}>{w.valid ? <ShieldCheck aria-hidden /> : <ShieldOff aria-hidden />}</div>
            <div className="grow stack-sm" style={{ gap: 4 }}>
              <div className="row-between wrap">
                <span className="strong">{w.name}</span>
                {w.valid ? <Badge tone="success">Còn {w.daysLeft} ngày</Badge> : <Badge tone="muted">Hết hạn</Badge>}
              </div>
              <div className="small muted">{w.device?.brand} {w.device?.model} · Phiếu <Link to={`/khach/phieu/${w.ticketId}`} className="mono">{w.ticketId}</Link></div>
              <div className="tiny muted">Hiệu lực {formatDate(w.startAt)} – {formatDate(w.endAt)}</div>
              <div style={{ marginTop: 6 }}>
                {w.claim ? (
                  <span className="row-sm wrap"><Badge tone={CLAIM[w.claim.status][0]}>{CLAIM[w.claim.status][1]}</Badge>{w.claim.newTicketId && <Link to={`/khach/phieu/${w.claim.newTicketId}`} className="small">Xem phiếu bảo hành {w.claim.newTicketId}</Link>}</span>
                ) : w.valid && <Button variant="outline" size="sm" onClick={() => setTarget(w)}>Yêu cầu bảo hành</Button>}
              </div>
            </div>
          </div>
        ))}
      </Card>
      <Modal open={Boolean(target)} title="Yêu cầu bảo hành" onClose={() => setTarget(null)}
        footer={<><Button variant="outline" onClick={() => setTarget(null)}>Đóng</Button><Button loading={busy === 'claim'} onClick={submit}>Gửi yêu cầu</Button></>}>
        {target && <Alert title={target.name}>Bảo hành hợp lệ khi còn hạn, đúng thiết bị và đúng hạng mục đã sửa. Yêu cầu hợp lệ không tính phí.</Alert>}
        <Field label="Mô tả lỗi" htmlFor="wd"><textarea id="wd" className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Lỗi xuất hiện lại như thế nào, từ khi nào?" /></Field>
        <div className="grid-2">
          <Field label="Ngày hẹn" htmlFor="wdt"><input id="wdt" type="date" className="input" min={toDateInput(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Khung giờ" htmlFor="wtm"><select id="wtm" className="select" value={time} onChange={(e) => setTime(e.target.value)}>{slots.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
      </Modal>
    </>
  );
}
