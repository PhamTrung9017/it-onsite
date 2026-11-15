import { test, expect } from '@playwright/test';
import { resetData, trackErrors } from './helpers.js';

test.describe('Quy trình, điều khoản, chính sách dữ liệu', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = trackErrors(page);
    await resetData(page);
  });
  test.afterEach(() => {
    expect(errors, 'Không có lỗi JavaScript trên trang').toEqual([]);
  });

  test('trang Quy trình có sơ đồ theo người thực hiện và bảng các bước khớp tham số', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Quy trình' }).click();
    await expect(page).toHaveURL(/\/quy-trinh$/);
    const diagram = page.getByRole('img', { name: 'Sơ đồ quy trình xử lý phiếu theo người thực hiện' });
    await expect(diagram).toBeVisible();
    for (const lane of ['Khách hàng', 'Hệ thống', 'Điều phối viên', 'Kỹ thuật viên']) await expect(diagram.getByText(lane, { exact: true })).toBeVisible();
    await expect(diagram.getByText('50.000đ, 30 phút')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Trạng thái phiếu: KTV đã nhận' })).toContainText('15 phút');
  });

  test('điều khoản dịch vụ khớp tham số, dẫn tới chính sách dữ liệu cá nhân', async ({ page }) => {
    await page.goto('/dieu-khoan');
    await expect(page.getByRole('heading', { name: 'Điều khoản dịch vụ' })).toBeVisible();
    await expect(page.getByText('chuyển trước phí khảo sát 50.000đ bằng mã VietQR trong 30 phút', { exact: false })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'chính sách dữ liệu cá nhân', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chính sách dữ liệu cá nhân' })).toBeVisible();
    await expect(page.getByText('Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15', { exact: false })).toBeVisible();
  });
});
