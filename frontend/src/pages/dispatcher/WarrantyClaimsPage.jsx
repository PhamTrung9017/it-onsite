import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Loading, Modal, PageHead } from '../../components/ui.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';

const ST = { CHO_XU_LY: ['warning', 'Chờ xử lý'], HOP_LE: ['success', 'Đã chấp nhận'], TU_CHOI: ['muted', 'Đã từ chối'] };

export default function WarrantyClaimsPage() {
  const { data, loading, error, reload } = useLoad(() => api.listWarrantyClaims(), []);
  const { refresh } = useNotifications();
  const { busy, run } = useAction();
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  async function decide(c, valid) {
    const r = await run(c.id, () => api.decideWarrantyClaim(c.id, { valid, reason }), valid ? 'Đã chấp nhận, tạo phiếu bảo hành và đưa vào bảng điều phối.' : 'Đã từ chối yêu cầu bảo hành.');
    if (r) { setRejecting(null); setReason(''); refresh(); reload(true); }
  }
  return (
    <>
      <PageHead title="Xử lý bảo hành" sub="Kiểm tra hạn bảo hành, thiết bị và hạng mục trước khi chấp nhận" />
      <Card bodyClass="list">
        {data.length === 0 ? <Empty icon={ShieldCheck} title="Chưa có yêu cầu bảo hành">Yêu cầu khách gửi từ trang Bảo hành sẽ hiện ở đây.</Empty> : data.map((c) => {
          const [tone, label] = ST[c.status];
          return (
            <div key={c.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="list-icon"><ShieldCheck aria-hidden /></div>
              <div className="grow stack-sm" style={{ gap: 4 }}>
                <div className="row-between wrap"><span className="strong">{c.warranty?.name}</span><Badge tone={tone}>{label}</Badge></div>
                <div className="small">{c.description}</div>
                <div className="tiny muted">{c.customer?.name} · {c.device?.brand} {c.device?.model} · phiếu gốc <span className="mono">{c.warranty?.ticketId}</span> · gửi {formatDateTime(c.createdAt)}</div>
                <div className="tiny">
                  {c.warranty?.valid ? <span style={{ color: 'var(--success)' }}>Còn hạn đến {formatDate(c.warranty.endAt)}</span> : <span style={{ color: 'var(--danger)' }}>Đã hết hạn {formatDate(c.warranty?.endAt)}</span>}
                  {' · '}Khách hẹn {formatDateTime(c.slotStart)}
                </div>
                {c.status === 'TU_CHOI' && <div className="tiny muted">Lý do từ chối: {c.reason}</div>}
                {c.status === 'HOP_LE' && <div className="tiny muted">Phiếu bảo hành: <span className="mono">{c.newTicketId}</span></div>}
                {c.status === 'CHO_XU_LY' && (
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <Button size="sm" disabled={!c.warranty?.valid} loading={busy === c.id} onClick={() => decide(c, true)}>Chấp nhận, tạo phiếu</Button>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(c)}>Từ chối</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      <Modal open={Boolean(rejecting)} title="Từ chối yêu cầu bảo hành" onClose={() => setRejecting(null)}
        footer={<><Button variant="outline" onClick={() => setRejecting(null)}>Đóng</Button><Button variant="danger-solid" loading={busy === rejecting?.id} onClick={() => decide(rejecting, false)}>Từ chối</Button></>}>
        <Alert>Lý do sẽ được gửi cho khách hàng.</Alert>
        <Field label="Lý do" htmlFor="wr"><textarea id="wr" className="textarea" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: lỗi do rơi vỡ, không thuộc hạng mục đã sửa" /></Field>
      </Modal>
    </>
  );
}
