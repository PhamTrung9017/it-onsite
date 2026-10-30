import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, MapPin, RefreshCw, Search, Star, UserCheck, XCircle } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { useNotifications } from '../../context/AppContext.jsx';
import { api } from '../../services/api.js';
import { Alert, Badge, Button, Card, Empty, ErrorState, Field, Loading, Modal, PageHead, StatusBadge } from '../../components/ui.jsx';
import { AiResult, TicketTimeline } from '../../components/ticket.jsx';
import { BUSY_STATUSES, STATUS } from '../../lib/ticketStatus.js';
import { URGENCY_LABEL } from '../../lib/classifier.js';
import { combineDateTime, formatDateTime, formatTime, relativeDay, timeAgo, timeSlots, toDateInput } from '../../lib/format.js';

const COLUMNS = [
  { key: 'new', title: 'Phiếu mới', match: (t) => t.status === STATUS.MOI },
  { key: 'wait', title: 'Chờ phân công', match: (t) => t.status === STATUS.DA_TIEP_NHAN },
  { key: 'doing', title: 'Đang xử lý', match: (t) => BUSY_STATUSES.includes(t.status) },
  { key: 'end', title: 'Thanh toán, kết thúc', match: (t) => [STATUS.CHO_THANH_TOAN, STATUS.HOAN_TAT, STATUS.DA_HUY].includes(t.status) },
];
const URG_ORDER = { CAO: 0, TRUNG_BINH: 1, THAP: 2 };

function TicketCard({ t, selected, onSelect }) {
  const at = t.assignment?.appointmentAt || t.slotStart;
  return (
    <button type="button" className="ticket-card" aria-pressed={selected} onClick={() => onSelect(t.id)}>
      <div className="row-between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <span className="t">{t.category?.name}</span>
        {t.urgency === 'CAO' && <Badge tone="danger" plain>Khẩn</Badge>}
      </div>
      <div className="m"><span className="mono">{t.id.slice(-12)}</span>·<span>{t.ward}</span></div>
      <div className="m"><CalendarClock size={13} aria-hidden />{relativeDay(at)} {formatTime(at)}</div>
      {t.technician && t.status !== STATUS.MOI && t.status !== STATUS.DA_TIEP_NHAN && <div className="m"><UserCheck size={13} aria-hidden />{t.technician.name}</div>}
      {t.status === STATUS.MOI && t.aiResult?.state === 'low_confidence' && <Badge tone="warning" plain>AI chưa chắc chắn</Badge>}
      {t.status === STATUS.DA_PHAN_CONG && !t.assignment?.result && <Badge tone="accent" plain>Chờ KTV phản hồi</Badge>}
      {![STATUS.MOI, STATUS.DA_TIEP_NHAN].includes(t.status) && <StatusBadge status={t.status} />}
    </button>
  );
}

