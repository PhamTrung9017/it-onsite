import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, Boxes, CalendarCheck, ClipboardList, Cog, CreditCard, FileClock, Home, LogOut, Menu, PlusCircle,
  RotateCcw, ShieldCheck, Tags, User, UserCog, Users, Wrench, LayoutGrid, Repeat,
} from 'lucide-react';
import { ROLE_HOME, ROLE_LABEL, useAuth, useNotifications, useToast } from '../context/AppContext.jsx';
import { api, usingMockApi } from '../services/api.js';
import { initials } from '../lib/format.js';
import { Loading } from './ui.jsx';

export function BrandLogo({ to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label="IT OnSite – trang chủ">
      <span className="brand-mark"><Wrench aria-hidden /></span>
      IT OnSite
    </Link>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function UserMenu() {
  const { user, role, setActiveRole, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  async function reset() {
    setOpen(false);
    await api.resetDemoData();
    toast.success('Đã khôi phục dữ liệu mẫu.');
    window.location.reload();
  }
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" className="user-chip" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="n">{user.name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div style={{ padding: '8px 12px 10px' }}>
            <div className="strong">{user.name}</div>
            <div className="tiny muted">{user.email} · {ROLE_LABEL[role]}</div>
          </div>
          {user.roles.length > 1 && (
            <>
              <div className="sep" />
              <div className="mh">Chuyển vai trò</div>
              {user.roles.filter((r) => r !== role).map((r) => (
                <button key={r} type="button" className="mi" role="menuitem" onClick={() => { setActiveRole(r); setOpen(false); navigate(ROLE_HOME[r]); }}>
                  <Repeat aria-hidden />{ROLE_LABEL[r]}
                </button>
              ))}
            </>
          )}
          <div className="sep" />
          {usingMockApi && <button type="button" className="mi" role="menuitem" onClick={reset}><RotateCcw aria-hidden />Khôi phục dữ liệu mẫu</button>}
          <button type="button" className="mi" role="menuitem" onClick={async () => { await logout(); navigate('/'); }}><LogOut aria-hidden />Đăng xuất</button>
        </div>
      )}
    </div>
  );
}

