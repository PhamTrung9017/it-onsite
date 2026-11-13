import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AppContext.jsx';
import { Loading } from '../../components/ui.jsx';
import CreateRequestPage from '../customer/CreateRequestPage.jsx';

/** Đặt lịch nhanh không cần tài khoản; khách đã đăng nhập thì dùng trang đặt lịch của tài khoản. */
export default function GuestBookingPage() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="container app-main"><Loading /></div>;
  if (user && !user.guestTicket && user.roles.includes('KHACH')) return <Navigate to="/khach/tao-yeu-cau" replace />;
  return (
    <main className="container app-main">
      <CreateRequestPage guest />
    </main>
  );
}
