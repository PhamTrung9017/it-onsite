import { useState } from 'react';
import { Banknote, CheckCircle2, CreditCard } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Badge, Button, Card, Empty, ErrorState, Loading, Money, PageHead, Segmented, StatusBadge } from '../../components/ui.jsx';
import { DEPOSIT_STATUS_LABEL, DEPOSIT_STATUS_TONE } from '../../lib/ticketStatus.js';
import { formatDateTime } from '../../lib/format.js';

const PAY = {
  CHO_XAC_NHAN: ['warning', 'Chờ xác nhận'],
  DA_THU: ['warning', 'Chờ đối soát'],
  DA_XAC_NHAN: ['success', 'Đã xác nhận'],
  DA_DOI_SOAT: ['success', 'Đã đối soát'],
};
const PAY_TODO = ['CHO_XAC_NHAN', 'DA_THU'];
const DEPOSIT_TODO = ['CHO_XAC_NHAN', 'CHO_HOAN'];

const depositTime = (d) => (d.status === 'CHO_XAC_NHAN' ? d.reportedAt : d.settledAt || d.confirmedAt || d.reportedAt);

export default function PaymentsPage() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [payments, deposits] = await Promise.all([api.listPayments(), api.listDeposits()]);
    return { payments, deposits };
  }, []);
  const { refresh } = useNotifications();
  const { busy, run } = useAction();
  const [tab, setTab] = useState('todo');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const todo = tab === 'todo';
  const payments = data.payments.filter((t) => PAY_TODO.includes(t.payment.status) === todo);
  const deposits = data.deposits.filter((t) => DEPOSIT_TODO.includes(t.deposit.status) === todo);
  const todoCount = data.payments.filter((t) => PAY_TODO.includes(t.payment.status)).length
    + data.deposits.filter((t) => DEPOSIT_TODO.includes(t.deposit.status)).length;
  async function act(key, fn, msg) { if (await run(key, fn, msg)) { refresh(); reload(true); } }
  return (
    <>
      <PageHead title="Đối soát thanh toán" sub="Xác nhận phí giữ lịch và chuyển khoản theo sao kê ngân hàng, hoàn phí giữ lịch, đối soát tiền mặt kỹ thuật viên đã thu" />
      <div className="stack">
        <Segmented label="Lọc" value={tab} onChange={setTab} options={[{ value: 'todo', label: 'Cần xử lý', count: todoCount }, { value: 'done', label: 'Đã xong' }]} />
        <Card title="Phí giữ lịch" bodyClass="table-wrap">
          {deposits.length === 0 ? <Empty icon={CheckCircle2} title={todo ? 'Không có phí giữ lịch cần xử lý' : 'Chưa có khoản nào'} /> : (
            <table className="table">
              <thead><tr><th>Phiếu</th><th>Khách hàng</th><th>Thời điểm</th><th className="right">Số tiền</th><th>Phí giữ lịch</th><th /></tr></thead>
              <tbody>
                {deposits.map((t) => (
                  <tr key={t.id}>
                    <td><div className="mono small">{t.id}</div><div style={{ marginTop: 4 }}><StatusBadge status={t.status} /></div></td>
                    <td>{t.customer?.name}<div className="tiny muted">{t.customer?.phone}</div></td>
                    <td className="small muted nowrap">{formatDateTime(depositTime(t.deposit))}</td>
                    <td className="right"><Money value={t.deposit.amount} /></td>
                    <td><Badge tone={DEPOSIT_STATUS_TONE[t.deposit.status]}>{DEPOSIT_STATUS_LABEL[t.deposit.status]}</Badge></td>
                    <td className="right">
                      {t.deposit.status === 'CHO_XAC_NHAN' && t.status === 'MOI' && (
                        <Button size="sm" loading={busy === `d-${t.id}`} onClick={() => act(`d-${t.id}`, () => api.confirmDeposit(t.id), 'Đã xác nhận nhận phí giữ lịch.')}>Xác nhận đã nhận</Button>
                      )}
                      {t.deposit.status === 'CHO_HOAN' && (
                        <span className="stack-sm" style={{ alignItems: 'flex-end' }}>
                          <Button size="sm" loading={busy === `r-${t.id}`} onClick={() => act(`r-${t.id}`, () => api.refundDeposit(t.id, { received: true }), 'Đã ghi nhận hoàn phí giữ lịch cho khách.')}>Đã hoàn tiền</Button>
                          <Button size="sm" variant="outline" loading={busy === `n-${t.id}`} onClick={() => act(`n-${t.id}`, () => api.refundDeposit(t.id, { received: false }), 'Đã ghi nhận cửa hàng không nhận được tiền.')}>Không nhận được</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Thanh toán dịch vụ" bodyClass="table-wrap">
          {payments.length === 0 ? <Empty icon={CheckCircle2} title={todo ? 'Không có khoản nào cần xử lý' : 'Chưa có khoản nào'} /> : (
            <table className="table">
              <thead><tr><th>Phiếu</th><th>Khách hàng</th><th>Hình thức</th><th>Thời điểm</th><th className="right">Số tiền</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {payments.map((t) => {
                  const [tone, label] = PAY[t.payment.status];
                  return (
                    <tr key={t.id}>
                      <td className="mono small nowrap">{t.id}</td>
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
