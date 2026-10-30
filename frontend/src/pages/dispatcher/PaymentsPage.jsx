import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Badge, Button, Card, Empty, ErrorState, Loading, Money, PageHead, Segmented } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

const PAY = {
  CHO_XAC_NHAN: ['warning', 'Chờ xác nhận'],
  DA_THU: ['warning', 'Chờ đối soát'],
  DA_XAC_NHAN: ['success', 'Đã xác nhận'],
  DA_DOI_SOAT: ['success', 'Đã đối soát'],
};

export default function PaymentsPage() {
  const { data, loading, error, reload } = useLoad(() => api.listPayments(), []);
  const { refresh } = useNotifications();
  const { busy, run } = useAction();
  const [tab, setTab] = useState('todo');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const todo = data.filter((t) => ['CHO_XAC_NHAN', 'DA_THU'].includes(t.payment.status));
  const done = data.filter((t) => !['CHO_XAC_NHAN', 'DA_THU'].includes(t.payment.status));
  const list = tab === 'todo' ? todo : done;
  async function act(key, fn, msg) { if (await run(key, fn, msg)) { refresh(); reload(true); } }
  return (
    <>
      <PageHead title="Đối soát thanh toán" sub="Xác nhận chuyển khoản theo sao kê ngân hàng và đối soát tiền mặt kỹ thuật viên đã thu" />
      <div className="stack">
        <Segmented label="Lọc" value={tab} onChange={setTab} options={[{ value: 'todo', label: 'Cần xử lý', count: todo.length }, { value: 'done', label: 'Đã xong', count: done.length }]} />
        <Card bodyClass="table-wrap">
          {list.length === 0 ? <Empty icon={CheckCircle2} title="Không có khoản nào cần xử lý" /> : (
            <table className="table">
              <thead><tr><th>Phiếu</th><th>Khách hàng</th><th>Hình thức</th><th>Thời điểm</th><th className="right">Số tiền</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {list.map((t) => {
                  const [tone, label] = PAY[t.payment.status];
                  return (
                    <tr key={t.id}>
                      <td className="mono small">{t.id}</td>
                      <td>{t.customer?.name}</td>
                      <td><span className="row-sm small">{t.payment.method === 'TIEN_MAT' ? <><Banknote size={16} aria-hidden />Tiền mặt · {t.technician?.name}</> : <><CreditCard size={16} aria-hidden />Chuyển khoản</>}</span></td>
                      <td className="small muted nowrap">{formatDateTime(t.payment.paidAt)}</td>
                      <td className="right"><Money value={t.payment.amount} /></td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td className="right">
                        {t.payment.status === 'CHO_XAC_NHAN' && <Button size="sm" loading={busy === t.id} onClick={() => act(t.id, () => api.confirmTransfer(t.id), 'Đã xác nhận chuyển khoản. Phiếu hoàn tất.')}>Xác nhận đã nhận</Button>}
                        {t.payment.status === 'DA_THU' && <Button size="sm" variant="outline" loading={busy === t.id} onClick={() => act(t.id, () => api.reconcileCash(t.id), 'Đã đối soát tiền mặt.')}>Đối soát</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
