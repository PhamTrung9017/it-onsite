import { MapPin, Wrench } from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Badge, Card, ErrorState, Loading, PageHead, Stars } from '../../components/ui.jsx';
import { formatDate, initials, money } from '../../lib/format.js';

export default function TechProfilePage() {
  const { data, loading, error, reload } = useLoad(() => api.myTechProfile(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { user, tech, categories, stats, reviews } = data;
  return (
    <>
      <PageHead title="Hồ sơ kỹ thuật viên" />
      <div className="stack">
        <Card>
          <div className="row wrap">
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>{initials(user.name)}</span>
            <div className="grow">
              <h2>{user.name}</h2>
              <div className="row-sm small muted"><Stars value={tech.rating} size={14} />{tech.rating} · {tech.ratingCount} đánh giá</div>
              <div className="small muted">{user.email} · {user.phone}</div>
            </div>
            <Badge tone={tech.active ? 'success' : 'muted'}>{tech.active ? 'Đang hoạt động' : 'Tạm ngưng'}</Badge>
          </div>
        </Card>
        <div className="grid-3">
          <Card className="stat"><div className="k">Hoàn tất tháng này</div><div className="v">{stats.doneMonth}</div></Card>
          <Card className="stat"><div className="k">Doanh thu tháng này</div><div className="v" style={{ fontSize: 22 }}>{money(stats.revenueMonth)}</div></Card>
          <Card className="stat"><div className="k">Tổng việc đã hoàn tất</div><div className="v">{stats.doneTotal}</div></Card>
        </div>
        <div className="grid-2">
          <Card title="Kỹ năng"><div className="chip-select">{tech.skills.map((s) => <span key={s} className="badge tone-primary plain"><Wrench size={13} aria-hidden />{categories.find((c) => c.code === s)?.name}</span>)}</div></Card>
          <Card title="Khu vực phụ trách"><div className="chip-select">{tech.areas.map((a) => <span key={a} className="badge tone-info plain"><MapPin size={13} aria-hidden />{a}</span>)}</div></Card>
        </div>
        <Card title="Đánh giá gần đây" bodyClass="list">
          {reviews.length === 0 ? <div className="card-body small muted">Chưa có đánh giá.</div> : reviews.map((r) => (
            <div key={r.ticketId} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row-between"><Stars value={r.stars} size={14} /><span className="tiny muted">{formatDate(r.at)}</span></div>
                {r.comment && <p className="small" style={{ marginTop: 4 }}>{r.comment}</p>}
                <div className="tiny muted">{r.customer} · <span className="mono">{r.ticketId}</span></div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
