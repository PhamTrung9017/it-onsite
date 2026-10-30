import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { api } from '../services/api.js';
import { SESSION_EXPIRED_EVENT } from '../services/http/httpApi.js';

/* ---------------- Thông báo nổi ---------------- */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs.slice(-3), { id, message, type }]);
    setTimeout(() => remove(id), type === 'error' ? 6000 : 4000);
  }, [remove]);
  const value = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  }), [push]);
  const Icon = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
              <I aria-hidden />
              <span>{t.message}</span>
              <button type="button" onClick={() => remove(t.id)} aria-label="Đóng"><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------------- Phiên đăng nhập ---------------- */

const AuthContext = createContext(null);
const ROLE_KEY = 'itonsite.activeRole';

export const ROLE_LABEL = { KHACH: 'Khách hàng', KTV: 'Kỹ thuật viên', DPV: 'Điều phối viên', QTV: 'Quản trị viên' };
export const ROLE_HOME = { KHACH: '/khach/phieu', KTV: '/ktv/lich-viec', DPV: '/dieu-phoi', QTV: '/quan-tri/bao-cao' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [activeRole, setActiveRoleState] = useState(() => localStorage.getItem(ROLE_KEY));

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
    const expired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);

  const setActiveRole = useCallback((role) => {
    localStorage.setItem(ROLE_KEY, role);
    setActiveRoleState(role);
  }, []);

  const role = user && (user.roles.includes(activeRole) ? activeRole : user.roles[0]);

  const value = useMemo(() => ({
    user,
    ready,
    role,
    setActiveRole,
    setUser,
    async login(identifier, password) {
      const u = await api.login({ identifier, password });
      setUser(u);
      setActiveRole(u.roles[0]);
      return u;
    },
    async register(data) {
      const u = await api.register(data);
      setUser(u);
      setActiveRole('KHACH');
      return u;
    },
    async logout() {
      await api.logout();
      setUser(null);
    },
  }), [user, ready, role, setActiveRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/* ---------------- Số thông báo chưa đọc ---------------- */

const NotiContext = createContext({ unread: 0, refresh: () => {} });

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const timer = useRef();
  const refresh = useCallback(() => {
    if (!user) { setUnread(0); return; }
    api.listNotifications().then((xs) => setUnread(xs.filter((n) => !n.read).length)).catch(() => {});
  }, [user]);
  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 30000);
    return () => clearInterval(timer.current);
  }, [refresh]);
  return <NotiContext.Provider value={{ unread, refresh }}>{children}</NotiContext.Provider>;
}

export const useNotifications = () => useContext(NotiContext);
