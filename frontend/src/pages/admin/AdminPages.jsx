import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, ShieldCheck } from 'lucide-react';
import { useAction, useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { ROLE_LABEL, useAuth } from '../../context/AppContext.jsx';
import { Alert, Badge, Button, Card, ErrorState, Field, Loading, Modal, Money, PageHead, Stars } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';

function useAdmin() {
  return useLoad(() => api.adminData(), []);
}

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 42, height: 24, borderRadius: 999, border: 0, padding: 2, background: on ? 'var(--brand-600)' : 'var(--line)', cursor: 'pointer', transition: 'background .15s' }}>
      <span style={{ display: 'block', width: 20, height: 20, borderRadius: '50%', background: '#fff', transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform .15s', boxShadow: 'var(--shadow-sm)' }} />
    </button>
  );
}

function MultiChips({ options, value, onChange }) {
  return (
    <div className="chip-select">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value.includes(o.value)} onClick={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])}>{o.label}</button>
      ))}
    </div>
  );
}

/* ---------------- UC18 Kỹ thuật viên ---------------- */
export function TechniciansPage() {
  const { data, loading, error, reload } = useAdmin();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const catName = (c) => data.categories.find((x) => x.code === c)?.name;
  async function save(t = edit) {
    if (await run('save', () => api.saveTechnician(t), t.id ? 'Đã cập nhật kỹ thuật viên.' : 'Đã thêm kỹ thuật viên. Mật khẩu tạm đã gửi qua email.')) { setEdit(null); reload(true); }
  }
  return (
    <>
      <PageHead title="Kỹ thuật viên" sub="Kỹ năng và khu vực phụ trách dùng để gợi ý phân công" actions={<Button icon={Plus} onClick={() => setEdit({ name: '', email: '', phone: '', skills: [], areas: [], active: true })}>Thêm kỹ thuật viên</Button>} />
      <Card bodyClass="table-wrap">
        <table className="table">
          <thead><tr><th>Kỹ thuật viên</th><th>Kỹ năng</th><th>Khu vực</th><th>Đánh giá</th><th className="right">Đang làm / Đã xong</th><th>Hoạt động</th><th /></tr></thead>
          <tbody>
            {data.technicians.map((t) => (
              <tr key={t.id}>
                <td><div className="strong">{t.name}</div><div className="tiny muted">{t.phone}</div></td>
                <td className="small" style={{ maxWidth: 260 }}>{t.skills.map(catName).join(', ')}</td>
                <td className="small" style={{ maxWidth: 220 }}>{t.areas.join(', ')}</td>
                <td><span className="row-sm small"><Stars value={t.rating} size={13} />{t.rating}</span></td>
                <td className="right">{t.activeJobs} / {t.done}</td>
                <td><Toggle on={t.active} label={`Hoạt động: ${t.name}`} onChange={(v) => save({ ...t, active: v })} /></td>
                <td className="right"><Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit({ ...t })}>Sửa</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal wide open={Boolean(edit)} title={edit?.id ? `Sửa ${edit.name}` : 'Thêm kỹ thuật viên'} onClose={() => setEdit(null)}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Đóng</Button><Button icon={Save} loading={busy === 'save'} onClick={() => save()}>Lưu</Button></>}>
        {edit && (
          <>
            <div className="grid-3">
              <Field label="Họ và tên" htmlFor="tn"><input id="tn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Email" htmlFor="te"><input id="te" className="input" value={edit.email} disabled={Boolean(edit.id)} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
              <Field label="Số điện thoại" htmlFor="tp"><input id="tp" className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            </div>
            <Field label="Kỹ năng"><MultiChips options={data.categories.map((c) => ({ value: c.code, label: c.name }))} value={edit.skills} onChange={(skills) => setEdit({ ...edit, skills })} /></Field>
            <Field label="Khu vực phụ trách"><MultiChips options={data.allAreas.map((a) => ({ value: a, label: a }))} value={edit.areas} onChange={(areas) => setEdit({ ...edit, areas })} /></Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------------- UC19 Dịch vụ và bảng giá, UC20 Linh kiện ---------------- */
function CatalogPage({ kind }) {
  const { data, loading, error, reload } = useAdmin();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const isSvc = kind === 'service';
  const rows = isSvc ? data.services : data.parts;
  const saveFn = isSvc ? api.saveService : api.savePart;
  async function save(x = edit) {
    const payload = { ...x, price: Number(x.price), warrantyDays: Number(x.warrantyDays), ...(isSvc ? { durationMin: Number(x.durationMin) } : { stock: Number(x.stock) }) };
    if (await run('save', () => saveFn(payload), 'Đã lưu.')) { setEdit(null); reload(true); }
  }
  const blank = isSvc ? { name: '', categoryCode: data.categories[0].code, price: 0, durationMin: 60, warrantyDays: 7, active: true } : { name: '', price: 0, stock: 0, warrantyDays: 0, active: true };
  return (
    <>
      <PageHead title={isSvc ? 'Dịch vụ và bảng giá' : 'Linh kiện'} sub={isSvc ? 'Đơn giá trên báo giá được cố định khi lập; đổi giá ở đây không ảnh hưởng phiếu đang xử lý' : 'Tồn kho tự trừ khi khách duyệt báo giá có linh kiện'}
        actions={<Button icon={Plus} onClick={() => setEdit(blank)}>{isSvc ? 'Thêm dịch vụ' : 'Thêm linh kiện'}</Button>} />
      <Card bodyClass="table-wrap">
        <table className="table">
          <thead><tr><th>Tên</th>{isSvc && <th>Loại sự cố</th>}{isSvc ? <th className="right">Thời lượng</th> : <th className="right">Tồn kho</th>}<th className="right">Bảo hành</th><th className="right">Đơn giá</th><th>Đang bán</th><th /></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} style={x.active ? undefined : { opacity: 0.55 }}>
                <td className="strong">{x.name}</td>
                {isSvc && <td className="small muted">{data.categories.find((c) => c.code === x.categoryCode)?.name}</td>}
                <td className="right">{isSvc ? `${x.durationMin} phút` : x.stock <= 2 ? <Badge tone={x.stock ? 'warning' : 'danger'} plain>{x.stock}</Badge> : x.stock}</td>
                <td className="right">{x.warrantyDays ? `${x.warrantyDays} ngày` : '—'}</td>
                <td className="right"><Money value={x.price} /></td>
                <td><Toggle on={x.active} label={`Đang bán: ${x.name}`} onChange={(v) => save({ ...x, active: v })} /></td>
                <td className="right"><Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit({ ...x })}>Sửa</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={Boolean(edit)} title={edit?.id ? 'Sửa' : 'Thêm mới'} onClose={() => setEdit(null)}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Đóng</Button><Button icon={Save} loading={busy === 'save'} onClick={() => save()}>Lưu</Button></>}>
        {edit && (
          <>
            <Field label="Tên" htmlFor="cn"><input id="cn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            {isSvc && <Field label="Loại sự cố" htmlFor="cc"><select id="cc" className="select" value={edit.categoryCode} onChange={(e) => setEdit({ ...edit, categoryCode: e.target.value })}>{data.categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>}
            <div className="grid-3">
              <Field label="Đơn giá (đồng)" htmlFor="cp"><input id="cp" type="number" min="0" step="1000" className="input" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
              {isSvc
                ? <Field label="Thời lượng (phút)" htmlFor="cd"><input id="cd" type="number" min="1" className="input" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: e.target.value })} /></Field>
                : <Field label="Tồn kho" htmlFor="cs"><input id="cs" type="number" min="0" className="input" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></Field>}
              <Field label="Bảo hành (ngày)" htmlFor="cw"><input id="cw" type="number" min="0" className="input" value={edit.warrantyDays} onChange={(e) => setEdit({ ...edit, warrantyDays: e.target.value })} /></Field>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
export const ServicesPage = () => <CatalogPage kind="service" />;
export const PartsPage = () => <CatalogPage kind="part" />;

/* ---------------- UC22 Tài khoản và phân quyền ---------------- */
const ROLES = ['KHACH', 'KTV', 'DPV', 'QTV'];
export function AccountsPage() {
  const { data, loading, error, reload } = useAdmin();
  const { user: me } = useAuth();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState(null);
  const [create, setCreate] = useState(null);
  const [filter, setFilter] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const users = data.users.filter((u) => !filter || u.roles.includes(filter));
  return (
    <>
      <PageHead title="Tài khoản và phân quyền" sub="Một tài khoản có thể giữ nhiều vai trò"
        actions={<>
          <select className="select" style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc vai trò"><option value="">Tất cả vai trò</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
          <Button icon={Plus} onClick={() => setCreate({ name: '', email: '', phone: '', roles: ['DPV'] })}>Tạo tài khoản nội bộ</Button>
        </>} />
      <Card bodyClass="table-wrap">
        <table className="table">
          <thead><tr><th>Người dùng</th><th>Liên hệ</th><th>Vai trò</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="strong">{u.name}{u.id === me.id && <span className="tiny muted"> (bạn)</span>}</td>
                <td className="small"><div>{u.email}</div><div className="muted">{u.phone}</div></td>
                <td><div className="row-sm wrap">{u.roles.map((r) => <Badge key={r} tone={r === 'QTV' ? 'accent' : r === 'KHACH' ? 'muted' : 'primary'} plain>{ROLE_LABEL[r]}</Badge>)}</div></td>
                <td>{u.locked ? <Badge tone="danger">Đã khóa</Badge> : <Badge tone="success">Hoạt động</Badge>}</td>
                <td className="right"><Button variant="ghost" size="sm" icon={ShieldCheck} onClick={() => setEdit({ ...u })}>Phân quyền</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={Boolean(edit)} title={`Phân quyền: ${edit?.name || ''}`} onClose={() => setEdit(null)}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Đóng</Button><Button loading={busy === 'roles'} onClick={async () => { if (await run('roles', () => api.saveUserRoles(edit.id, { roles: edit.roles, locked: edit.locked }), 'Đã cập nhật phân quyền.')) { setEdit(null); reload(true); } }}>Lưu</Button></>}>
        {edit && (
          <>
            <Field label="Vai trò"><MultiChips options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={edit.roles} onChange={(roles) => setEdit({ ...edit, roles })} /></Field>
            <div className="row-between"><span className="label">Khóa tài khoản</span><Toggle on={edit.locked} label="Khóa tài khoản" onChange={(locked) => setEdit({ ...edit, locked })} /></div>
            {edit.locked && <Alert tone="warning">Tài khoản bị khóa sẽ không đăng nhập được.</Alert>}
          </>
        )}
      </Modal>
      <Modal open={Boolean(create)} title="Tạo tài khoản nội bộ" onClose={() => setCreate(null)}
        footer={<><Button variant="outline" onClick={() => setCreate(null)}>Đóng</Button><Button loading={busy === 'create'} onClick={async () => { if (await run('create', () => api.createInternalUser(create), 'Đã tạo tài khoản. Mật khẩu tạm đã gửi qua email.')) { setCreate(null); reload(true); } }}>Tạo</Button></>}>
        {create && (
          <>
            <Field label="Họ và tên" htmlFor="un"><input id="un" className="input" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Email" htmlFor="ue"><input id="ue" className="input" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} /></Field>
              <Field label="Số điện thoại" htmlFor="up"><input id="up" className="input" value={create.phone} onChange={(e) => setCreate({ ...create, phone: e.target.value })} /></Field>
            </div>
            <Field label="Vai trò"><MultiChips options={ROLES.filter((r) => r !== 'KHACH').map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={create.roles} onChange={(roles) => setCreate({ ...create, roles })} /></Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------------- UC23 Cấu hình tham số ---------------- */
export function ConfigPage() {
  const { data, loading, error, reload } = useAdmin();
  const { busy, run } = useAction();
  const [cfg, setCfg] = useState(null);
  useEffect(() => { if (data) setCfg(structuredClone(data.config)); }, [data]);
  if (loading || !cfg) return error ? <ErrorState error={error} onRetry={reload} /> : <Loading />;
  const num = (k, label, hint, step = 1) => (
    <Field label={label} htmlFor={k} hint={hint}><input id={k} type="number" min="0" step={step} className="input" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></Field>
  );
  return (
    <>
      <PageHead title="Cấu hình tham số nghiệp vụ" sub="Thay đổi có hiệu lực ngay với các phiếu tạo sau đó" actions={<Button icon={Save} loading={busy === 'cfg'} onClick={async () => { if (await run('cfg', () => api.saveConfig(cfg), 'Đã lưu cấu hình.')) reload(true); }}>Lưu cấu hình</Button>} />
      <div className="stack">
        <Card title="Phí và thời hạn">
          <div className="grid-3">
            {num('surveyFee', 'Phí khảo sát (đồng)', 'Chỉ thu khi khách từ chối báo giá (BR-02)', 1000)}
            {num('freeCancelHours', 'Hủy, đổi lịch miễn phí trước (giờ)', 'BR-03')}
            {num('techResponseMinutes', 'Thời hạn KTV phản hồi (phút)', 'Quá hạn tự thu hồi phân công (BR-06)')}
            {num('travelBufferMinutes', 'Thời gian đệm di chuyển (phút)', 'Dùng khi kiểm tra trùng lịch (BR-04)')}
            {num('reviewWindowDays', 'Thời hạn đánh giá (ngày)', 'BR-10')}
          </div>
        </Card>
        <Card title="Giờ phục vụ và khu vực">
          <div className="stack">
            <div className="grid-3">
              <Field label="Bắt đầu" htmlFor="hs"><input id="hs" type="time" className="input" value={cfg.serviceHours.start} onChange={(e) => setCfg({ ...cfg, serviceHours: { ...cfg.serviceHours, start: e.target.value } })} /></Field>
              <Field label="Kết thúc" htmlFor="he"><input id="he" type="time" className="input" value={cfg.serviceHours.end} onChange={(e) => setCfg({ ...cfg, serviceHours: { ...cfg.serviceHours, end: e.target.value } })} /></Field>
            </div>
            <Field label={`Phường đang phục vụ (${cfg.areas.length})`}><MultiChips options={data.allAreas.map((a) => ({ value: a, label: a }))} value={cfg.areas} onChange={(areas) => setCfg({ ...cfg, areas })} /></Field>
          </div>
        </Card>
        <Card title="Tài khoản nhận chuyển khoản (VietQR)">
          <div className="grid-2">
            <Field label="Tên ngân hàng" htmlFor="bn"><input id="bn" className="input" value={cfg.bank.name} onChange={(e) => setCfg({ ...cfg, bank: { ...cfg.bank, name: e.target.value } })} /></Field>
            <Field label="Mã BIN ngân hàng" htmlFor="bb" hint="6 chữ số theo danh sách ngân hàng của NAPAS"><input id="bb" className="input mono" value={cfg.bank.bin} onChange={(e) => setCfg({ ...cfg, bank: { ...cfg.bank, bin: e.target.value } })} /></Field>
            <Field label="Số tài khoản" htmlFor="ba"><input id="ba" className="input mono" value={cfg.bank.accountNumber} onChange={(e) => setCfg({ ...cfg, bank: { ...cfg.bank, accountNumber: e.target.value } })} /></Field>
            <Field label="Chủ tài khoản" htmlFor="bh"><input id="bh" className="input" value={cfg.bank.accountName} onChange={(e) => setCfg({ ...cfg, bank: { ...cfg.bank, accountName: e.target.value.toUpperCase() } })} /></Field>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------------- Nhật ký hệ thống (NFR-08) ---------------- */
export function AuditPage() {
  const { data, loading, error, reload } = useAdmin();
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <>
      <PageHead title="Nhật ký hệ thống" sub="Thay đổi trạng thái phiếu, báo giá, thanh toán, bảng giá và phân quyền" />
      <Card bodyClass="table-wrap">
        {data.audit.length === 0 ? <div className="card-body small muted">Chưa có thao tác nào được ghi lại trong phiên dùng thử này.</div> : (
          <table className="table">
            <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
            <tbody>{data.audit.map((a, i) => <tr key={i}><td className="small nowrap">{formatDateTime(a.at)}</td><td className="small">{a.userName}</td><td><Badge tone="muted" plain>{a.action}</Badge></td><td className="mono small">{a.target}</td><td className="small muted">{a.detail}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
