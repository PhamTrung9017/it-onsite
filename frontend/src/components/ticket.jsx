import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Clock, MapPin, Sparkles, X } from 'lucide-react';
import { MAIN_FLOW, STATUS, STATUS_LABEL } from '../lib/ticketStatus.js';
import { formatDateTime, money, relativeDay, formatTime, timeAgo } from '../lib/format.js';
import { quoteTotal } from '../lib/rules.js';
import { URGENCY_LABEL } from '../lib/classifier.js';
import { Badge, Button, Card, DeviceIcon, Empty, ErrorState, Loading, Money, PageHead, StatusBadge } from './ui.jsx';
import { api } from '../services/api.js';
import { useAction, useLoad } from '../hooks/useApi.js';
import { useNotifications } from '../context/AppContext.jsx';

/** Dòng thời gian trạng thái: các bước luồng chính, bước đã qua lấy thời điểm từ lịch sử. */
export function TicketTimeline({ ticket }) {
  const reached = new Map();
  ticket.history.forEach((h) => { if (!reached.has(h.status) || h.status === ticket.status) reached.set(h.status, h); });
  if (ticket.status === STATUS.DA_HUY) {
    const steps = ticket.history.filter((h, i, arr) => arr.findIndex((x) => x.status === h.status) === i);
    return (
      <ol className="timeline">
        {steps.map((h) => (
          <li key={h.status} className={h.status === STATUS.DA_HUY ? 'cancel' : 'done'}>
            <span className="dot">{h.status === STATUS.DA_HUY ? <X aria-hidden /> : <Check aria-hidden />}</span>
            <div className="t">{STATUS_LABEL[h.status]}</div>
            <div className="s">{formatDateTime(h.at)} · {h.by}{h.note ? ` · ${h.note}` : ''}</div>
          </li>
        ))}
      </ol>
    );
  }
  const currentIndex = MAIN_FLOW.indexOf(ticket.status);
  return (
    <ol className="timeline">
      {MAIN_FLOW.map((s, i) => {
        const h = reached.get(s);
        const state = i < currentIndex ? 'done' : i === currentIndex ? (s === STATUS.HOAN_TAT ? 'done' : 'current') : 'todo';
        // Khách từ chối báo giá: bỏ qua các bước thực hiện và nghiệm thu
        if (!h && (s === STATUS.DANG_THUC_HIEN || s === STATUS.CHO_NGHIEM_THU) && reached.has(STATUS.CHO_THANH_TOAN)) return null;
        return (
          <li key={s} className={state}>
            <span className="dot">{state === 'done' && <Check aria-hidden />}</span>
            <div className="t">{STATUS_LABEL[s]}</div>
            {h && state !== 'todo' && <div className="s">{formatDateTime(h.at)} · {h.by}{h.note ? ` · ${h.note}` : ''}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function QuoteTable({ quote, selectable, selected, onToggle, surveyFee, showSurveyFee }) {
  const total = selectable ? quote.items.filter((i) => selected.includes(i.id)).reduce((s, i) => s + i.unitPrice * i.qty, 0) : quoteTotal(quote.items, quote.status !== 'CHO_DUYET');
  return (
    <div className="stack-sm">
      {quote.items.map((it) => {
        const on = selectable ? selected.includes(it.id) : it.selected || quote.status === 'CHO_DUYET';
        const Row = selectable ? 'button' : 'div';
        return (
          <Row key={it.id} type={selectable ? 'button' : undefined} onClick={selectable ? () => onToggle(it.id) : undefined}
            role={selectable ? 'checkbox' : undefined} aria-checked={selectable ? on : undefined}
            className="row" style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, background: on ? 'var(--surface)' : 'var(--line-2)', textAlign: 'left', width: '100%', cursor: selectable ? 'pointer' : 'default', opacity: on ? 1 : 0.65 }}>
            {selectable && (
              <span style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? 'var(--brand-600)' : 'var(--line)'}`, background: on ? 'var(--brand-600)' : '#fff', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>
                {on && <Check size={14} strokeWidth={3} aria-hidden />}
              </span>
            )}
            <div className="grow">
              <div className="strong" style={{ fontSize: 14 }}>{it.name}{it.qty > 1 && ` × ${it.qty}`}</div>
              <div className="tiny muted">{it.kind === 'part' ? 'Linh kiện' : 'Dịch vụ'} · {it.warrantyDays ? `Bảo hành ${it.warrantyDays} ngày` : 'Không bảo hành'}</div>
            </div>
            <Money value={it.unitPrice * it.qty} className={on ? '' : 'strike'} />
          </Row>
        );
      })}
      {showSurveyFee && (
        <div className="row" style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--success-bg)' }}>
          <div className="grow"><div className="strong" style={{ fontSize: 14, color: 'var(--success)' }}>Phí khảo sát</div><div className="tiny" style={{ color: 'var(--success)' }}>Miễn phí khi bạn duyệt báo giá, chỉ thu khi từ chối</div></div>
          <span className="price strike">{money(surveyFee)}</span>
        </div>
      )}
      <div className="row-between" style={{ padding: '8px 4px 0' }}>
        <span className="strong">Tổng cộng</span>
        <Money value={total} className="" />
      </div>
    </div>
  );
}

export function QuoteStatusBadge({ quote }) {
  const map = { CHO_DUYET: ['warning', 'Chờ duyệt'], DA_DUYET: ['success', 'Đã duyệt'], DUYET_MOT_PHAN: ['primary', 'Duyệt một phần'], TU_CHOI: ['danger', 'Từ chối'] };
  const [tone, label] = map[quote.status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function AiResult({ ai, categories }) {
  if (!ai) return <p className="small muted">Phiếu chưa có kết quả phân loại tự động.</p>;
  if (ai.state === 'failed') return <p className="small muted">Phân loại tự động không phản hồi, cần điều phối viên xác định loại sự cố.</p>;
  const cat = categories?.find((c) => c.code === ai.categoryCode);
  return (
    <div className="stack-sm">
      <div className="row-between wrap">
        <span className="row-sm strong"><Sparkles size={16} color="var(--brand-600)" aria-hidden />{cat?.name || ai.categoryCode}</span>
        <Badge tone={ai.state === 'low_confidence' ? 'warning' : 'success'} plain>Độ tin cậy {Math.round(ai.confidence * 100)}%</Badge>
      </div>
      <div className="small muted">Mức khẩn: {URGENCY_LABEL[ai.urgency]} · {ai.reason}</div>
      {ai.state === 'low_confidence' && <div className="small" style={{ color: 'var(--warning)' }}>Độ tin cậy thấp, cần điều phối viên xác nhận.</div>}
    </div>
  );
}

/** Thẻ phiếu trong danh sách. */
export function TicketRow({ ticket, to }) {
  const at = ticket.assignment?.appointmentAt || ticket.slotStart;
  return (
    <Link to={to} className="list-item ticket-row">
      <div className="list-icon"><DeviceIcon type={ticket.device?.type} /></div>
      <div className="grow">
        <div className="ticket-row-head">
          <span className="strong ticket-row-title">{ticket.category?.name}</span>
          <StatusBadge status={ticket.status} />
        </div>
        <div className="small muted ellipsis">{ticket.device?.brand} {ticket.device?.model}</div>
        <div className="tiny muted row-sm wrap" style={{ marginTop: 2 }}>
          <span className="mono">{ticket.id}</span>
          <span className="row-sm"><Clock size={13} aria-hidden />{relativeDay(at)} {formatTime(at)}</span>
        </div>
      </div>
    </Link>
  );
}

export function AddressLine({ ticket }) {
  return <span className="row-sm small muted" style={{ alignItems: 'flex-start' }}><MapPin size={15} style={{ flex: 'none', marginTop: 3 }} aria-hidden />{ticket.address}, phường {ticket.ward}, TP. Hồ Chí Minh</span>;
}

/** Màn hình thông báo dùng chung cho mọi vai trò. */
export function NotificationsPage({ ticketLink }) {
  const { data, loading, error, reload, setData } = useLoad(() => api.listNotifications(), []);
  const { refresh } = useNotifications();
  const { busy, run } = useAction();
  async function readAll() {
    await run('all', () => api.markNotificationsRead());
    setData((xs) => xs.map((n) => ({ ...n, read: true })));
    refresh();
  }
  async function open(n) {
    if (!n.read) { await api.markNotificationsRead([n.id]); refresh(); }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const unread = data.filter((n) => !n.read).length;
  return (
    <>
      <PageHead title="Thông báo" sub={unread ? `${unread} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo'}
        actions={unread > 0 && <Button variant="outline" size="sm" icon={CheckCheck} loading={busy === 'all'} onClick={readAll}>Đánh dấu đã đọc tất cả</Button>} />
      <Card bodyClass="list">
        {data.length === 0 ? <Empty icon={Bell} title="Chưa có thông báo">Các cập nhật về phiếu của bạn sẽ hiện ở đây.</Empty> : data.map((n) => {
          const content = (
            <>
              <div className="list-icon" style={n.read ? { background: 'var(--muted-bg)', color: 'var(--ink-4)' } : undefined}><Bell aria-hidden /></div>
              <div className="grow">
                <div className="row-sm"><span className="strong" style={{ fontSize: 14 }}>{n.title}</span>{!n.read && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent-500)' }} aria-label="Chưa đọc" />}</div>
                <div className="small muted">{n.body}</div>
                <div className="tiny faint" style={{ marginTop: 2 }}>{timeAgo(n.createdAt)}</div>
              </div>
            </>
          );
          return n.ticketId && ticketLink
            ? <Link key={n.id} to={ticketLink(n.ticketId)} className="list-item" onClick={() => open(n)}>{content}</Link>
            : <div key={n.id} className="list-item" onClick={() => open(n)} role="presentation">{content}</div>;
        })}
      </Card>
    </>
  );
}
