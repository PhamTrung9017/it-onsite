import { useState } from 'react';
import { Download } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Button, Card, ErrorState, Loading, PageHead, Segmented, Stars, StatusBadge } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';
import { downloadReport } from '../../lib/reportExport.js';

function Delta({ cur, prev, inverse, unit = '%' }) {
  if (!prev) return <div className="d faint">Chưa có kỳ trước để so sánh</div>;
  const pct = ((cur - prev) / prev) * 100;
  const good = inverse ? pct < 0 : pct > 0;
  return <div className={`d ${good ? 'up' : 'down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}{unit} so với kỳ trước</div>;
}

const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));

export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const { data: r, loading, error, reload } = useLoad(() => api.report({ days }), [days]);
  const { busy, run } = useAction();
  const exportExcel = () => run('excel', async () => downloadReport({ report: r, rows: await api.reportTickets({ days }), days }), 'Đã tải file Excel báo cáo.');
  return (
    <>
      <PageHead title="Báo cáo thống kê" sub={`Số liệu ${days} ngày gần nhất`}
        actions={<>
          <Segmented label="Khoảng thời gian" value={days} onChange={setDays} options={[{ value: 7, label: '7 ngày' }, { value: 30, label: '30 ngày' }]} />
          <Button variant="outline" icon={Download} disabled={!r || loading} loading={busy === 'excel'} onClick={exportExcel}>Xuất Excel</Button>
        </>} />
      {loading && <Loading rows={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {r && !loading && (
        <div className="stack">
          <div className="grid-4">
            <Card className="stat" bodyClass=""><div className="k">Doanh thu</div><div className="v">{money(r.revenue)}</div><Delta cur={r.revenue} prev={r.revenuePrev} /></Card>
            <Card className="stat" bodyClass=""><div className="k">Phiếu hoàn tất</div><div className="v">{r.done}</div><Delta cur={r.done} prev={r.donePrev} /></Card>
            <Card className="stat" bodyClass=""><div className="k">Thời gian xử lý trung bình</div><div className="v">{r.avgHours.toFixed(1).replace('.', ',')} giờ</div><Delta cur={r.avgHours} prev={r.avgHoursPrev} inverse /></Card>
            <Card className="stat" bodyClass=""><div className="k">Đánh giá trung bình</div><div className="v">{r.rating ? r.rating.toFixed(1).replace('.', ',') : '—'}</div><div className="d faint">{r.reviewCount} lượt đánh giá · {r.cancelled}/{r.total} phiếu hủy</div></Card>
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
              <div className="tiny muted" style={{ marginTop: 8 }}>Cao nhất: {short(Math.max(...r.byDay.map((d) => d.revenue)))} · tính theo ngày phiếu hoàn tất</div>
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
