/** Gọi REST API của backend FastAPI; cùng tên hàm với API giả lập để các màn hình dùng chung. */
import { ApiError } from '../apiError.js';

const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'itonsite.tokens.v1';
export const SESSION_EXPIRED_EVENT = 'itonsite:session-expired';

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveTokens(data) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: data.accessToken, refreshToken: data.refreshToken }));
  } catch {
    /* trình duyệt chặn bộ nhớ: phiên chỉ còn trong lần mở trang này */
  }
  return data.user;
}

function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* bỏ qua */
  }
}

async function send(method, path, body, token) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.', 0);
  }
  if (response.status === 204) return undefined;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.detail || 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.', response.status);
  return data;
}

let refreshing = null;

async function refreshTokens() {
  const tokens = readTokens();
  if (!tokens?.refreshToken) return false;
  refreshing ??= send('POST', '/auth/refresh', { refreshToken: tokens.refreshToken })
    .then((data) => { saveTokens(data); return true; })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Gửi kèm access token; hết hạn thì làm mới một lần rồi gửi lại, không làm mới được thì báo hết phiên. */
async function call(method, path, body) {
  try {
    return await send(method, path, body, readTokens()?.accessToken);
  } catch (error) {
    if (error.status !== 401 || !readTokens()) throw error;
    if (await refreshTokens()) return send(method, path, body, readTokens()?.accessToken);
    clearTokens();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw error;
  }
}

const get = (path) => call('GET', path);
const post = (path, body = {}) => call('POST', path, body);
const put = (path, body) => call('PUT', path, body);
const patch = (path, body) => call('PATCH', path, body);
const del = (path) => call('DELETE', path);
const t = (id) => `/tickets/${encodeURIComponent(id)}`;
const periodQuery = ({ days, month }) => (month ? `month=${encodeURIComponent(month)}` : `days=${days}`);

export const httpApi = {
  /* Xác thực */
  login: async (body) => saveTokens(await send('POST', '/auth/login', body)),
  register: async (body) => saveTokens(await send('POST', '/auth/register', body)),
  logout: async () => {
    const tokens = readTokens();
    clearTokens();
    if (tokens?.refreshToken) await send('POST', '/auth/logout', { refreshToken: tokens.refreshToken }).catch(() => {});
  },
  me: () => (readTokens() ? get('/auth/me') : Promise.reject(new ApiError('Chưa đăng nhập.', 401))),
  requestPasswordReset: (body) => send('POST', '/auth/forgot-password', body),
  resetPassword: (body) => send('POST', '/auth/reset-password', body),
  changePassword: async (body) => saveTokens(await post('/auth/change-password', body)),

  /* Danh mục, hồ sơ */
  getCatalog: () => send('GET', '/catalog'),
  updateProfile: (body) => patch('/me', body),
  listDevices: () => get('/me/devices'),
  addDevice: (body) => post('/me/devices', body),
  removeDevice: (id) => del(`/me/devices/${id}`),
  exportMyData: () => get('/me/export'),
  requestDataDeletion: (body) => post('/me/deletion-request', body),
  linkTelegram: () => post('/me/telegram-link'),

  /* Khách hàng */
  classifyIssue: (body) => post('/classify', body),
  createTicket: (body) => post('/tickets', body),
  listMyTickets: () => get('/tickets/mine'),
  getTicket: (id) => get(t(id)),
  cancelTicket: (id, body) => post(`${t(id)}/cancel`, body),
  rescheduleTicket: (id, body) => post(`${t(id)}/reschedule`, body),
  decideQuote: (id, quoteId, body) => post(`${t(id)}/quotes/${quoteId}/decision`, body),
  acceptWork: (id, body) => post(`${t(id)}/acceptance`, body),
  getPaymentInfo: (id) => get(`${t(id)}/payment`),
  reportTransfer: (id) => post(`${t(id)}/payment/transfer`),
  chooseCash: (id) => post(`${t(id)}/payment/cash`),
  submitReview: (id, body) => post(`${t(id)}/review`, body),
  listMyWarranties: () => get('/warranties/mine'),
  createWarrantyClaim: (body) => post('/warranty-claims', body),

  /* Thông báo */
  listNotifications: () => get('/notifications'),
  markNotificationsRead: (ids) => post('/notifications/read', { ids: ids || null }),

  /* Kỹ thuật viên */
  listMyJobs: () => get('/tech/jobs'),
  myTechProfile: () => get('/tech/profile'),
  listParts: () => get('/parts'),
  respondAssignment: (id, body) => post(`${t(id)}/assignment/response`, body),
  checkIn: (id) => post(`${t(id)}/check-in`),
  createQuote: (id, body) => post(`${t(id)}/quotes`, body),
  sendOnsiteCode: (id) => post(`${t(id)}/onsite-code`),
  confirmOnsite: (id, body) => post(`${t(id)}/onsite-code/confirm`, body),
  updateWork: (id, body) => put(`${t(id)}/checklist`, body),
  addWorkPhotos: (id, body) => post(`${t(id)}/photos`, body),
  removeWorkPhoto: (id, { kind, index }) => del(`${t(id)}/photos/${kind}/${index}`),
  completeWork: (id) => post(`${t(id)}/complete`),
  confirmCash: (id) => post(`${t(id)}/payment/cash-received`),

  /* Điều phối */
  listBoard: () => get('/dispatch/board'),
  receiveTicket: (id, body) => post(`${t(id)}/receive`, body),
  suggestTechnicians: (id, { appointmentAt }) => get(`${t(id)}/technician-suggestions?appointmentAt=${encodeURIComponent(appointmentAt)}`),
  assignTechnician: (id, body) => post(`${t(id)}/assign`, body),
  listPayments: () => get('/payments'),
  confirmTransfer: (id) => post(`${t(id)}/payment/confirm`),
  reconcileCash: (id) => post(`${t(id)}/payment/reconcile`),
  listWarrantyClaims: () => get('/warranty-claims'),
  decideWarrantyClaim: (id, body) => post(`/warranty-claims/${id}/decision`, body),

  /* Quản trị */
  adminData: () => get('/admin/overview'),
  saveService: (body) => put('/admin/services', body),
  savePart: (body) => put('/admin/parts', body),
  saveTechnician: (body) => put('/admin/technicians', body),
  saveUserRoles: (userId, body) => put(`/admin/users/${userId}/roles`, body),
  createInternalUser: (body) => post('/admin/users', body),
  saveConfig: (body) => put('/admin/config', body),
  report: (period) => get(`/admin/reports?${periodQuery(period)}`),
  reportExport: (period) => get(`/admin/reports/export?${periodQuery(period)}`),
};
