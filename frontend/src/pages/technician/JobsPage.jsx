import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Hourglass, MapPin } from 'lucide-react';
import { useLoad, useNow } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Card, Empty, ErrorState, Loading, PageHead, Segmented, StatusBadge } from '../../components/ui.jsx';
import { formatTime, relativeDay } from '../../lib/format.js';
import { STATUS } from '../../lib/ticketStatus.js';

function Countdown({ deadline, assignedAt }) {
  const now = useNow();
  const left = Math.max(0, new Date(deadline).getTime() - now);
  const total = new Date(deadline).getTime() - new Date(assignedAt).getTime();
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <div>
      <div className="row-sm small" style={{ color: 'var(--accent-600)' }}><Hourglass size={15} aria-hidden />Còn <span className="countdown">{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span> để phản hồi</div>
      <div className="deadline-bar"><span style={{ width: `${(left / total) * 100}%` }} /></div>
    </div>
  );
}

export function JobCard({ job }) {
  const at = job.assignment.appointmentAt;
  const pending = job.status === STATUS.DA_PHAN_CONG && !job.assignment.result;
  return (
    <Link to={`/ktv/viec/${job.id}`} className="card card-link job" style={pending ? { borderColor: 'var(--accent-500)' } : undefined}>
      <div>
        <div className="time">{formatTime(at)}</div>
        <div className="day">{relativeDay(at)}</div>
      </div>
      <div className="stack-sm" style={{ gap: 6, minWidth: 0 }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <h3>{job.category?.name}</h3>
          <StatusBadge status={job.status} />
        </div>
        <div className="small">{job.customer?.name} · {job.device?.brand} {job.device?.model}</div>
        <div className="addr"><MapPin aria-hidden />{job.address}, phường {job.ward}</div>
        {pending && <Countdown deadline={job.assignment.deadline} assignedAt={job.assignment.assignedAt} />}
      </div>
    </Link>
  );
}

export default function JobsPage() {
  const { data, loading, error, reload } = useLoad(() => api.listMyJobs(), []);
  const [tab, setTab] = useState('today');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const today = new Date().toDateString();
  const open = data.filter((j) => ![STATUS.HOAN_TAT, STATUS.DA_HUY].includes(j.status));
  const groups = {
    today: open.filter((j) => new Date(j.assignment.appointmentAt).toDateString() === today || new Date(j.assignment.appointmentAt) < new Date()),
    later: open.filter((j) => new Date(j.assignment.appointmentAt).toDateString() !== today && new Date(j.assignment.appointmentAt) > new Date()),
    done: data.filter((j) => j.status === STATUS.HOAN_TAT),
  };
  const pending = open.filter((j) => j.status === STATUS.DA_PHAN_CONG && !j.assignment.result).length;
  return (
    <>
      <PageHead title="Lịch việc" sub={pending ? `${pending} việc mới chờ bạn nhận` : `${groups.today.length} việc hôm nay`} />
      <div className="stack">
        <Segmented label="Lọc lịch việc" value={tab} onChange={setTab} options={[
          { value: 'today', label: 'Hôm nay', count: groups.today.length },
          { value: 'later', label: 'Sắp tới', count: groups.later.length },
          { value: 'done', label: 'Đã xong', count: groups.done.length },
        ]} />
        {groups[tab].length === 0
          ? <Card><Empty icon={CalendarCheck} title="Không có việc">Việc được điều phối viên phân công sẽ hiện ở đây.</Empty></Card>
          : <div className="grid-2">{groups[tab].map((j) => <JobCard key={j.id} job={j} />)}</div>}
      </div>
    </>
  );
}
