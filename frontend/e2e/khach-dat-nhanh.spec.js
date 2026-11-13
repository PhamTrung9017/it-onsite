import { test, expect } from '@playwright/test';
import { expectStatus, getTicket, resetData, tomorrowInput, trackErrors } from './helpers.js';

const PHONE = '0938111222';

test.describe('Khách đặt lịch không cần tài khoản', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = trackErrors(page);
    await resetData(page);
  });
  test.afterEach(() => {
    expect(errors, 'Không có lỗi JavaScript trên trang').toEqual([]);
  });

  test('đặt nhanh, tra cứu bằng mã đơn và số điện thoại, rồi tạo tài khoản giữ nguyên đơn', async ({ page }) => {
    let id;

    await test.step('khách đặt lịch từ trang chủ, không đăng nhập', async () => {
      await page.goto('/');
      await page.getByRole('link', { name: 'Đặt lịch hỗ trợ' }).first().click();
      await expect(page).toHaveURL(/\/dat-lich$/);
      await page.fill('#brand', 'Asus');
      await page.fill('#model', 'Vivobook 15');
      await page.fill('#desc', 'Laptop bật không lên Windows, báo lỗi màn hình xanh liên tục từ hôm qua.');
      await page.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(page.locator('#cat')).not.toHaveValue('');
      await page.getByRole('button', { name: 'Tiếp tục' }).click();
      await page.fill('#gname', 'Lê Văn Khách');
      await page.fill('#gphone', '0938');
      await page.fill('#addr', '18 Lê Lợi');
      await page.selectOption('#ward', 'Bến Thành');
      await page.fill('#date', await tomorrowInput(page));
      await page.selectOption('#time', '15:00');
      for (const box of await page.locator('label.check input[type=checkbox]').all()) await box.check();
      await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
      await expect(page.getByText('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.')).toBeVisible();
      await page.fill('#gphone', PHONE);
      await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
      await page.waitForURL(/\/khach\/phieu\/YC-/);
      id = decodeURIComponent(page.url().split('/').pop());
      const t = await expectStatus(page, id, 'MOI');
      expect(t.deposit.status).toBe('CHO_THANH_TOAN');
      await expect(page.getByText(`Mã đơn của bạn: ${id}`)).toBeVisible();
    });

    await test.step('phiên tra cứu làm được các bước trên đơn, không mở được trang khác của tài khoản', async () => {
      await page.getByRole('button', { name: 'Tôi đã chuyển khoản' }).click();
      await expect.poll(async () => (await getTicket(page, id)).deposit.status).toBe('CHO_XAC_NHAN');
      await page.goto('/khach/ho-so');
      await expect(page).toHaveURL(new RegExp(`/khach/phieu/${id}$`));
      await page.goto('/khach/phieu');
      await expect(page).toHaveURL(new RegExp(`/khach/phieu/${id}$`));
    });

    await test.step('lần sau tra cứu lại bằng mã đơn và số điện thoại', async () => {
      await page.evaluate(() => Object.keys(localStorage).filter((k) => /session|tokens/.test(k)).forEach((k) => localStorage.removeItem(k)));
      await page.goto(`/tra-cuu?ma=${id}`);
      await expect(page.locator('#ma')).toHaveValue(id);
      await page.fill('#sdt', '0900000000');
      await page.getByRole('button', { name: 'Tra cứu' }).click();
      await expect(page.getByText('Không tìm thấy đơn với mã đơn và số điện thoại này.')).toBeVisible();
      await page.fill('#sdt', PHONE);
      await page.getByRole('button', { name: 'Tra cứu' }).click();
      await page.waitForURL(new RegExp(`/khach/phieu/${id}$`));
      await expect(page.getByText('Đang đối chiếu phí giữ lịch')).toBeVisible();
    });

    await test.step('khách tạo tài khoản bằng cùng số điện thoại, đơn đã đặt nằm trong tài khoản', async () => {
      await page.getByRole('link', { name: 'Tạo tài khoản' }).first().click();
      await expect(page).toHaveURL(/\/dang-ky$/);
      await expect(page.locator('#p')).toHaveValue(PHONE);
      await expect(page.locator('#n')).toHaveValue('Lê Văn Khách');
      await page.fill('#pw', 'matkhau123');
      await page.locator('label.check input').check();
      await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
      await expect(page).toHaveURL(/\/khach\/phieu$/);
      await expect(page.getByText(id.replace('YC-', ''), { exact: false }).first()).toBeVisible();
      await page.goto('/khach/ho-so');
      await expect(page).toHaveURL(/\/khach\/ho-so$/);
    });
  });
});
