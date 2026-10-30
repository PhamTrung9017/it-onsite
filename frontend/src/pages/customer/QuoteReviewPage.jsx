import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Alert, Button, Card, Empty, ErrorState, Field, Loading, Modal, PageHead } from '../../components/ui.jsx';
import { QuoteTable } from '../../components/ticket.jsx';
import { formatDateTime, money } from '../../lib/format.js';

export default function QuoteReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const { data: t, loading, error, reload } = useLoad(() => api.getTicket(id), [id]);
  const { busy, run } = useAction();
  const [selected, setSelected] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const quote = t?.quotes.find((q) => q.status === 'CHO_DUYET');
  useEffect(() => { if (quote) setSelected(quote.items.map((i) => i.id)); }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const back = () => navigate(`/khach/phieu/${t.id}`);
  if (!quote) return <Card><Empty title="Không có báo giá chờ duyệt" action={<Button variant="outline" onClick={back}>Về chi tiết phiếu</Button>}>Báo giá có thể đã được xử lý trước đó.</Empty></Card>;

  const all = selected.length === quote.items.length;
  const toggle = (itemId) => setSelected((s) => (s.includes(itemId) ? s.filter((x) => x !== itemId) : [...s, itemId]));
  async function decide(decision) {
    const r = await run(decision, () => api.decideQuote(t.id, quote.id, { decision, itemIds: selected, reason }),
      decision === 'reject' ? 'Đã từ chối báo giá.' : 'Đã duyệt báo giá. Kỹ thuật viên sẽ bắt đầu thực hiện.');
    if (r) { refresh(); back(); }
  }
  const isMain = quote.type === 'CHINH';

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHead crumbs={[{ label: 'Phiếu của tôi', to: '/khach/phieu' }, { label: t.id, to: `/khach/phieu/${t.id}` }, { label: 'Báo giá' }]}
        title={isMain ? 'Duyệt báo giá' : 'Duyệt báo giá bổ sung'}
        sub={`Lập lúc ${formatDateTime(quote.createdAt)} bởi ${t.technician?.name}. Bỏ chọn hạng mục bạn không muốn thực hiện.`} />
      <div className="stack">
        {quote.note && <Alert title="Ghi chú khảo sát của kỹ thuật viên">{quote.note}</Alert>}
        <Card>
          <QuoteTable quote={quote} selectable selected={selected} onToggle={toggle} surveyFee={t.config.surveyFee} showSurveyFee={isMain && !t.isWarranty} />
        </Card>
        {!isMain && <Alert>Các hạng mục đã duyệt trước đó vẫn được giữ nguyên. Từ chối báo giá bổ sung thì kỹ thuật viên tiếp tục các hạng mục cũ.</Alert>}
        <div className="stack-sm">
          <Button variant="accent" size="lg" block icon={Check} disabled={!selected.length} loading={busy === 'approve' || busy === 'partial'} onClick={() => decide(all ? 'approve' : 'partial')}>
            {all ? `Đồng ý báo giá (${quote.items.length} hạng mục)` : `Đồng ý ${selected.length}/${quote.items.length} hạng mục`}
          </Button>
          <Button variant="danger" block icon={X} onClick={() => setRejecting(true)}>
            {isMain && !t.isWarranty ? `Từ chối báo giá (thu phí khảo sát ${money(t.config.surveyFee)})` : 'Từ chối báo giá'}
          </Button>
        </div>
      </div>
      <Modal open={rejecting} title="Từ chối báo giá" onClose={() => setRejecting(false)}
        footer={<><Button variant="outline" onClick={() => setRejecting(false)}>Quay lại</Button><Button variant="danger-solid" loading={busy === 'reject'} onClick={() => decide('reject')}>Xác nhận từ chối</Button></>}>
        {isMain && !t.isWarranty && <Alert tone="warning">Kỹ thuật viên sẽ không thực hiện hạng mục nào. Bạn thanh toán phí khảo sát {money(t.config.surveyFee)}.</Alert>}
        <Field label="Lý do" htmlFor="rr"><textarea id="rr" className="textarea" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: chi phí cao hơn dự kiến" /></Field>
      </Modal>
    </div>
  );
}