export default function BoardPage() {
  const { refresh } = useNotifications();
  const { data, loading, error, reload } = useLoad(async () => {
    const [tickets, catalog] = await Promise.all([api.listBoard(), api.getCatalog()]);
    return { tickets, catalog };
  }, []);
  const { busy, run } = useAction();
  const [selectedId, setSelectedId] = useState(null);
  const detailRef = useRef(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [urg, setUrg] = useState('TRUNG_BINH');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [suggest, setSuggest] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const tickets = useMemo(() => {
    if (!data) return [];
    const k = q.trim().toLowerCase();
    return data.tickets
      .filter((t) => !k || [t.id, t.customer?.name, t.ward, t.category?.name].some((v) => v?.toLowerCase().includes(k)))
      .sort((a, b) => URG_ORDER[a.urgency] - URG_ORDER[b.urgency] || a.createdAt.localeCompare(b.createdAt));
  }, [data, q]);
  const sel = tickets.find((t) => t.id === selectedId) || data?.tickets.find((t) => t.id === selectedId);
  const slots = useMemo(() => (data ? timeSlots(data.catalog.config.serviceHours.start, data.catalog.config.serviceHours.end) : []), [data]);

  useEffect(() => {
    if (!sel) return;
    setCat(sel.categoryCode);
    setUrg(sel.urgency);
    const at = new Date(sel.slotStart);
    setDate(toDateInput(at));
    setTime(formatTime(at));
    setSuggest(null);
  }, [sel?.id, sel?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const appointmentAt = combineDateTime(date, time);
  useEffect(() => {
    if (!sel || sel.status !== STATUS.DA_TIEP_NHAN || !appointmentAt) return;
    let alive = true;
    setSuggest(null);
    api.suggestTechnicians(sel.id, { appointmentAt }).then((r) => alive && setSuggest(r)).catch(() => alive && setSuggest([]));
    return () => { alive = false; };
  }, [sel?.id, sel?.status, appointmentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function act(key, fn, msg) {
    const r = await run(key, fn, msg);
    if (r) { refresh(); await reload(true); }
    if (r === null) reload(true);
    return r;
  }

  function pick(id) {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 960px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, tickets.filter(c.match).length]));
  const categories = data.catalog.categories;

  return (
    <>
      <PageHead title="Bảng điều phối" sub={`${counts.new} phiếu mới · ${counts.wait} chờ phân công · ${counts.doing} đang xử lý`}
        actions={<>
          <div className="input-group board-search"><Search aria-hidden /><input className="input" placeholder="Tìm mã phiếu, khách, phường" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm phiếu" /></div>
          <Button variant="outline" icon={RefreshCw} onClick={() => reload()}>Làm mới</Button>
        </>} />
      <div className="stack">
        <div className="board">
          {COLUMNS.map((c) => (
            <section key={c.key} className="board-col" aria-label={c.title}>
              <h3><span>{c.title}</span><span>{counts[c.key]}</span></h3>
              {tickets.filter(c.match).map((t) => <TicketCard key={t.id} t={t} selected={t.id === selectedId} onSelect={pick} />)}
              {counts[c.key] === 0 && <p className="tiny faint center" style={{ padding: 12 }}>Không có phiếu</p>}
            </section>
          ))}
        </div>

        {!sel ? (
          <Card className="desktop-only"><Empty icon={UserCheck} title="Chọn một phiếu để xử lý">Tiếp nhận phiếu mới, xác nhận loại sự cố và phân công kỹ thuật viên.</Empty></Card>
        ) : (
          <div className="split" ref={detailRef} style={{ scrollMarginTop: 72 }}>
            <div className="stack">
              <Card title={<span className="row-sm">{sel.category?.name}<span className="mono small muted">{sel.id}</span></span>} action={<StatusBadge status={sel.status} />}>
                <div className="stack">
                  <p>{sel.description}</p>
                  <dl className="kv">
                    <dt>Khách hàng</dt><dd>{sel.customer?.name} · {sel.customer?.phone}</dd>
                    <dt>Thiết bị</dt><dd>{sel.device?.type} · {sel.device?.brand} {sel.device?.model}</dd>
                    <dt>Địa chỉ</dt><dd className="row-sm"><MapPin size={14} aria-hidden />{sel.address}, phường {sel.ward}</dd>
                    <dt>Khách muốn</dt><dd>{formatDateTime(sel.slotStart)}</dd>
                    <dt>Tạo lúc</dt><dd>{formatDateTime(sel.createdAt)} ({timeAgo(sel.createdAt)})</dd>
                  </dl>
                </div>
              </Card>

              {sel.status === STATUS.MOI && (
                <Card title="1. Tiếp nhận và xác nhận loại sự cố">
                  <div className="stack">
                    <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 12 }}><span className="section-title">Gợi ý tự động</span><div style={{ marginTop: 8 }}><AiResult ai={sel.aiResult} categories={categories} /></div></div>
                    <div className="grid-2">
                      <Field label="Loại sự cố" htmlFor="bc"><select id="bc" className="select" value={cat} onChange={(e) => setCat(e.target.value)}>{categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
                      <Field label="Mức khẩn" htmlFor="bu"><select id="bu" className="select" value={urg} onChange={(e) => setUrg(e.target.value)}>{Object.entries(URGENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                    </div>
                    <div className="row wrap">
                      <Button icon={Check} loading={busy === 'recv'} onClick={() => act('recv', () => api.receiveTicket(sel.id, { categoryCode: cat, urgency: urg, version: sel.version }), 'Đã tiếp nhận phiếu.')}>Tiếp nhận</Button>
                      <Button variant="danger" icon={XCircle} onClick={() => setCancelOpen(true)}>Hủy phiếu</Button>
                    </div>
                  </div>
                </Card>
              )}

              {sel.status === STATUS.DA_TIEP_NHAN && (
                <Card title="2. Phân công kỹ thuật viên">
                  <div className="stack">
                    {sel.history.at(-1)?.note && sel.history.at(-1).status === STATUS.DA_TIEP_NHAN && sel.history.length > 2 && <Alert tone="warning" icon={AlertTriangle}>{sel.history.at(-1).note}</Alert>}
                    <div className="grid-2">
                      <Field label="Ngày hẹn" htmlFor="ad"><input id="ad" type="date" className="input" min={toDateInput(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                      <Field label="Giờ hẹn" htmlFor="at"><select id="at" className="select" value={time} onChange={(e) => setTime(e.target.value)}>{[...new Set([time, ...slots])].filter(Boolean).sort().map((s) => <option key={s}>{s}</option>)}</select></Field>
                    </div>
                    <span className="section-title">Kỹ thuật viên gợi ý · đúng kỹ năng → đúng khu vực → ít việc → đánh giá cao</span>
                    {!suggest ? <div className="skeleton" style={{ height: 120 }} /> : suggest.length === 0 ? <p className="small muted">Không có kỹ thuật viên đang hoạt động.</p> : (
                      <div className="stack-sm">
                        {suggest.map((s, i) => (
                          <div key={s.tech.id} className="row" style={{ padding: '12px 14px', border: `1px solid ${i === 0 && !s.conflict ? 'var(--brand-200)' : 'var(--line)'}`, borderRadius: 12, opacity: s.conflict ? 0.6 : 1, background: i === 0 && !s.conflict ? 'var(--brand-50)' : 'var(--surface)' }}>
                            <div className="grow">
                              <div className="row-sm wrap"><span className="strong">{s.tech.name}</span>{i === 0 && !s.conflict && <Badge tone="success" plain>Phù hợp nhất</Badge>}</div>
                              <div className="row-sm wrap tiny" style={{ marginTop: 4 }}>
                                <Badge tone={s.skill ? 'success' : 'muted'} plain>{s.skill ? 'Đúng kỹ năng' : 'Khác kỹ năng'}</Badge>
                                <Badge tone={s.area ? 'success' : 'muted'} plain>{s.area ? 'Đúng khu vực' : 'Ngoài khu vực'}</Badge>
                                <Badge tone="muted" plain>{s.jobsToday} việc trong ngày</Badge>
                                <Badge tone="muted" plain><Star size={12} aria-hidden />{s.tech.rating}</Badge>
                                {s.conflict && <Badge tone="danger" plain>Trùng lịch</Badge>}
                              </div>
                            </div>
                            <Button size="sm" disabled={s.conflict} loading={busy === `as-${s.tech.id}`}
                              onClick={() => act(`as-${s.tech.id}`, () => api.assignTechnician(sel.id, { techId: s.tech.id, appointmentAt, version: sel.version }), `Đã phân công ${s.tech.name}.`)}>Phân công</Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div><Button variant="danger" size="sm" icon={XCircle} onClick={() => setCancelOpen(true)}>Hủy phiếu</Button></div>
                  </div>
                </Card>
              )}
              {sel.status === STATUS.DA_PHAN_CONG && !sel.assignment?.result && (
                <Alert title={`Đang chờ ${sel.technician?.name} phản hồi`}>Hạn phản hồi {formatTime(sel.assignment.deadline)}. Quá hạn, hệ thống tự thu hồi và đưa phiếu về cột Chờ phân công.</Alert>
              )}
            </div>
            <Card title="Tiến trình"><TicketTimeline ticket={sel} /></Card>
          </div>
        )}
      </div>
      <Modal open={cancelOpen} title={`Hủy phiếu ${sel?.id || ''}`} onClose={() => setCancelOpen(false)}
        footer={<><Button variant="outline" onClick={() => setCancelOpen(false)}>Đóng</Button><Button variant="danger-solid" loading={busy === 'cancel'} onClick={async () => { if (await act('cancel', () => api.cancelTicket(sel.id, { reason }), 'Đã hủy phiếu.')) { setCancelOpen(false); setReason(''); } }}>Hủy phiếu</Button></>}>
        <Field label="Lý do (gửi cho khách)" htmlFor="cr"><textarea id="cr" className="textarea" style={{ minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: ngoài khu vực phục vụ, khách yêu cầu hủy qua điện thoại" /></Field>
      </Modal>
    </>
  );
}
