import { Navigate, Route, Routes } from 'react-router-dom';
import { MobileAppLayout, PublicLayout, RequireRole, ShellLayout } from './components/layouts.jsx';
import { NotificationsPage } from './components/ticket.jsx';
import HomePage from './pages/public/HomePage.jsx';
import PricingPage from './pages/public/PricingPage.jsx';
import { ForgotPasswordPage, LoginPage, NotFoundPage, RegisterPage, ResetPasswordPage } from './pages/public/AuthPages.jsx';
import TicketsPage from './pages/customer/TicketsPage.jsx';
import CreateRequestPage from './pages/customer/CreateRequestPage.jsx';
import TicketDetailPage from './pages/customer/TicketDetailPage.jsx';
import QuoteReviewPage from './pages/customer/QuoteReviewPage.jsx';
import PaymentPage from './pages/customer/PaymentPage.jsx';
import WarrantyPage from './pages/customer/WarrantyPage.jsx';
import ProfilePage from './pages/customer/ProfilePage.jsx';
import JobsPage from './pages/technician/JobsPage.jsx';
import JobDetailPage from './pages/technician/JobDetailPage.jsx';
import QuoteBuilderPage from './pages/technician/QuoteBuilderPage.jsx';
import TechProfilePage from './pages/technician/TechProfilePage.jsx';
import BoardPage from './pages/dispatcher/BoardPage.jsx';
import PaymentsPage from './pages/dispatcher/PaymentsPage.jsx';
import WarrantyClaimsPage from './pages/dispatcher/WarrantyClaimsPage.jsx';
import ReportsPage from './pages/admin/ReportsPage.jsx';
import { AccountsPage, AuditPage, ConfigPage, PartsPage, ServicesPage, TechniciansPage } from './pages/admin/AdminPages.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="bang-gia" element={<PricingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="dang-nhap" element={<LoginPage />} />
      <Route path="dang-ky" element={<RegisterPage />} />
      <Route path="quen-mat-khau" element={<ForgotPasswordPage />} />
      <Route path="dat-lai-mat-khau" element={<ResetPasswordPage />} />

      <Route path="khach" element={<RequireRole role="KHACH" />}>
        <Route element={<MobileAppLayout role="KHACH" />}>
          <Route index element={<Navigate to="phieu" replace />} />
          <Route path="phieu" element={<TicketsPage />} />
          <Route path="phieu/:id" element={<TicketDetailPage />} />
          <Route path="phieu/:id/bao-gia" element={<QuoteReviewPage />} />
          <Route path="phieu/:id/thanh-toan" element={<PaymentPage />} />
          <Route path="tao-yeu-cau" element={<CreateRequestPage />} />
          <Route path="bao-hanh" element={<WarrantyPage />} />
          <Route path="ho-so" element={<ProfilePage />} />
          <Route path="thong-bao" element={<NotificationsPage ticketLink={(id) => `/khach/phieu/${id}`} />} />
        </Route>
      </Route>

      <Route path="ktv" element={<RequireRole role="KTV" />}>
        <Route element={<MobileAppLayout role="KTV" />}>
          <Route index element={<Navigate to="lich-viec" replace />} />
          <Route path="lich-viec" element={<JobsPage />} />
          <Route path="viec/:id" element={<JobDetailPage />} />
          <Route path="viec/:id/bao-gia" element={<QuoteBuilderPage />} />
          <Route path="ho-so" element={<TechProfilePage />} />
          <Route path="thong-bao" element={<NotificationsPage ticketLink={(id) => `/ktv/viec/${id}`} />} />
        </Route>
      </Route>

      <Route path="dieu-phoi" element={<RequireRole role="DPV" />}>
        <Route element={<ShellLayout role="DPV" />}>
          <Route index element={<BoardPage />} />
          <Route path="thanh-toan" element={<PaymentsPage />} />
          <Route path="bao-hanh" element={<WarrantyClaimsPage />} />
          <Route path="thong-bao" element={<NotificationsPage />} />
        </Route>
      </Route>

      <Route path="quan-tri" element={<RequireRole role="QTV" />}>
        <Route element={<ShellLayout role="QTV" />}>
          <Route index element={<Navigate to="bao-cao" replace />} />
          <Route path="bao-cao" element={<ReportsPage />} />
          <Route path="ky-thuat-vien" element={<TechniciansPage />} />
          <Route path="dich-vu" element={<ServicesPage />} />
          <Route path="linh-kien" element={<PartsPage />} />
          <Route path="tai-khoan" element={<AccountsPage />} />
          <Route path="cau-hinh" element={<ConfigPage />} />
          <Route path="nhat-ky" element={<AuditPage />} />
          <Route path="thong-bao" element={<NotificationsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
