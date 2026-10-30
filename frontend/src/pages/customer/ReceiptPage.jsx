import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Alert, Button, ButtonLink, ErrorState, Loading, PageHead } from '../../components/ui.jsx';
import { AddressLine } from '../../components/ticket.jsx';
import { STATUS } from '../../lib/ticketStatus.js';
import { formatDate, formatDateTime, money } from '../../lib/format.js';

const PAYMENT_TEXT = {
  DA_THU: 'Đã thu tiền mặt',
  DA_DOI_SOAT: 'Đã thu tiền mặt',
  DA_XAC_NHAN: 'Đã nhận chuyển khoản',
  MIEN_PHI: 'Không phát sinh chi phí',
};
const METHOD_TEXT = { TIEN_MAT: 'Tiền mặt', CHUYEN_KHOAN: 'Chuyển khoản VietQR' };

/** Các dòng tính tiền của phiếu: hạng mục đã duyệt, phí khảo sát khi từ chối báo giá, phí đổi lịch sát giờ. */
function receiptLines(t) {
  const lines = t.quotes
    .filter((q) => q.status === 'DA_DUYET' || q.status === 'DUYET_MOT_PHAN')
    .flatMap((q) => q.items.filter((i) => i.selected).map((i) => ({ ...i, extra: q.type === 'BO_SUNG' })));
  const lateFee = t.lateRescheduleFee || 0;
  const mainRejected = t.quotes.some((q) => q.type === 'CHINH' && q.status === 'TU_CHOI');
  const rows = lines.map((i) => ({ key: i.id, quoteItemId: i.id, name: i.name, note: i.extra ? 'Báo giá bổ sung' : '', qty: i.qty, unitPrice: i.unitPrice, warrantyDays: i.warrantyDays }));
  if (mainRejected && t.payment.amount > lateFee) rows.push({ key: 'khao-sat', name: 'Phí khảo sát', note: 'Khách từ chối báo giá', qty: 1, unitPrice: t.payment.amount - lateFee });
  if (lateFee) rows.push({ key: 'doi-lich', name: 'Phí đổi lịch sát giờ', note: '', qty: 1, unitPrice: lateFee });
  return rows;
}

function warrantyText(row, endAt) {
  if (!row.warrantyDays) return '—';
  return endAt ? `${row.warrantyDays} ngày, đến ${formatDate(endAt)}` : `${row.warrantyDays} ngày`;
}

/** UC06: biên nhận dịch vụ cho phiếu đã hoàn tất, in hoặc lưu PDF từ trình duyệt. */
export default function ReceiptPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(async () => {
    const [ticket, warranties] = await Promise.all([api.getTicket(id), api.listMyWarranties()]);
    return { ticket, warranties: warranties.filter((w) => w.ticketId === ticket.id) };
  }, [id]);
  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { ticket: t, warranties } = data;
  const crumbs = [{ label: 'Phiếu của tôi', to: '/khach/phieu' }, { label: t.id, to: `/khach/phieu/${t.id}` }, { label: 'Biên nhận' }];

  if (t.status !== STATUS.HOAN_TAT || !t.payment) {
    return (
      <>
        <PageHead crumbs={crumbs} title="Biên nhận dịch vụ" />
        <Alert tone="info">Biên nhận có sau khi phiếu hoàn tất và thanh toán được xác nhận.</Alert>
        <div style={{ marginTop: 16 }}><ButtonLink to={`/khach/phieu/${t.id}`} variant="outline">Quay lại phiếu</ButtonLink></div>
      </>
    );
  }

  const rows = receiptLines(t);
  const warrantyEnd = Object.fromEntries(warranties.map((w) => [w.quoteItemId, w.endAt]));
  return (
    <>
      <div className="no-print">
        <PageHead crumbs={crumbs} title="Biên nhận dịch vụ" actions={<Button icon={Printer} onClick={() => window.print()}>In biên nhận</Button>} />
      </div>
      <article className="receipt" aria-label={`Biên nhận phiếu ${t.id}`}>
        <header className="receipt-head">
          <div>
            <div className="receipt-brand">IT OnSite</div>
            <div className="tiny muted">Dịch vụ hỗ trợ IT tận nơi · TP. Hồ Chí Minh</div>
          </div>
          <div className="right">
            <h1 className="receipt-title">BIÊN NHẬN DỊCH VỤ</h1>
            <div className="small">Số phiếu: <span className="mono">{t.id}</span></div>
            <div className="small">Ngày hoàn tất: {formatDate(t.completedAt)}</div>
          </div>
        </header>

        <dl className="kv receipt-info">
          <dt>Khách hàng</dt><dd>{t.customer.name} · {t.customer.phone}</dd>
          <dt>Địa chỉ</dt><dd><AddressLine ticket={t} /></dd>
          <dt>Thiết bị</dt><dd>{t.device?.type} · {t.device?.brand} {t.device?.model}</dd>
          <dt>Loại sự cố</dt><dd>{t.category?.name}{t.isWarranty && ' (phiếu bảo hành)'}</dd>
          <dt>Kỹ thuật viên</dt><dd>{t.technician?.name || '—'}</dd>
        </dl>

        <div className="table-wrap">
          <table className="table receipt-table">
            <thead><tr><th>Nội dung</th><th className="right col-opt">SL</th><th className="right col-opt">Đơn giá</th><th className="right">Thành tiền</th><th className="col-opt">Bảo hành</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td className="muted">Không có hạng mục tính phí.</td><td className="col-opt" /><td className="col-opt" /><td /><td className="col-opt" /></tr>}
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    {r.name}
                    {r.note && <div className="tiny muted">{r.note}</div>}
                    <div className="tiny muted receipt-sub">{r.qty} × {money(r.unitPrice)} · Bảo hành: {warrantyText(r, warrantyEnd[r.quoteItemId])}</div>
                  </td>
                  <td className="right col-opt">{r.qty}</td>
                  <td className="right nowrap col-opt">{money(r.unitPrice)}</td>
                  <td className="right nowrap">{money(r.unitPrice * r.qty)}</td>
                  <td className="nowrap col-opt">{warrantyText(r, warrantyEnd[r.quoteItemId])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td className="strong">Tổng thanh toán</td><td className="col-opt" /><td className="col-opt" /><td className="right nowrap strong">{money(t.payment.amount)}</td><td className="col-opt" /></tr>
            </tfoot>
          </table>
        </div>

        <dl className="kv receipt-info">
          <dt>Thanh toán</dt><dd>{PAYMENT_TEXT[t.payment.status] || t.payment.status}{t.payment.method && ` · ${METHOD_TEXT[t.payment.method]}`}</dd>
          <dt>Thời điểm</dt><dd>{formatDateTime(t.payment.paidAt)}</dd>
        </dl>

        <p className="tiny muted receipt-foot">
          Biên nhận xác nhận dịch vụ đã thực hiện và số tiền đã thanh toán cho phiếu {t.id}; không thay thế hóa đơn giá trị gia tăng.
          Khi cần bảo hành, vui lòng gửi yêu cầu trong mục Bảo hành của tài khoản.
        </p>
      </article>
    </>
  );
}
