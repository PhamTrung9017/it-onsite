import { useState } from 'react';
import { Download, KeyRound, Laptop, Monitor, Plus, Printer, Save, Trash2, UserX } from 'lucide-react';
import { useAuth, useToast } from '../../context/AppContext.jsx';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Alert, Button, Card, Empty, ErrorState, Field, Loading, Modal, PageHead } from '../../components/ui.jsx';

const ICON = { Laptop, PC: Monitor, 'Thiết bị khác': Printer };

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();
  const { data, loading, error, reload } = useLoad(async () => {
    const [devices, catalog] = await Promise.all([api.listDevices(), api.getCatalog()]);
    return { devices, areas: catalog.config.areas };
  }, []);
  const [form, setForm] = useState({ name: user.name, phone: user.phone, address: user.address, ward: user.ward });
  const [dev, setDev] = useState(null);
  const [pw, setPw] = useState(null);
  const [del, setDel] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function saveProfile() {
    const u = await run('profile', () => api.updateProfile(form), 'Đã lưu hồ sơ.');
    if (u) setUser(u);
  }
  async function exportData() {
    const d = await run('export', () => api.exportMyData());
    if (!d) return;
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `du-lieu-ca-nhan-${user.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Đã tải dữ liệu cá nhân của bạn.');
  }

  return (
    <>
      <PageHead title="Hồ sơ" sub={user.email} />
      <div className="split">
        <div className="stack">
          <Card title="Thông tin liên hệ" footer={<Button icon={Save} loading={busy === 'profile'} onClick={saveProfile}>Lưu thay đổi</Button>}>
            <div className="stack">
              <div className="grid-2">
                <Field label="Họ và tên" htmlFor="pn"><input id="pn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Số điện thoại" htmlFor="pp"><input id="pp" className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              </div>
              <div className="grid-2">
                <Field label="Số nhà, tên đường" htmlFor="pa"><input id="pa" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                <Field label="Phường" htmlFor="pw"><select id="pw" className="select" value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })}><option value="">Chọn phường</option>{data.areas.map((a) => <option key={a}>{a}</option>)}</select></Field>
              </div>
            </div>
          </Card>
          <Card title="Thiết bị của tôi" action={<Button variant="outline" size="sm" icon={Plus} onClick={() => setDev({ type: 'Laptop', brand: '', model: '' })}>Thêm thiết bị</Button>} bodyClass="list">
            {data.devices.length === 0 ? <Empty icon={Laptop} title="Chưa có thiết bị">Thêm thiết bị để theo dõi lịch sử sửa chữa và bảo hành.</Empty> : data.devices.map((d) => {
              const I = ICON[d.type] || Laptop;
              return (
                <div key={d.id} className="list-item">
                  <div className="list-icon"><I aria-hidden /></div>
                  <div className="grow"><div className="strong">{d.brand} {d.model}</div><div className="tiny muted">{d.type} · {d.repairCount} lần sửa chữa · {d.activeWarranties} bảo hành còn hiệu lực</div></div>
                  <button type="button" className="icon-btn" aria-label={`Xóa ${d.model}`} onClick={async () => { if (await run(`rm-${d.id}`, () => api.removeDevice(d.id), 'Đã xóa thiết bị.')) reload(true); }}><Trash2 size={18} /></button>
                </div>
              );
            })}
          </Card>
        </div>
        <div className="stack">
          <Card title="Bảo mật">
            <Button variant="outline" block icon={KeyRound} onClick={() => setPw({ current: '', next: '' })}>Đổi mật khẩu</Button>
          </Card>
          <Card title="Dữ liệu cá nhân">
            <div className="stack">
              <p className="small muted">Theo Luật Bảo vệ dữ liệu cá nhân, bạn có quyền xem, tải về và yêu cầu xóa dữ liệu của mình.</p>
              <Button variant="outline" block icon={Download} loading={busy === 'export'} onClick={exportData}>Tải dữ liệu của tôi</Button>
              <Button variant="danger" block icon={UserX} onClick={() => setDel({ reason: '' })}>Yêu cầu xóa dữ liệu</Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={Boolean(dev)} title="Thêm thiết bị" onClose={() => setDev(null)}
        footer={<><Button variant="outline" onClick={() => setDev(null)}>Đóng</Button><Button loading={busy === 'dev'} onClick={async () => { if (await run('dev', () => api.addDevice(dev), 'Đã thêm thiết bị.')) { setDev(null); reload(true); } }}>Thêm</Button></>}>
        {dev && (
          <>
            <Field label="Loại thiết bị" htmlFor="dt"><select id="dt" className="select" value={dev.type} onChange={(e) => setDev({ ...dev, type: e.target.value })}>{Object.keys(ICON).map((k) => <option key={k}>{k}</option>)}</select></Field>
            <div className="grid-2">
              <Field label="Hãng" htmlFor="db"><input id="db" className="input" value={dev.brand} onChange={(e) => setDev({ ...dev, brand: e.target.value })} /></Field>
              <Field label="Dòng máy" htmlFor="dm"><input id="dm" className="input" value={dev.model} onChange={(e) => setDev({ ...dev, model: e.target.value })} /></Field>
            </div>
          </>
        )}
      </Modal>
      <Modal open={Boolean(pw)} title="Đổi mật khẩu" onClose={() => setPw(null)}
        footer={<><Button variant="outline" onClick={() => setPw(null)}>Đóng</Button><Button loading={busy === 'pw'} onClick={async () => { if (await run('pw', () => api.changePassword(pw), 'Đã đổi mật khẩu.')) setPw(null); }}>Đổi mật khẩu</Button></>}>
        {pw && (
          <>
            <Field label="Mật khẩu hiện tại" htmlFor="c1"><input id="c1" type="password" className="input" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="Mật khẩu mới" htmlFor="c2" hint="Ít nhất 8 ký tự"><input id="c2" type="password" className="input" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          </>
        )}
      </Modal>
      <Modal open={Boolean(del)} title="Yêu cầu xóa dữ liệu cá nhân" onClose={() => setDel(null)}
        footer={<><Button variant="outline" onClick={() => setDel(null)}>Đóng</Button><Button variant="danger-solid" loading={busy === 'del'} onClick={async () => { if (await run('del', () => api.requestDataDeletion(del), 'Đã gửi yêu cầu. Quản trị viên sẽ xử lý và phản hồi qua email.')) setDel(null); }}>Gửi yêu cầu</Button></>}>
        <Alert tone="warning">Sau khi xóa, bạn không thể xem lại lịch sử sửa chữa và bảo hành.</Alert>
        {del && <Field label="Lý do (không bắt buộc)" htmlFor="dr"><textarea id="dr" className="textarea" style={{ minHeight: 80 }} value={del.reason} onChange={(e) => setDel({ reason: e.target.value })} /></Field>}
      </Modal>
    </>
  );
}