function BellLink({ to }) {
  const { unread } = useNotifications();
  return (
    <Link to={to} className="icon-btn" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}>
      <Bell aria-hidden />
      {unread > 0 && <span className="dot-badge">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

/* ---------------- Trang công khai ---------------- */

export function PublicLayout() {
  const { user, role } = useAuth();
  return (
    <>
      <ScrollTop />
      <header className="topbar">
        <div className="container topbar-inner">
          <BrandLogo />
          <nav className="topnav" aria-label="Điều hướng chính">
            <NavLink to="/" end>Trang chủ</NavLink>
            <NavLink to="/bang-gia">Bảng giá</NavLink>
            <a href="/#quy-trinh">Quy trình</a>
          </nav>
          <div className="topbar-actions">
            {user ? (
              <Link to={ROLE_HOME[role]} className="btn btn-primary btn-sm">Vào trang của tôi</Link>
            ) : (
              <>
                <Link to="/dang-nhap" className="btn btn-ghost btn-sm">Đăng nhập</Link>
                <Link to="/khach/tao-yeu-cau" className="btn btn-accent btn-sm">Đặt lịch</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <Outlet />
      <footer className="footer">
        <div className="container footer-inner">
          <div className="stack-sm" style={{ maxWidth: 320 }}>
            <BrandLogo />
            <p>Dịch vụ cài đặt phần mềm, sửa chữa và bảo trì máy tính tận nơi tại TP. Hồ Chí Minh.</p>
          </div>
          <div className="stack-sm">
            <strong style={{ color: 'var(--ink)' }}>Dịch vụ</strong>
            <Link to="/bang-gia">Bảng giá</Link>
            <Link to="/khach/tao-yeu-cau">Đặt lịch hỗ trợ</Link>
            <Link to="/khach/bao-hanh">Tra cứu bảo hành</Link>
          </div>
          <div className="stack-sm">
            <strong style={{ color: 'var(--ink)' }}>Tài khoản</strong>
            <Link to="/dang-nhap">Đăng nhập</Link>
            <Link to="/dang-ky">Đăng ký</Link>
          </div>
        </div>
        <div className="container tiny faint" style={{ marginTop: 24 }}>© {new Date().getFullYear()} IT OnSite · Đồ án thực tế Công nghệ phần mềm – Trường ĐH Giao thông vận tải TP.HCM</div>
      </footer>
    </>
  );
}

/* ---------------- Bảo vệ tuyến theo vai trò ---------------- */

export function RequireRole({ role: needed }) {
  const { user, ready, role, setActiveRole } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (user && user.roles.includes(needed) && role !== needed) setActiveRole(needed);
  }, [user, needed, role, setActiveRole]);
  if (!ready) return <div className="container app-main"><Loading /></div>;
  if (!user) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;
  if (!user.roles.includes(needed)) return <Navigate to={ROLE_HOME[user.roles[0]]} replace />;
  return <Outlet />;
}

/* ---------------- Khách hàng, kỹ thuật viên: điện thoại trước ---------------- */

const NAV = {
  KHACH: [
    { to: '/khach/phieu', label: 'Phiếu của tôi', short: 'Phiếu', icon: ClipboardList },
    { to: '/khach/tao-yeu-cau', label: 'Đặt lịch', short: 'Đặt lịch', icon: PlusCircle },
    { to: '/khach/bao-hanh', label: 'Bảo hành', short: 'Bảo hành', icon: ShieldCheck },
    { to: '/khach/ho-so', label: 'Hồ sơ', short: 'Hồ sơ', icon: User },
  ],
  KTV: [
    { to: '/ktv/lich-viec', label: 'Lịch việc', short: 'Lịch việc', icon: CalendarCheck },
    { to: '/ktv/thong-bao', label: 'Thông báo', short: 'Thông báo', icon: Bell, badge: true },
    { to: '/ktv/ho-so', label: 'Hồ sơ', short: 'Hồ sơ', icon: User },
  ],
};

export function MobileAppLayout({ role }) {
  const items = NAV[role];
  const { unread } = useNotifications();
  const base = role === 'KHACH' ? '/khach' : '/ktv';
  return (
    <>
      <ScrollTop />
      <header className="topbar">
        <div className="container topbar-inner">
          <BrandLogo to={role === 'KHACH' ? '/' : base + '/lich-viec'} />
          <nav className="topnav" aria-label="Điều hướng">
            {items.map(({ to, label, icon: I }) => <NavLink key={to} to={to}><I aria-hidden />{label}</NavLink>)}
          </nav>
          <div className="topbar-actions">
            <BellLink to={`${base}/thong-bao`} />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="app-main has-bottomnav">
        <div className="container"><Outlet /></div>
      </main>
      <nav className="bottomnav" aria-label="Điều hướng nhanh">
        {items.map(({ to, short, icon: I, badge }) => (
          <NavLink key={to} to={to}><I aria-hidden />{short}{badge && unread > 0 && <span className="dot-badge">{unread}</span>}</NavLink>
        ))}
      </nav>
    </>
  );
}

/* ---------------- Điều phối, quản trị: thanh bên ---------------- */

const SIDE = {
  DPV: [
    { to: '/dieu-phoi', end: true, label: 'Bảng điều phối', icon: LayoutGrid },
    { to: '/dieu-phoi/thanh-toan', label: 'Đối soát thanh toán', icon: CreditCard },
    { to: '/dieu-phoi/bao-hanh', label: 'Xử lý bảo hành', icon: ShieldCheck },
    { to: '/dieu-phoi/thong-bao', label: 'Thông báo', icon: Bell },
  ],
  QTV: [
    { to: '/quan-tri/bao-cao', label: 'Báo cáo thống kê', icon: BarChart3 },
    { to: '/quan-tri/ky-thuat-vien', label: 'Kỹ thuật viên', icon: Users },
    { to: '/quan-tri/dich-vu', label: 'Dịch vụ và bảng giá', icon: Tags },
    { to: '/quan-tri/linh-kien', label: 'Linh kiện', icon: Boxes },
    { to: '/quan-tri/tai-khoan', label: 'Tài khoản và phân quyền', icon: UserCog },
    { to: '/quan-tri/cau-hinh', label: 'Cấu hình tham số', icon: Cog },
    { to: '/quan-tri/nhat-ky', label: 'Nhật ký hệ thống', icon: FileClock },
    { to: '/quan-tri/thong-bao', label: 'Thông báo', icon: Bell },
  ],
};

export function ShellLayout({ role }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { unread } = useNotifications();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="shell">
      <ScrollTop />
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Điều hướng">
        <BrandLogo to={SIDE[role][0].to} />
        <div className="side-section">{ROLE_LABEL[role]}</div>
        <nav className="sidenav">
          {SIDE[role].map(({ to, label, icon: I, end }) => (
            <NavLink key={to} to={to} end={end}>
              <I aria-hidden />{label}
              {to.endsWith('thong-bao') && unread > 0 && <span className="count">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link to="/" className="row-sm small muted" style={{ padding: '8px 12px' }}><Home size={17} aria-hidden />Trang công khai</Link>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
      <div className="shell-main">
        <div className="shell-top">
          <button type="button" className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu /></button>
          <div className="grow" />
          <BellLink to={role === 'DPV' ? '/dieu-phoi/thong-bao' : '/quan-tri/thong-bao'} />
          <UserMenu />
        </div>
        <main className="shell-content"><Outlet /></main>
      </div>
    </div>
  );
}
