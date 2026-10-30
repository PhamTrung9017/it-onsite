import { Send } from 'lucide-react';
import { useAuth } from '../context/AppContext.jsx';
import { useAction, useLoad } from '../hooks/useApi.js';
import { api } from '../services/api.js';
import { Badge, Button, Card } from './ui.jsx';

/** UC17: gắn tài khoản với Telegram để nhận thông báo ngay trên điện thoại. */
export function TelegramCard() {
  const { user } = useAuth();
  const { busy, run } = useAction();
  const { data } = useLoad(() => api.getCatalog(), []);
  if (!api.linkTelegram || !data?.features?.telegram) return null;
  async function connect() {
    const link = await run('telegram', () => api.linkTelegram());
    if (link?.url) window.open(link.url, '_blank', 'noopener');
  }
  return (
    <Card title="Thông báo qua Telegram" action={user.telegramLinked && <Badge tone="success">Đã kết nối</Badge>}>
      <div className="stack-sm">
        <p className="small muted">Nhận cập nhật trạng thái phiếu, báo giá và lịch hẹn qua Telegram.</p>
        <div>
          <Button variant="outline" icon={Send} loading={busy === 'telegram'} onClick={connect}>
            {user.telegramLinked ? 'Kết nối lại' : 'Kết nối Telegram'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
