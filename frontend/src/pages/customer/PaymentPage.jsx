import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, CheckCircle2, Copy, QrCode } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications, useToast } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Alert, Button, ButtonLink, Card, Empty, ErrorState, Loading, PageHead, QRImage, Segmented } from '../../components/ui.jsx';
import { formatDateTime, money } from '../../lib/format.js';

const PAID_LABEL = {
  CHO_XAC_NHAN: 'Bạn đã báo chuyển khoản, điều phối viên đang đối chiếu với sao kê ngân hàng.',
  DA_THU: 'Kỹ thuật viên đã xác nhận thu tiền mặt.',
  DA_XAC_NHAN: 'Đã xác nhận nhận được chuyển khoản.',
  DA_DOI_SOAT: 'Đã thu và đối soát tiền mặt.',
  MIEN_PHI: 'Phiếu không phát sinh chi phí.',
};

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useNotifications();
  const { data, loading, error, reload } = useLoad(() => api.getPaymentInfo(id), [id]);
  const { busy, run } = useAction();
  const [method, setMethod] = useState('qr');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Đã sao chép.'));
  async function done(fn, msg) {
    const r = await run('pay', fn, msg);
    if (r) { refresh(); navigate(`/khach/phieu/${id}`); }
  }
  return (
    <div style={{ maxWidth: 560 }}>
      <PageHead crumbs={[{ label: 'Phiếu của tôi', to: '/khach/phieu' }, { label: id, to: `/khach/phieu/${id}` }, { label: 'Thanh toán' }]} title="Thanh toán" />
      <div className="stack">
        <Card>
          <div className="center">
            <div className="small muted">Số tiền</div>
            <div style={{ fontSize: 34, fontWeight: 800 }} className="price">{money(data.amount)}</div>
            <div className="tiny muted mono">{id}</div>
          </div>
        </Card>
        {!data.payable ? (
          <Card>
            <Empty icon={CheckCircle2} title={data.payment?.status && PAID_LABEL[data.payment.status] ? 'Đã ghi nhận thanh toán' : 'Phiếu chưa tới bước thanh toán'}
              action={<ButtonLink to={`/khach/phieu/${id}`} variant="outline">Về chi tiết phiếu</ButtonLink>}>
              {PAID_LABEL[data.payment?.status] || 'Bạn sẽ thanh toán sau khi nghiệm thu kết quả.'}
              {data.payment?.paidAt && <> Thời điểm: {formatDateTime(data.payment.paidAt)}.</>}
            </Empty>
          </Card>
        ) : (
          <>
            <Segmented label="Hình thức thanh toán" value={method} onChange={setMethod} options={[{ value: 'qr', label: 'Chuyển khoản VietQR' }, { value: 'cash', label: 'Tiền mặt' }]} />
            {method === 'qr' ? (
              <Card>
                <div className="stack" style={{ alignItems: 'center' }}>
                  <QRImage payload={data.qrPayload} />
                  <p className="small muted center">Mở ứng dụng ngân hàng, quét mã. Số tiền và nội dung đã được điền sẵn.</p>
                  <dl className="kv" style={{ width: '100%' }}>
                    <dt>Ngân hàng</dt><dd>{data.bank.name}</dd>
                    <dt>Số tài khoản</dt><dd className="row-sm"><span className="mono">{data.bank.accountNumber}</span><button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => copy(data.bank.accountNumber)} aria-label="Sao chép số tài khoản"><Copy size={15} /></button></dd>
                    <dt>Chủ tài khoản</dt><dd>{data.bank.accountName}</dd>
                    <dt>Nội dung</dt><dd className="mono">ITONSITE {id.replace(/-/g, '')}</dd>
                  </dl>
                  <Button variant="accent" block size="lg" icon={QrCode} loading={busy === 'pay'} onClick={() => done(() => api.reportTransfer(id), 'Đã ghi nhận. Điều phối viên sẽ xác nhận khi nhận được tiền.')}>Tôi đã chuyển khoản</Button>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="stack">
                  <Alert>Thanh toán trực tiếp cho kỹ thuật viên. Kỹ thuật viên xác nhận đã thu tiền trên hệ thống, phiếu sẽ hoàn tất.</Alert>
                  <Button block size="lg" icon={Banknote} loading={busy === 'pay'} onClick={() => done(() => api.chooseCash(id), 'Đã báo kỹ thuật viên thu tiền mặt.')}>Trả tiền mặt cho kỹ thuật viên</Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
