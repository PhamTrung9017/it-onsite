import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Banknote, CheckCircle2, ClipboardPlus, Eye, EyeOff, FilePlus2, MapPin, Navigation, Phone, PlayCircle, Plus, Send, X,
} from 'lucide-react';
import { useAction, useLoad, useNow } from '../../hooks/useApi.js';
import { useNotifications, useToast } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import {
  Alert, Badge, Button, ButtonLink, Card, CheckItem, ErrorState, Field, Loading, Modal, PageHead, PhotoGallery, PhotoPicker, StatusBadge,
} from '../../components/ui.jsx';
import { AiResult, QuoteStatusBadge, QuoteTable, TicketTimeline } from '../../components/ticket.jsx';
import { STATUS } from '../../lib/ticketStatus.js';
import { canComplete } from '../../lib/rules.js';
import { formatDateTime, money } from '../../lib/format.js';

const DEFAULT_CHECKLIST = ['Kiểm tra hiện trạng cùng khách', 'Sao lưu dữ liệu quan trọng (nếu cần)', 'Thực hiện các hạng mục đã duyệt', 'Chạy thử và bàn giao cho khách'];

export default function JobDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { refresh } = useNotifications();
  const { data, loading, error, reload, setData } = useLoad(async () => {
    const [t, catalog] = await Promise.all([api.getTicket(id), api.getCatalog()]);
    return { t, categories: catalog.categories };
  }, [id]);
  const { busy, run } = useAction();
  const now = useNow();
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [newItem, setNewItem] = useState('');
  const [showCred, setShowCred] = useState(false);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { t, categories } = data;

  async function act(key, fn, msg) {
    const r = await run(key, fn, msg);
    if (r) { setData({ t: { ...t, ...r }, categories }); setModal(null); setReason(''); refresh(); reload(true); }
    return r;
  }

  const pendingQuote = t.quotes.find((q) => q.status === 'CHO_DUYET');
  const waitingResponse = t.status === STATUS.DA_PHAN_CONG && !t.assignment.result;
  const left = waitingResponse ? Math.max(0, new Date(t.assignment.deadline).getTime() - now) : 0;
  const checklist = t.checklist.length ? t.checklist : DEFAULT_CHECKLIST.map((text) => ({ text, done: false }));
  const working = t.status === STATUS.DANG_THUC_HIEN;
  const mapUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${t.address}, ${t.ward}, Thành phố Hồ Chí Minh`)}`;

  const saveChecklist = (list) => act('ck', () => api.updateWork(t.id, { checklist: list }));

  return (
    <>
      <PageHead crumbs={[{ label: 'Lịch việc', to: '/ktv/lich-viec' }, { label: t.id }]} title={t.category?.name} sub={<span className="mono">{t.id}</span>} actions={<StatusBadge status={t.status} />} />
      <div className="split">
        <div className="stack">
          {waitingResponse && (
            <Card>
              <div className="stack">
                <Alert tone="warning" title={`Việc mới · còn ${Math.floor(left / 60000)} phút ${Math.floor((left % 60000) / 1000)} giây để phản hồi`}>
                  Quá hạn, phân công sẽ tự động được thu hồi và chuyển cho kỹ thuật viên khác.
                </Alert>
                <div className="row wrap">
                  <Button icon={CheckCircle2} loading={busy === 'accept'} onClick={() => act('accept', () => api.respondAssignment(t.id, { accept: true }), 'Đã nhận việc.')}>Nhận việc</Button>
                  <Button variant="danger" icon={X} onClick={() => setModal('decline')}>Từ chối</Button>
                </div>
              </div>
            </Card>
          )}
          {t.status === STATUS.KTV_DA_NHAN && (
            <Card>
              <div className="row-between wrap">
                <div><div className="strong">Đã đến nhà khách?</div><div className="small muted">Check-in để bắt đầu khảo sát và lập báo giá.</div></div>
                <Button icon={PlayCircle} loading={busy === 'checkin'} onClick={() => act('checkin', () => api.checkIn(t.id), 'Đã check-in. Bắt đầu khảo sát.')}>Check-in</Button>
              </div>
            </Card>
          )}
          {t.status === STATUS.DANG_KHAO_SAT && (
            <Card title="Khảo sát">
              <div className="stack">
                <div className="field"><span className="label">Ảnh hiện trạng trước khi xử lý</span>
                  <PhotoPicker photos={t.photosBefore} max={6} onError={toast.error} label="Chụp ảnh"
                    onAdd={(photos) => act('pb', () => api.addWorkPhotos(t.id, { kind: 'before', photos }))}
                    onRemove={(index) => act('pbr', () => api.removeWorkPhoto(t.id, { kind: 'before', index }))} />
                </div>
                <ButtonLink to={`/ktv/viec/${t.id}/bao-gia`} variant="accent" icon={FilePlus2}>Lập báo giá</ButtonLink>
              </div>
            </Card>
          )}
          {pendingQuote && (
            <Card title={pendingQuote.type === 'BO_SUNG' ? 'Báo giá bổ sung chờ khách duyệt' : 'Báo giá chờ khách duyệt'} action={<QuoteStatusBadge quote={pendingQuote} />}>
              <div className="stack">
                <QuoteTable quote={pendingQuote} />
                <Alert>Khách duyệt trên điện thoại của họ. Nếu khách không tiện thao tác, gửi mã xác nhận để khách đọc cho bạn.</Alert>
                <Button variant="outline" icon={Send} onClick={async () => { const r = await run('code', () => api.sendOnsiteCode(t.id)); if (r) { toast.success(`Đã gửi mã xác nhận tới số ${r.sentTo}.`); setModal('code'); } }} loading={busy === 'code'}>Khách xác nhận tại chỗ</Button>
              </div>
            </Card>
          )}
          {working && (
            <Card title="Thực hiện" action={<ButtonLink to={`/ktv/viec/${t.id}/bao-gia`} variant="ghost" size="sm" icon={ClipboardPlus}>Báo giá bổ sung</ButtonLink>}>
              <div className="stack">
                {t.acceptance?.result === 'CHUA_DAT' && <Alert tone="danger" title="Khách yêu cầu làm lại">{t.acceptance.reason}</Alert>}
                <div>
                  <span className="section-title">Danh sách công việc</span>
                  {checklist.map((c, i) => (
                    <CheckItem key={c.text} checked={c.done} onChange={(v) => saveChecklist(checklist.map((x, j) => (j === i ? { ...x, done: v } : x)))}>{c.text}</CheckItem>
                  ))}
                  <div className="row-sm" style={{ marginTop: 6 }}>
                    <input className="input" placeholder="Thêm công việc" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
                    <Button variant="outline" icon={Plus} disabled={!newItem.trim()} onClick={() => { saveChecklist([...checklist, { text: newItem.trim(), done: false }]); setNewItem(''); }}>Thêm</Button>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field"><span className="label">Ảnh trước ({t.photosBefore.length})</span>
                    <PhotoPicker photos={t.photosBefore} max={6} onError={toast.error} label="Thêm ảnh"
                      onAdd={(photos) => act('pb', () => api.addWorkPhotos(t.id, { kind: 'before', photos }))}
                      onRemove={(index) => act('pbr', () => api.removeWorkPhoto(t.id, { kind: 'before', index }))} />
                  </div>
                  <div className="field"><span className="label">Ảnh sau ({t.photosAfter.length})</span>
                    <PhotoPicker photos={t.photosAfter} max={6} onError={toast.error} label="Thêm ảnh"
                      onAdd={(photos) => act('pa', () => api.addWorkPhotos(t.id, { kind: 'after', photos }))}
                      onRemove={(index) => act('par', () => api.removeWorkPhoto(t.id, { kind: 'after', index }))} />
                  </div>
                </div>
                {!canComplete(t) && <p className="small muted">Cần ít nhất 1 ảnh trước và 1 ảnh sau khi xử lý để báo hoàn thành.</p>}
                <Button size="lg" icon={CheckCircle2} disabled={!canComplete(t)} loading={busy === 'done'} onClick={() => act('done', () => api.completeWork(t.id), 'Đã báo hoàn thành, chờ khách nghiệm thu.')}>Báo hoàn thành</Button>
              </div>
            </Card>
          )}
          {t.status === STATUS.CHO_NGHIEM_THU && <Alert title="Chờ khách nghiệm thu">Khách đang kiểm tra kết quả trên ứng dụng.</Alert>}
          {t.status === STATUS.CHO_THANH_TOAN && (
            <Card title="Thu tiền">
              <div className="stack">
                <div className="row-between"><span className="muted">Số tiền</span><span className="price" style={{ fontSize: 22 }}>{money(t.payment?.amount ?? t.amountDue)}</span></div>
                {t.payment?.status === 'CHO_XAC_NHAN' ? <Alert>Khách đã chuyển khoản, điều phối viên đang xác nhận.</Alert>
                  : <Button size="lg" icon={Banknote} onClick={() => setModal('cash')}>Xác nhận đã thu tiền mặt</Button>}
              </div>
            </Card>
          )}
          {t.status === STATUS.HOAN_TAT && <Alert tone="success" title="Phiếu đã hoàn tất">{t.payment?.method === 'TIEN_MAT' ? `Đã thu tiền mặt ${money(t.payment.amount)}.` : 'Đã thanh toán chuyển khoản.'}</Alert>}

          <Card title="Mô tả của khách">
            <div className="stack">
              <p>{t.description}</p>
              {t.photos.length > 0 && <PhotoGallery photos={t.photos} />}
              <div className="divider" />
              <span className="section-title">Phân loại tự động</span>
              <AiResult ai={t.aiResult} categories={categories} />
            </div>
          </Card>

          {t.quotes.filter((q) => q.status !== 'CHO_DUYET').map((q) => (
            <Card key={q.id} title={q.type === 'BO_SUNG' ? 'Báo giá bổ sung' : 'Báo giá'} action={<QuoteStatusBadge quote={q} />}>
              {q.status === 'TU_CHOI' ? <p className="small muted">Khách từ chối: {q.rejectReason}</p> : <QuoteTable quote={q} />}
            </Card>
          ))}
        </div>

        <div className="stack">
          <Card title="Khách hàng">
            <div className="stack">
              <div><div className="strong">{t.customer?.name}</div><div className="small muted">{t.device?.type} · {t.device?.brand} {t.device?.model}</div></div>
              <div className="row-sm small" style={{ alignItems: 'flex-start' }}><MapPin size={16} style={{ flex: 'none', marginTop: 2 }} aria-hidden />{t.address}, phường {t.ward}, TP. Hồ Chí Minh</div>
              <div className="small"><span className="muted">Giờ hẹn: </span><span className="strong">{formatDateTime(t.assignment?.appointmentAt)}</span></div>
              {t.deviceCredentials && (
                <div className="row-between" style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                  <span className="small"><span className="muted">Đăng nhập máy: </span><span className="mono">{showCred ? t.deviceCredentials : '••••••'}</span></span>
                  {t.deviceCredentials !== '••••••' && <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setShowCred(!showCred)} aria-label={showCred ? 'Ẩn' : 'Hiện'}>{showCred ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
                </div>
              )}
              {!waitingResponse && t.status !== STATUS.HOAN_TAT && (
                <div className="grid-2" style={{ gap: 8 }}>
                  <a className="btn btn-outline btn-sm" href={`tel:${t.customer?.phone}`}><Phone size={16} aria-hidden />Gọi khách</a>
                  <a className="btn btn-outline btn-sm" href={mapUrl} target="_blank" rel="noreferrer"><Navigation size={16} aria-hidden />Chỉ đường</a>
                </div>
              )}
              {t.urgency === 'CAO' && <Badge tone="danger" plain>Mức khẩn cao</Badge>}
            </div>
          </Card>
          <Card title="Tiến trình"><TicketTimeline ticket={t} /></Card>
          <Link to="/ktv/lich-viec" className="small">← Lịch việc</Link>
        </div>
      </div>

      <Modal open={modal === 'decline'} title="Từ chối việc" onClose={() => setModal(null)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Đóng</Button><Button variant="danger-solid" loading={busy === 'decline'} onClick={() => act('decline', () => api.respondAssignment(t.id, { accept: false, reason }), 'Đã từ chối. Điều phối viên sẽ phân công người khác.')}>Từ chối</Button></>}>
        <Field label="Lý do" htmlFor="dr"><textarea id="dr" className="textarea" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: trùng lịch cá nhân, quá xa" /></Field>
      </Modal>
      <Modal open={modal === 'code'} title="Khách xác nhận tại chỗ" onClose={() => setModal(null)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Đóng</Button><Button loading={busy === 'confirm'} onClick={() => act('confirm', () => api.confirmOnsite(t.id, { code }), 'Khách đã đồng ý báo giá.')}>Xác nhận</Button></>}>
        <p className="small muted">Mã 6 số đã gửi tới điện thoại của khách. Khách đọc mã cho bạn nếu đồng ý toàn bộ báo giá.</p>
        <Field label="Mã xác nhận" htmlFor="oc"><input id="oc" className="input mono" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} /></Field>
      </Modal>
      <Modal open={modal === 'cash'} title="Xác nhận thu tiền mặt" onClose={() => setModal(null)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Đóng</Button><Button loading={busy === 'cash'} onClick={() => act('cash', () => api.confirmCash(t.id), 'Đã xác nhận thu tiền mặt. Phiếu hoàn tất.')}>Đã thu {money(t.payment?.amount ?? t.amountDue)}</Button></>}>
        <Alert tone="warning">Chỉ xác nhận khi đã nhận đủ tiền. Khoản tiền mặt sẽ được điều phối viên đối soát.</Alert>
      </Modal>
    </>
  );
}
