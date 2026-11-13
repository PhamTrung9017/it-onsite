import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Hash, KeyRound, Lock, Mail, Phone, Search, User } from 'lucide-react';
import { ROLE_HOME, ROLE_LABEL, useAuth } from '../../context/AppContext.jsx';
import { api, usingMockApi } from '../../services/api.js';
import { Alert, Button, Field } from '../../components/ui.jsx';
import { BrandLogo } from '../../components/layouts.jsx';

const SHOW_DEMO_ACCOUNTS = usingMockApi || import.meta.env.VITE_DEMO_ACCOUNTS === 'true';

const DEMO = [
  { role: 'KHACH', email: 'khach@demo.vn' },
  { role: 'KTV', email: 'ktv@demo.vn' },
  { role: 'DPV', email: 'dpv@demo.vn' },
  { role: 'QTV', email: 'qtv@demo.vn' },
];

function AuthShell({ children }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <BrandLogo />
        <div>
          <h2>Quản lý trọn vòng đời mỗi yêu cầu hỗ trợ IT</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {['Đặt lịch và theo dõi tiến độ theo thời gian thực', 'Báo giá minh bạch, duyệt trước khi làm', 'Bảo hành điện tử theo từng hạng mục', 'Điều phối kỹ thuật viên theo kỹ năng và khu vực'].map((t) => (
              <li key={t}><CheckCircle2 aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
        <p className="small" style={{ opacity: 0.7 }}>© {new Date().getFullYear()} IT OnSite</p>
      </aside>
      <main className="auth-main"><div className="auth-card stack-lg">{children}</div></main>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.identifier, form.password);
      navigate(location.state?.from || ROLE_HOME[u.roles[0]], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div className="mobile-only"><BrandLogo /></div>
      <div>
        <h1>Đăng nhập</h1>
        <p className="muted" style={{ marginTop: 6 }}>Chưa có tài khoản? <Link to="/dang-ky" className="strong">Đăng ký</Link></p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email hoặc số điện thoại" htmlFor="id">
          <div className="input-group"><Mail aria-hidden /><input id="id" className="input" autoComplete="username" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} required /></div>
        </Field>
        <Field label="Mật khẩu" htmlFor="pw">
          <div className="input-group"><Lock aria-hidden /><input id="pw" type="password" className="input" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
        </Field>
        <div className="row-between"><span /><Link to="/quen-mat-khau" className="small strong">Quên mật khẩu?</Link></div>
        <Button type="submit" size="lg" block loading={busy}>Đăng nhập</Button>
      </form>
      <div className="row wrap small" style={{ justifyContent: 'center', gap: 16 }}>
        <Link to="/dat-lich" className="strong">Đặt lịch nhanh không cần tài khoản</Link>
        <Link to="/tra-cuu" className="strong">Tra cứu đơn</Link>
      </div>
      {SHOW_DEMO_ACCOUNTS && <div className="stack-sm">
        <div className="section-title">Tài khoản dùng thử · mật khẩu 123456</div>
        <div className="demo-accounts">
          {DEMO.map((d) => (
            <button key={d.role} type="button" onClick={() => setForm({ identifier: d.email, password: '123456' })}>
              <div className="r">{ROLE_LABEL[d.role]}</div><div className="e">{d.email}</div>
            </button>
          ))}
        </div>
      </div>}
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  // Khách đặt nhanh tạo tài khoản bằng số điện thoại đã đặt: các đơn đã đặt chuyển vào tài khoản
  const guest = user?.guestTicket ? user : null;
  const [form, setForm] = useState({ name: guest?.name || '', email: guest?.email || '', phone: guest?.phone || '', password: '', consent: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      navigate(guest ? '/khach/phieu' : '/khach/tao-yeu-cau', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div>
        <h1>Tạo tài khoản</h1>
        <p className="muted" style={{ marginTop: 6 }}>Đã có tài khoản? <Link to="/dang-nhap" className="strong">Đăng nhập</Link></p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        {guest && <Alert tone="info">Đăng ký bằng số điện thoại {guest.phone} để lưu đơn {guest.guestTicket} và các đơn đã đặt nhanh vào tài khoản.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Họ và tên" htmlFor="n"><div className="input-group"><User aria-hidden /><input id="n" className="input" autoComplete="name" value={form.name} onChange={set('name')} /></div></Field>
        <Field label="Số điện thoại" htmlFor="p" hint="Dùng để đăng nhập và để kỹ thuật viên liên hệ"><div className="input-group"><Phone aria-hidden /><input id="p" inputMode="tel" className="input" autoComplete="tel" value={form.phone} onChange={set('phone')} /></div></Field>
        <Field label="Email (không bắt buộc)" htmlFor="e" hint="Nhận thông báo, biên nhận và đặt lại mật khẩu qua email"><div className="input-group"><Mail aria-hidden /><input id="e" type="email" className="input" autoComplete="email" value={form.email} onChange={set('email')} /></div></Field>
        <Field label="Mật khẩu" htmlFor="pw" hint="Ít nhất 8 ký tự"><div className="input-group"><Lock aria-hidden /><input id="pw" type="password" className="input" autoComplete="new-password" value={form.password} onChange={set('password')} /></div></Field>
        <label className="check"><input type="checkbox" checked={form.consent} onChange={set('consent')} /><span>Tôi đồng ý với điều khoản dịch vụ và cho phép IT OnSite xử lý dữ liệu cá nhân để thực hiện yêu cầu hỗ trợ theo Luật Bảo vệ dữ liệu cá nhân.</span></label>
        <Button type="submit" size="lg" block loading={busy}>Tạo tài khoản</Button>
      </form>
    </AuthShell>
  );
}

/** Tra cứu đơn bằng mã đơn và số điện thoại; tra cứu được thì làm tiếp các bước của khách trên đơn đó. */
export function LookupPage() {
  const { startGuest } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ ticketId: params.get('ma') || '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!form.ticketId.trim() || !form.phone.trim()) {
      setError('Vui lòng nhập mã đơn và số điện thoại.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { user, ticketId } = await api.lookupTicket({ ticketId: form.ticketId.trim(), phone: form.phone.trim() });
      startGuest(user);
      navigate(`/khach/phieu/${ticketId}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div className="mobile-only"><BrandLogo /></div>
      <div>
        <h1>Tra cứu đơn</h1>
        <p className="muted" style={{ marginTop: 6 }}>Nhập mã đơn và số điện thoại đã dùng khi đặt lịch để xem tiến độ, duyệt báo giá, thanh toán và yêu cầu bảo hành.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Mã đơn" htmlFor="ma" hint="Ví dụ: YC-20261113-001"><div className="input-group"><Hash aria-hidden /><input id="ma" className="input" autoComplete="off" value={form.ticketId} onChange={(e) => setForm({ ...form, ticketId: e.target.value })} /></div></Field>
        <Field label="Số điện thoại" htmlFor="sdt"><div className="input-group"><Phone aria-hidden /><input id="sdt" className="input" type="tel" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></Field>
        <Button type="submit" size="lg" block icon={Search} loading={busy}>Tra cứu</Button>
      </form>
      <div className="row wrap small" style={{ justifyContent: 'center', gap: 16 }}>
        <Link to="/dat-lich" className="strong">Đặt lịch nhanh</Link>
        <Link to="/dang-nhap" className="strong">Đăng nhập</Link>
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.requestPasswordReset({ email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div>
        <h1>Quên mật khẩu</h1>
        <p className="muted" style={{ marginTop: 6 }}>Nhập email đã đăng ký, chúng tôi sẽ gửi đường dẫn đặt lại mật khẩu. Tài khoản chưa có email, vui lòng gọi cửa hàng để được hỗ trợ.</p>
      </div>
      {sent ? (
        <Alert tone="success" title="Đã gửi yêu cầu" icon={KeyRound}>Nếu email này đã đăng ký, bạn sẽ nhận được đường dẫn đặt lại mật khẩu trong vài phút.</Alert>
      ) : (
        <form className="stack" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" htmlFor="e"><div className="input-group"><Mail aria-hidden /><input id="e" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></Field>
          <Button type="submit" size="lg" block loading={busy}>Gửi đường dẫn</Button>
        </form>
      )}
      <Link to="/dang-nhap" className="small strong">← Quay lại đăng nhập</Link>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <div>
        <h1>Đặt mật khẩu mới</h1>
        <p className="muted" style={{ marginTop: 6 }}>Mật khẩu cần ít nhất 8 ký tự.</p>
      </div>
      {done ? (
        <Alert tone="success" title="Đã đặt mật khẩu mới" icon={KeyRound}>Bạn có thể đăng nhập bằng mật khẩu vừa đặt.</Alert>
      ) : !token ? (
        <Alert tone="danger">Đường dẫn đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu lại.</Alert>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Mật khẩu mới" htmlFor="np"><div className="input-group"><Lock aria-hidden /><input id="np" type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div></Field>
          <Field label="Nhập lại mật khẩu" htmlFor="cp"><div className="input-group"><Lock aria-hidden /><input id="cp" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div></Field>
          <Button type="submit" size="lg" block loading={busy}>Lưu mật khẩu</Button>
        </form>
      )}
      <Link to="/dang-nhap" className="small strong">← Quay lại đăng nhập</Link>
    </AuthShell>
  );
}

export function NotFoundPage() {
  return (
    <div className="container app-main">
      <div className="card card-body center stack" style={{ maxWidth: 480, margin: '40px auto', alignItems: 'center' }}>
        <h1>Không tìm thấy trang</h1>
        <p className="muted">Đường dẫn không tồn tại hoặc đã thay đổi.</p>
        <Link to="/" className="btn btn-primary">Về trang chủ</Link>
      </div>
    </div>
  );
}
