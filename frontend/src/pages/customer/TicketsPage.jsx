import { useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { useLoad, usePaged } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { ButtonLink, Card, Empty, ErrorState, LoadMore, Loading, PageHead, Segmented } from '../../components/ui.jsx';
import { TicketRow } from '../../components/ticket.jsx';
import { STATUS } from '../../lib/ticketStatus.js';

const ACTION_NEEDED = [STATUS.CHO_DUYET_BAO_GIA, STATUS.CHO_NGHIEM_THU, STATUS.CHO_THANH_TOAN];
const GROUPS = { active: 'open', done: 'done', cancel: 'cancelled' };

export default function TicketsPage() {
  const [tab, setTab] = useState('active');
  const summary = useLoad(async () => {
    const [open, done, cancelled] = await Promise.all([
      api.listMyTickets({ group: 'open', limit: 100 }),
      api.listMyTickets({ group: 'done', limit: 1 }),
      api.listMyTickets({ group: 'cancelled', limit: 1 }),
    ]);
    return { open: open.items, counts: { active: open.total, done: done.total, cancel: cancelled.total } };
  }, []);
  const list = usePaged((paging) => api.listMyTickets({ group: GROUPS[tab], ...paging }), [tab]);
  if (summary.loading) return <Loading />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;
  const { open, counts } = summary.data;
  const needAction = open.filter((t) => ACTION_NEEDED.includes(t.status) && !(t.status === STATUS.CHO_THANH_TOAN && t.payment?.status === 'CHO_XAC_NHAN'));
  return (
    <>
      <PageHead title="Phiếu của tôi" sub="Theo dõi tất cả yêu cầu hỗ trợ của bạn" actions={<ButtonLink to="/khach/tao-yeu-cau" variant="accent" icon={Plus}>Đặt lịch mới</ButtonLink>} />
      <div className="stack">
        {needAction.length > 0 && (
          <Card title={`Cần bạn xử lý (${needAction.length})`} bodyClass="list">
            {needAction.map((t) => <TicketRow key={t.id} ticket={t} to={`/khach/phieu/${t.id}`} />)}
          </Card>
        )}
        <Segmented label="Lọc phiếu" value={tab} onChange={setTab} options={[
          { value: 'active', label: 'Đang xử lý', count: counts.active },
          { value: 'done', label: 'Hoàn tất', count: counts.done },
          { value: 'cancel', label: 'Đã hủy', count: counts.cancel },
        ]} />
        {list.loading ? <Loading rows={3} /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
          <Card bodyClass="list">
            {list.items.length === 0
              ? <Empty icon={ClipboardList} title="Chưa có phiếu nào" action={tab === 'active' && <ButtonLink to="/khach/tao-yeu-cau" icon={Plus}>Đặt lịch hỗ trợ</ButtonLink>}>Các yêu cầu bạn tạo sẽ hiển thị ở đây.</Empty>
              : list.items.map((t) => <TicketRow key={t.id} ticket={t} to={`/khach/phieu/${t.id}`} />)}
            <LoadMore shown={list.items.length} total={list.total} loading={list.more} onClick={list.loadMore} />
          </Card>
        )}
      </div>
    </>
  );
}
