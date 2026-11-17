import { expect, test } from '@playwright/test';
import { loginAs, resetData } from './helpers.js';

/** Gõ từng ký tự vào mọi ô chữ trong vùng: con trỏ phải ở yên ô đang gõ, chữ không mất. */
async function typeEveryField(page, scope = page.getByRole('dialog'), min = 2) {
  const fields = scope.locator('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=time]):not([type=date]):not([type=number]), textarea');
  await fields.first().waitFor();
  const count = await fields.count();
  expect(count).toBeGreaterThanOrEqual(min);
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible()) || !(await field.isEditable())) continue;
    await field.click();
    await field.fill('');
    await field.pressSequentially('ab12');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('ab12');
  }
}

test.describe('Gõ chữ trong hộp thoại và biểu mẫu', () => {
  test.beforeEach(async ({ page }) => resetData(page));

  test('Quản trị viên: tạo tài khoản nội bộ, thêm kỹ thuật viên', async ({ page }) => {
    await loginAs(page, 'qtv@demo.vn');
    await page.goto('/quan-tri/tai-khoan');
    await page.getByRole('button', { name: 'Tạo tài khoản nội bộ' }).click();
    await typeEveryField(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/quan-tri/ky-thuat-vien');
    await page.getByRole('button', { name: 'Thêm kỹ thuật viên' }).click();
    await typeEveryField(page);
  });

  test('Khách hàng: thêm thiết bị, đổi mật khẩu', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    await page.goto('/khach/ho-so');
    await page.getByRole('button', { name: 'Thêm thiết bị' }).click();
    await typeEveryField(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).first().click();
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await typeEveryField(page);
  });

  test('Biểu mẫu công khai và cấu hình: gõ từng ký tự không mất con trỏ', async ({ page }) => {
    for (const path of ['/dang-nhap', '/dang-ky', '/dat-lich', '/tra-cuu', '/quen-mat-khau']) {
      await page.goto(path);
      await typeEveryField(page, page.locator('body'), 1);
    }
    await loginAs(page, 'khach@demo.vn');
    await page.goto('/khach/tao-yeu-cau');
    await typeEveryField(page, page.locator('body'), 1);
  });
});
