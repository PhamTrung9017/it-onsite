import { useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { ButtonLink, Card, Empty, ErrorState, Loading, PageHead, Segmented } from '../../components/ui.jsx';
import { TicketRow } from '../../components/ticket.jsx';
import { STATUS } from '../../lib/ticketStatus.js';

const ACTION_NEEDED = [STATUS.CHO_DUYET_BAO_GIA, STATUS.CHO_NGHIEM_THU, STATUS.CHO_THANH_TOAN];

export default function TicketsPage() {
  const { data, loading, error, reload } = useLoad(() => api.listMyTickets(), []);
  const [tab, setTab] = useState('active');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const groups = {
    active: data.filter((t) => ![STATUS.HOAN_TAT, STATUS.DA_HUY].includes(t.status)),
    done: data.filter((t) => t.status === STATUS.HOAN_TAT),
    cancel: data.filter((t) => t.status === STATUS.DA_HUY),
  };
  const needAction = data.filter((t) => ACTION_NEEDED.includes(t.status) && !(t.status === STATUS.CHO_THANH_TOAN && t.payment?.status === 'CHO_XAC_NHAN'));
  const list = groups[tab];
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
          { value: 'active', label: 'Đang xử lý', count: groups.active.length },
          { value: 'done', label: 'Hoàn tất', count: groups.done.length },
          { value: 'cancel', label: 'Đã hủy', count: groups.cancel.length },
        ]} />
        <Card bodyClass="list">
          {list.length === 0
            ? <Empty icon={ClipboardList} title="Chưa có phiếu nào" action={tab === 'active' && <ButtonLink to="/khach/tao-yeu-cau" icon={Plus}>Đặt lịch hỗ trợ</ButtonLink>}>Các yêu cầu bạn tạo sẽ hiển thị ở đây.</Empty>
            : list.map((t) => <TicketRow key={t.id} ticket={t} to={`/khach/phieu/${t.id}`} />)}
        </Card>
      </div>
    </>
  );
}
