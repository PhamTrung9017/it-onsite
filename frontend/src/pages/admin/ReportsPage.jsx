import { useState } from 'react';
import { Download, FilterX } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Button, Card, ErrorState, Field, Loading, PageHead, Segmented, Stars, StatusBadge } from '../../components/ui.jsx';
import { formatDate, money, toDateInput } from '../../lib/format.js';
import { downloadReport } from '../../lib/reportExport.js';

function Delta({ cur, prev, inverse, unit = '%' }) {
  if (!prev) return <div className="d faint">Chưa có kỳ trước để so sánh</div>;
  const pct = ((cur - prev) / prev) * 100;
  const good = inverse ? pct < 0 : pct > 0;
  return <div className={`d ${good ? 'up' : 'down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}{unit} so với kỳ trước</div>;
}

const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

const thisMonth = () => toDateInput(new Date()).slice(0, 7);
const decimal = (v) => v.toFixed(1).replace('.', ',');
const hoursText = (v) => (v === null || v === undefined ? '—' : `${decimal(v)} giờ`);

function periodText(r, mode) {
  if (!r?.period) return '';
  const from = new Date(r.period.from);
  const last = new Date(new Date(r.period.to).getTime() - 1);
  const range = `${formatDate(from)} – ${formatDate(last)}`;
  if (mode === 'month') return `Tháng ${from.getMonth() + 1}/${from.getFullYear()} · ${range}`;
  if (mode === 'range') return `Từ ${range.replace(' – ', ' đến ')}`;
  return `${mode} ngày gần nhất · ${range}`;
}

export default function ReportsPage() {
  const today = toDateInput(new Date());
  const [mode, setMode] = useState(30);
  const [month, setMonth] = useState(thisMonth);
  const [range, setRange] = useState({ from: `${thisMonth()}-01`, to: today });
  const [filter, setFilter] = useState({ techId: '', category: '', ward: '' });
  const rangeOk = range.from && range.to && range.from <= range.to;
  const period = { ...(mode === 'month' ? { month } : mode === 'range' ? (rangeOk ? range : {}) : { days: mode }), ...filter };
  const { data: options } = useLoad(async () => {
    const [catalog, admin] = await Promise.all([api.getCatalog(), api.adminData()]);
    return { categories: catalog.categories, areas: catalog.config.areas, technicians: admin.technicians };
  }, []);
  const { data: r, loading, error, reload } = useLoad(
    () => (mode === 'range' && !rangeOk ? Promise.resolve(null) : api.report(period)),
    [mode, month, range.from, range.to, filter.techId, filter.category, filter.ward],
  );
  const { busy, run } = useAction();
  const exportExcel = () => run('excel', async () => downloadReport({ report: r, data: await api.reportExport(period), options }), 'Đã tải file Excel báo cáo.');
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  const filtered = Object.values(filter).some(Boolean);
  return (
    <>
      <PageHead title="Báo cáo thống kê" sub={periodText(r, mode)}
        actions={<>
          <Segmented label="Kỳ báo cáo" value={mode} onChange={setMode}
            options={[{ value: 7, label: '7 ngày' }, { value: 30, label: '30 ngày' }, { value: 'month', label: 'Theo tháng' }, { value: 'range', label: 'Tùy chọn' }]} />
          {mode === 'month' && <input type="month" className="input" style={{ width: 160 }} aria-label="Tháng báo cáo" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
          {mode === 'range' && (
            <span className="row-sm">
              <input type="date" className="input" style={{ width: 160 }} aria-label="Từ ngày" value={range.from} max={today} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <span className="muted">–</span>
              <input type="date" className="input" style={{ width: 160 }} aria-label="Đến ngày" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </span>
          )}
          <Button variant="outline" icon={Download} disabled={!r || loading} loading={busy === 'excel'} onClick={exportExcel}>Xuất Excel</Button>
        </>} />
      <Card>
        <div className="grid-4" style={{ alignItems: 'end' }}>
          <Field label="Kỹ thuật viên" htmlFor="ft">
            <select id="ft" className="select" value={filter.techId} onChange={setF('techId')}>
              <option value="">Tất cả</option>{options?.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Loại sự cố" htmlFor="fc">
            <select id="fc" className="select" value={filter.category} onChange={setF('category')}>
              <option value="">Tất cả</option>{options?.categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Phường" htmlFor="fw">
            <select id="fw" className="select" value={filter.ward} onChange={setF('ward')}>
              <option value="">Tất cả</option>{options?.areas.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <div><Button variant="outline" icon={FilterX} disabled={!filtered} onClick={() => setFilter({ techId: '', category: '', ward: '' })}>Bỏ lọc</Button></div>
        </div>
      </Card>
      {mode === 'range' && !rangeOk && <p className="small muted" style={{ marginTop: 16 }}>Chọn ngày bắt đầu không sau ngày kết thúc.</p>}
      {loading && <Loading rows={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {r && !loading && (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="grid-3">
            <Card className="stat" bodyClass=""><div className="k">Doanh thu</div><div className="v">{money(r.revenue)}</div><Delta cur={r.revenue} prev={r.revenuePrev} />
              {r.forfeitedDeposits > 0 && <div className="d faint">Gồm {money(r.forfeitedDeposits)} phí giữ lịch không hoàn</div>}</Card>
            <Card className="stat" bodyClass=""><div className="k">Phiếu hoàn tất</div><div className="v">{r.done}</div><Delta cur={r.done} prev={r.donePrev} /></Card>
            <Card className="stat" bodyClass=""><div className="k">Tỷ lệ hoàn tất</div><div className="v">{r.completionRate === null ? '—' : `${decimal(r.completionRate)}%`}</div><div className="d faint">Trên {r.total} phiếu tạo trong kỳ · {r.cancelled} phiếu hủy</div></Card>
            <Card className="stat" bodyClass=""><div className="k">Thời gian xử lý trung bình</div><div className="v">{hoursText(r.avgHours)}</div><Delta cur={r.avgHours} prev={r.avgHoursPrev} inverse /></Card>
            <Card className="stat" bodyClass=""><div className="k">Thời gian tại nhà khách</div><div className="v">{hoursText(r.onsiteHours)}</div>
              {r.onsiteHours !== null && r.onsiteHoursPrev ? <Delta cur={r.onsiteHours} prev={r.onsiteHoursPrev} inverse /> : <div className="d faint">Từ check-in tới khi báo hoàn thành</div>}</Card>
            <Card className="stat" bodyClass=""><div className="k">Đánh giá trung bình</div><div className="v">{r.rating ? decimal(r.rating) : '—'}</div><div className="d faint">{r.reviewCount} lượt đánh giá</div></Card>
          </div>
          <div className="split split-380">
            <Card title="Doanh thu theo ngày">
              {(() => {
                const max = Math.max(...r.byDay.map((d) => d.revenue), 1);
                const every = r.byDay.length > 10 ? Math.ceil(r.byDay.length / 10) : 1;
                return (
                  <div className="chart-bars" role="img" aria-label="Biểu đồ doanh thu theo ngày">
                    {r.byDay.map((d, i) => {
                      const dt = new Date(d.date);
                      return (
                        <div className="col" key={d.date} title={`${dt.getDate()}/${dt.getMonth() + 1}: ${money(d.revenue)}`}>
                          <div className="b" style={{ height: `${(d.revenue / max) * 100}%` }} />
                          <span className="l">{i % every === 0 ? `${dt.getDate()}/${dt.getMonth() + 1}` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="tiny muted" style={{ marginTop: 8 }}>Cao nhất: {short(Math.max(0, ...r.byDay.map((d) => d.revenue)))} · tính theo ngày phiếu hoàn tất</div>
            </Card>
            <Card title="Loại sự cố">
              <div className="stack-sm">
                {r.byCategory.map((c) => (
                  <div key={c.name} className="bar-row">
                    <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.count / r.byCategory[0].count) * 100}%` }} /></div>
                    <span className="small strong right">{c.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div className="grid-2">
            <Card title="Kỹ thuật viên" bodyClass="table-wrap">
              <table className="table">
                <thead><tr><th>Kỹ thuật viên</th><th className="right">Hoàn tất</th><th className="right">Doanh thu</th><th>Đánh giá</th></tr></thead>
                <tbody>{r.byTech.map((t) => <tr key={t.name}><td className="strong">{t.name}</td><td className="right">{t.done}</td><td className="right price">{money(t.revenue)}</td><td>{t.rating ? <span className="row-sm"><Stars value={t.rating} size={13} />{t.rating.toFixed(1)}</span> : '—'}</td></tr>)}</tbody>
              </table>
            </Card>
            <Card title="Phiếu theo trạng thái">
              <div className="stack-sm">
                {r.byStatus.map((s) => <div key={s.status} className="row-between"><StatusBadge status={s.status} /><span className="strong">{s.count}</span></div>)}
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
