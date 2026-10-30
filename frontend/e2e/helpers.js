import { expect } from '@playwright/test';

export const PASSWORD = '123456';
export const DATA_KEY = 'itonsite.mock.v1';
const SESSION_KEY = 'itonsite.session.v1';

/** Xóa dữ liệu mẫu để mỗi kịch bản bắt đầu từ cùng một trạng thái. */
export async function resetData(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
}

/** Đăng nhập bằng form, giữ nguyên dữ liệu trong localStorage. */
export async function loginAs(page, email) {
  await page.evaluate((key) => localStorage.removeItem(key), SESSION_KEY);
  await page.goto('/dang-nhap');
  await page.fill('#id', email);
  await page.fill('#pw', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('dang-nhap'));
}

export const readDb = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), DATA_KEY);

export async function getTicket(page, id) {
  return (await readDb(page)).tickets.find((t) => t.id === id);
}

/** Chờ phiếu chuyển sang trạng thái mong đợi rồi trả về phiếu. */
export async function expectStatus(page, id, status) {
  await expect.poll(async () => (await getTicket(page, id))?.status, { message: `Trạng thái phiếu ${id}` }).toBe(status);
  return getTicket(page, id);
}

export async function techEmail(page, techId) {
  const db = await readDb(page);
  const tech = db.technicians.find((k) => k.id === techId);
  return db.users.find((u) => u.id === tech.userId).email;
}

/** Ngày mai theo giờ của trình duyệt, định dạng yyyy-mm-dd cho input date. */
export function tomorrowInput(page) {
  return page.evaluate(() => {
    const d = new Date(Date.now() + 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
