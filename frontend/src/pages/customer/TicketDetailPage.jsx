import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, CreditCard, FileText, Phone, Receipt, ThumbsDown, XCircle } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import {
  Alert, Badge, Button, ButtonLink, Card, ErrorState, Field, Loading, Modal, PageHead, PhotoGallery, StarInput, Stars, StatusBadge,
} from '../../components/ui.jsx';
import { AddressLine, QuoteStatusBadge, QuoteTable, TicketTimeline } from '../../components/ticket.jsx';
import { STATUS } from '../../lib/ticketStatus.js';
import { combineDateTime, formatDateTime, formatTime, initials, money, timeSlots, toDateInput } from '../../lib/format.js';

export default function TicketDetailPage() {
  const { id } = useParams();
  const { data: t, loading, error, reload, setData } = useLoad(() => api.getTicket(id), [id]);
  const { busy, run } = useAction();
  const { refresh } = useNotifications();
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const slots = useMemo(() => (t ? timeSlots(t.config.serviceHours.start, t.config.serviceHours.end) : []), [t]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const pendingQuote = t.quotes.find((q) => q.status === 'CHO_DUYET');
  const decidedQuotes = t.quotes.filter((q) => q.status !== 'CHO_DUYET');
  const appointment = t.assignment?.appointmentAt || t.slotStart;

  async function act(key, fn, msg) {
    const r = await run(key, fn, msg);
    if (r) { setData({ ...t, ...r }); setModal(null); setReason(''); refresh(); reload(true); }
  }

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Phiếu của tôi', to: '/khach/phieu' }, { label: t.id }]}
        title={`${t.category?.name || 'Yêu cầu hỗ trợ'}`}
        sub={<span className="row-sm wrap"><span className="mono">{t.id}</span>·<span>{t.device?.brand} {t.device?.model}</span>{t.isWarranty && <Badge tone="success" plain>Phiếu bảo hành</Badge>}</span>}
        actions={<StatusBadge status={t.status} />}
      />

      <div className="split">
        <div className="stack">
          {/* Việc khách cần làm */}
          {pendingQuote && (
            <Alert tone="warning" title={pendingQuote.type === 'BO_SUNG' ? 'Có báo giá bổ sung chờ bạn duyệt' : 'Kỹ thuật viên đã gửi báo giá'} icon={FileText}>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <ButtonLink to={`/khach/phieu/${t.id}/bao-gia`} variant="accent" size="sm">Xem và duyệt báo giá</ButtonLink>
              </div>
            </Alert>
          )}
          {t.status === STATUS.CHO_NGHIEM_THU && (
            <Card title="Nghiệm thu kết quả">
              <div className="stack">
                <p className="small muted">Kỹ thuật viên đã báo hoàn thành. Vui lòng kiểm tra máy và xác nhận.</p>
                <div className="grid-2">
                  <div className="stack-sm"><span className="section-title">Trước khi xử lý</span><PhotoGallery photos={t.photosBefore} /></div>
                  <div className="stack-sm"><span className="section-title">Sau khi xử lý</span><PhotoGallery photos={t.photosAfter} /></div>
                </div>
                <div className="row wrap">
                  <Button icon={CheckCircle2} loading={busy === 'ok'} onClick={() => act('ok', () => api.acceptWork(t.id, { ok: true }), 'Đã nghiệm thu. Vui lòng thanh toán.')}>Nghiệm thu đạt</Button>
                  <Button variant="danger" icon={ThumbsDown} onClick={() => setModal('reject-work')}>Chưa đạt, yêu cầu làm lại</Button>
                </div>
              </div>
            </Card>
          )}
          {t.status === STATUS.CHO_THANH_TOAN && (
            <Card title="Thanh toán">
              <div className="row-between wrap">
                <div>
                  <div className="small muted">Số tiền cần thanh toán</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }} className="price">{money(t.payment?.amount ?? t.amountDue)}</div>
                  {t.quotes.some((q) => q.type === 'CHINH' && q.status === 'TU_CHOI') && <div className="tiny muted">Phí khảo sát do bạn từ chối báo giá</div>}
                </div>
                {t.payment?.status === 'CHO_XAC_NHAN' ? <Badge tone="info">Đang chờ xác nhận chuyển khoản</Badge>
                  : <ButtonLink to={`/khach/phieu/${t.id}/thanh-toan`} variant="accent" icon={CreditCard}>Thanh toán</ButtonLink>}
              </div>
            </Card>
          )}
          {t.status === STATUS.HOAN_TAT && t.payment && (
            <Card title="Biên nhận dịch vụ">
              <div className="row-between wrap">
                <div>
                  <div className="small muted">Đã thanh toán</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }} className="price">{money(t.payment.amount)}</div>
                </div>
                <ButtonLink to={`/khach/phieu/${t.id}/bien-nhan`} variant="outline" icon={Receipt}>Xem biên nhận</ButtonLink>
              </div>
            </Card>
          )}
          {t.status === STATUS.HOAN_TAT && (
            <Card title="Đánh giá dịch vụ">
              {t.review ? (
                <div className="stack-sm">
                  <Stars value={t.review.stars} size={20} />
                  {t.review.comment && <p>{t.review.comment}</p>}
                  <span className="tiny muted">Đã đánh giá lúc {formatDateTime(t.review.at)}</span>
                </div>
              ) : t.reviewPolicy.allowed ? (
                <div className="stack">
                  <p className="small muted">Bạn hài lòng với dịch vụ chứ? Đánh giá giúp chúng tôi phục vụ tốt hơn.</p>
                  <StarInput value={stars} onChange={setStars} />
                  <Field label={stars && stars <= 2 ? 'Lý do (bắt buộc)' : 'Nhận xét (không bắt buộc)'} htmlFor="cmt">
                    <textarea id="cmt" className="textarea" style={{ minHeight: 80 }} value={comment} onChange={(e) => setComment(e.target.value)} />
                  </Field>
                  <div><Button disabled={!stars} loading={busy === 'review'} onClick={() => act('review', () => api.submitReview(t.id, { stars, comment }), 'Cảm ơn bạn đã đánh giá!')}>Gửi đánh giá</Button></div>
                </div>
              ) : <p className="small muted">{t.reviewPolicy.reason}</p>}
            </Card>
          )}
          {t.status === STATUS.DA_HUY && t.cancel && (
            <Alert tone="danger" title="Phiếu đã hủy" icon={XCircle}>
              {t.cancel.byName || 'Khách hàng'} hủy lúc {formatDateTime(t.cancel.at)}. Lý do: {t.cancel.reason}.
              {t.cancel.fee > 0 && ` Phí hủy sát giờ: ${money(t.cancel.fee)}.`}
            </Alert>
          )}

          <Card title="Tiến trình xử lý"><TicketTimeline ticket={t} /></Card>

          {decidedQuotes.length > 0 && (
            <Card title="Báo giá đã chốt">
              <div className="stack">
                {decidedQuotes.map((q) => (
                  <div key={q.id} className="stack-sm">
                    <div className="row-between"><span className="strong small">{q.type === 'BO_SUNG' ? 'Báo giá bổ sung' : 'Báo giá chính'} · {formatDateTime(q.createdAt)}</span><QuoteStatusBadge quote={q} /></div>
                    {q.status === 'TU_CHOI' ? <p className="small muted">Bạn đã từ chối báo giá. Lý do: {q.rejectReason}</p> : <QuoteTable quote={q} />}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Thông tin yêu cầu">
            <div className="stack">
              <p>{t.description}</p>
              {t.photos.length > 0 && <PhotoGallery photos={t.photos} />}
              <dl className="kv">
                <dt>Thiết bị</dt><dd>{t.device?.type} · {t.device?.brand} {t.device?.model}{t.device?.note && <div className="tiny muted">{t.device.note}</div>}</dd>
                <dt>Địa chỉ</dt><dd><AddressLine ticket={t} /></dd>
                <dt>Giờ hẹn</dt><dd>{formatDateTime(appointment)}</dd>
                <dt>Tạo lúc</dt><dd>{formatDateTime(t.createdAt)}</dd>
              </dl>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Kỹ thuật viên phụ trách">
            {t.technician && ![STATUS.MOI, STATUS.DA_TIEP_NHAN].includes(t.status) ? (
              <div className="stack">
                <div className="row">
                  <span className="avatar">{initials(t.technician.name)}</span>
                  <div className="grow"><div className="strong">{t.technician.name}</div><div className="row-sm tiny muted"><Stars value={t.technician.rating} size={13} />{t.technician.rating} · {t.technician.ratingCount} đánh giá</div></div>
                </div>
                {t.status !== STATUS.HOAN_TAT && t.status !== STATUS.DA_HUY && <a className="btn btn-outline btn-block" href={`tel:${t.technician.phone}`}><Phone size={18} aria-hidden />Gọi kỹ thuật viên</a>}
              </div>
            ) : <p className="small muted">Điều phối viên đang chọn kỹ thuật viên phù hợp với sự cố và khu vực của bạn.</p>}
          </Card>

          {t.policy.allowed && (
            <Card title="Lịch hẹn">
              <div className="stack">
                <div className="row-sm"><CalendarClock size={18} color="var(--brand-600)" aria-hidden /><span className="strong">{formatDateTime(appointment)}</span></div>
                <p className="tiny muted">{t.policy.reason}</p>
                <div className="row wrap">
                  <Button variant="outline" size="sm" onClick={() => { setDate(toDateInput(appointment)); setTime(slots.includes(formatTime(appointment)) ? formatTime(appointment) : slots[0]); setModal('reschedule'); }}>Đổi lịch hẹn</Button>
                  <Button variant="danger" size="sm" onClick={() => setModal('cancel')}>Hủy yêu cầu</Button>
                </div>
              </div>
            </Card>
          )}

          {t.status === STATUS.HOAN_TAT && (
            <Card title="Bảo hành">
              <p className="small muted">Phiếu bảo hành điện tử đã được phát hành cho các hạng mục có bảo hành.</p>
              <div style={{ marginTop: 12 }}><ButtonLink to="/khach/bao-hanh" variant="outline" size="sm">Xem bảo hành</ButtonLink></div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={modal === 'cancel'} title="Hủy yêu cầu" onClose={() => setModal(null)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Không hủy</Button><Button variant="danger-solid" loading={busy === 'cancel'} onClick={() => act('cancel', () => api.cancelTicket(t.id, { reason }), 'Đã hủy yêu cầu.')}>Xác nhận hủy</Button></>}>
        {t.policy.fee > 0 && <Alert tone="warning">Còn dưới {t.config.freeCancelHours} giờ trước giờ hẹn, hủy lúc này sẽ tính phí khảo sát {money(t.policy.fee)}.</Alert>}
        <Field label="Lý do hủy" htmlFor="rs"><textarea id="rs" className="textarea" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>

      <Modal open={modal === 'reschedule'} title="Đổi lịch hẹn" onClose={() => setModal(null)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Đóng</Button><Button loading={busy === 'resch'} onClick={() => act('resch', () => api.rescheduleTicket(t.id, { slotStart: combineDateTime(date, time) }), 'Đã đổi lịch hẹn.')}>Lưu lịch mới</Button></>}>
        {t.policy.fee > 0 && <Alert tone="warning">Đổi lịch sát giờ sẽ tính phí khảo sát {money(t.policy.fee)}.</Alert>}
        <div className="grid-2">
          <Field label="Ngày" htmlFor="d"><input id="d" type="date" className="input" min={toDateInput(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Khung giờ" htmlFor="tm"><select id="tm" className="select" value={time} onChange={(e) => setTime(e.target.value)}>{slots.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
      </Modal>

      <Modal open={modal === 'reject-work'} title="Yêu cầu làm lại" onClose={() => setModal(null)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Đóng</Button><Button loading={busy === 'nok'} onClick={() => act('nok', () => api.acceptWork(t.id, { ok: false, reason }), 'Đã gửi yêu cầu làm lại cho kỹ thuật viên.')}>Gửi yêu cầu</Button></>}>
        <Field label="Điểm chưa đạt" htmlFor="nr" hint="Mô tả cụ thể để kỹ thuật viên xử lý đúng chỗ"><textarea id="nr" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
      <div className="mobile-only" style={{ marginTop: 16 }}><Link to="/khach/phieu" className="small">← Tất cả phiếu</Link></div>
    </>
  );
}
