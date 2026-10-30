import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

/** `npm run test:e2e:backend` chạy trên backend thật; `npm run test:e2e` chạy trên API giả lập trong trình duyệt. */
export const BACKEND = Boolean(process.env.E2E_BACKEND) || process.env.npm_lifecycle_event === 'test:e2e:backend';
const BACKEND_DIR = fileURLToPath(new URL('../../backend/', import.meta.url));
const VENV_PYTHON = process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python';
const RESET_COMMAND = process.env.E2E_RESET_COMMAND || `${VENV_PYTHON} -m app.seed demo`;
export const PASSWORD = '123456';

const MOCK_KEY = 'itonsite.mock.v1';
const MOCK_SESSION_KEY = 'itonsite.session.v1';
const TOKEN_KEY = 'itonsite.tokens.v1';
const ADMIN = 'qtv@demo.vn';

/** Đưa dữ liệu về trạng thái mẫu để mỗi kịch bản bắt đầu như nhau; E2E_CLOCK đặt giờ trình duyệt để thử ở các thời điểm khác nhau trong ngày. */
export async function resetData(page) {
  if (BACKEND) execSync(RESET_COMMAND, { cwd: BACKEND_DIR, stdio: 'ignore' });
  else if (process.env.E2E_CLOCK) await page.clock.install({ time: new Date(process.env.E2E_CLOCK) });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
}

export async function loginAs(page, email) {
  await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), [MOCK_SESSION_KEY, TOKEN_KEY]);
  await page.goto('/dang-nhap');
  await page.fill('#id', email);
  await page.fill('#pw', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

const readMock = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), MOCK_KEY);

/** Gọi API backend bằng phiên đang đăng nhập, hoặc đăng nhập tạm bằng tài khoản `as`. */
async function request(page, path, as = null) {
  return page.evaluate(async ({ path, as, password, tokenKey }) => {
    let token = JSON.parse(localStorage.getItem(tokenKey) || 'null')?.accessToken;
    if (as) {
      const login = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: as, password }),
      });
      token = (await login.json()).accessToken;
    }
    const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, { path, as, password: PASSWORD, tokenKey: TOKEN_KEY });
}

export async function getTicket(page, id) {
  if (BACKEND) return request(page, `/tickets/${id}`, ADMIN);
  return (await readMock(page)).tickets.find((t) => t.id === id);
}

/** Phiếu của khách đang đăng nhập. */
export async function myTickets(page) {
  if (BACKEND) return request(page, '/tickets/mine');
  const session = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), MOCK_SESSION_KEY);
  return (await readMock(page)).tickets.filter((t) => t.customerId === session.userId);
}

export async function technician(page, techId) {
  if (BACKEND) {
    const tech = (await request(page, '/admin/overview', ADMIN)).technicians.find((k) => k.id === techId);
    return { email: tech.email, skills: tech.skills };
  }
  const db = await readMock(page);
  const tech = db.technicians.find((k) => k.id === techId);
  return { email: db.users.find((u) => u.id === tech.userId).email, skills: tech.skills };
}

export async function surveyFee(page) {
  if (BACKEND) return (await request(page, '/catalog')).config.surveyFee;
  return (await readMock(page)).config.surveyFee;
}

/** Phiếu bảo hành phát hành cho một phiếu yêu cầu (đọc dưới danh nghĩa khách hàng của phiếu). */
export async function warrantiesOf(page, ticketId, customerEmail) {
  if (BACKEND) return (await request(page, '/warranties/mine', customerEmail)).filter((w) => w.ticketId === ticketId);
  return (await readMock(page)).warranties.filter((w) => w.ticketId === ticketId);
}

export async function claimStatus(page, ticketId) {
  if (BACKEND) {
    const claims = await request(page, '/warranty-claims', ADMIN);
    return claims.find((c) => c.warranty.ticketId === ticketId)?.status;
  }
  const db = await readMock(page);
  const ids = db.warranties.filter((w) => w.ticketId === ticketId).map((w) => w.id);
  return db.warrantyClaims.filter((c) => ids.includes(c.warrantyId)).at(-1)?.status;
}

export async function warrantyTicketOf(page, ticketId) {
  if (BACKEND) return (await request(page, '/dispatch/board', ADMIN)).find((t) => t.isWarranty && t.warrantyOf === ticketId);
  return (await readMock(page)).tickets.find((t) => t.isWarranty && t.warrantyOf === ticketId);
}

/** Thông báo trên web của một tài khoản, mới nhất trước. */
export async function notificationsOf(page, email) {
  if (BACKEND) return request(page, '/notifications', email);
  const db = await readMock(page);
  const user = db.users.find((u) => u.email === email);
  return db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Chờ phiếu chuyển sang trạng thái mong đợi rồi trả về phiếu. */
export async function expectStatus(page, id, status) {
  await expect.poll(async () => (await getTicket(page, id))?.status, { message: `Trạng thái phiếu ${id}` }).toBe(status);
  return getTicket(page, id);
}

/** Ngày mai theo giờ của trình duyệt, định dạng yyyy-mm-dd cho ô nhập ngày. */
export function tomorrowInput(page) {
  return page.evaluate(() => {
    const d = new Date(Date.now() + 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });
  return errors;
}

/**
 * Sửa dữ liệu giả lập từ một trang tĩnh cùng nguồn, nơi ứng dụng không chạy,
 * để không bị yêu cầu đang dở của ứng dụng ghi đè.
 */
export async function patchMock(page, mutate, arg) {
  await page.goto('/favicon.svg');
  await page.evaluate(({ key, source, arg }) => {
    const db = JSON.parse(localStorage.getItem(key));
    new Function('db', 'arg', source)(db, arg);
    localStorage.setItem(key, JSON.stringify(db));
  }, { key: MOCK_KEY, source: `(${mutate.toString()})(db, arg);`, arg });
}

export { readMock };
