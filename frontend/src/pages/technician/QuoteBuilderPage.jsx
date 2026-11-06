import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Alert, Button, Card, Empty, ErrorState, Field, Loading, Money, PageHead, Segmented } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';
import { STATUS } from '../../lib/ticketStatus.js';

export default function QuoteBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const { data, loading, error, reload } = useLoad(async () => {
    const [t, catalog, parts] = await Promise.all([api.getTicket(id), api.getCatalog(), api.listParts()]);
    return { t, services: catalog.services, parts };
  }, [id]);
  const { busy, run } = useAction();
  const [tab, setTab] = useState('service');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { t, services, parts } = data;
  const supplementary = t.status === STATUS.DANG_THUC_HIEN;
  if (![STATUS.DANG_KHAO_SAT, STATUS.DANG_THUC_HIEN].includes(t.status)) {
    return <Card><Empty title="Không thể lập báo giá lúc này" action={<Button variant="outline" onClick={() => navigate(`/ktv/viec/${id}`)}>Về chi tiết việc</Button>}>Chỉ lập báo giá khi đang khảo sát hoặc đang thực hiện.</Empty></Card>;
  }
  const source = tab === 'service' ? services : parts;
  const list = source.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  const add = (kind, x) => setItems((xs) => {
    const ex = xs.find((i) => i.kind === kind && i.refId === x.id);
    if (ex) return xs.map((i) => (i === ex ? { ...i, qty: kind === 'part' ? Math.min(i.qty + 1, x.stock) : i.qty } : i));
    return [...xs, { kind, refId: x.id, name: x.name, unitPrice: x.price, warrantyDays: x.warrantyDays, qty: 1, stock: x.stock }];
  });
  const setQty = (idx, d) => setItems((xs) => xs.map((i, j) => (j === idx ? { ...i, qty: Math.max(1, Math.min(i.qty + d, i.kind === 'part' ? i.stock : 1)) } : i)));
  const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  async function send() {
    const r = await run('send', () => api.createQuote(t.id, { items: items.map(({ kind, refId, qty }) => ({ kind, refId, qty })), note }), 'Đã gửi báo giá cho khách.');
    if (r) { refresh(); navigate(`/ktv/viec/${t.id}`); }
  }

  return (
    <>
      <PageHead crumbs={[{ label: 'Lịch việc', to: '/ktv/lich-viec' }, { label: t.id, to: `/ktv/viec/${t.id}` }, { label: 'Báo giá' }]}
        title={supplementary ? 'Lập báo giá bổ sung' : 'Lập báo giá'} sub={`${t.customer?.name} · ${t.device?.brand} ${t.device?.model}`} />
      <div className="split">
        <Card title="Danh mục">
          <div className="stack">
            <Segmented label="Loại hạng mục" value={tab} onChange={setTab} options={[{ value: 'service', label: 'Dịch vụ' }, { value: 'part', label: 'Linh kiện' }]} />
            <div className="input-group"><Search aria-hidden /><input className="input" placeholder="Tìm hạng mục" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm hạng mục" /></div>
            <div className="stack-sm">
              {list.map((x) => {
                const out = tab === 'part' && x.stock < 1;
                return (
                  <div key={x.id} className="row" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <div className="grow">
                      <div className="strong small">{x.name}</div>
                      <div className="tiny muted">{x.warrantyDays ? `Bảo hành ${x.warrantyDays} ngày` : 'Không bảo hành'}{tab === 'part' && ` · còn ${x.stock}`}</div>
                    </div>
                    <Money value={x.price} />
                    <Button variant="outline" size="sm" icon={Plus} disabled={out} onClick={() => add(tab, x)} aria-label={`Thêm ${x.name}`}>{out ? 'Hết' : 'Thêm'}</Button>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
        <div className="stack">
          <Card title={`Báo giá (${items.length} hạng mục)`}>
            <div className="stack">
              {items.length === 0 ? <p className="small muted">Chọn hạng mục từ danh mục. Đơn giá được lấy từ bảng giá và cố định trên báo giá.</p> : items.map((i, idx) => (
                <div key={`${i.kind}-${i.refId}`} className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow"><div className="small strong">{i.name}</div><div className="tiny muted">{money(i.unitPrice)}{i.kind === 'part' && ` × ${i.qty}`}</div></div>
                  {i.kind === 'part' && (
                    <div className="row-sm">
                      <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setQty(idx, -1)} aria-label="Giảm"><Minus size={14} /></button>
                      <span className="mono">{i.qty}</span>
                      <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setQty(idx, 1)} aria-label="Tăng"><Plus size={14} /></button>
                    </div>
                  )}
                  <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setItems(items.filter((_, j) => j !== idx))} aria-label={`Bỏ ${i.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
              <div className="divider" />
              <div className="row-between"><span className="strong">Tổng cộng</span><Money value={t.isWarranty ? 0 : total} /></div>
              {t.isWarranty && <Alert>Phiếu bảo hành: các hạng mục không tính phí.</Alert>}
              <Field label="Ghi chú khảo sát" htmlFor="nt"><textarea id="nt" className="textarea" style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nguyên nhân, đề xuất cho khách" /></Field>
              <Button variant="accent" size="lg" block icon={Send} disabled={!items.length} loading={busy === 'send'} onClick={send}>Gửi báo giá cho khách</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
