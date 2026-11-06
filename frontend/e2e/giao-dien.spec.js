import { test, expect } from '@playwright/test';
import { loginAs, resetData, trackErrors } from './helpers.js';

/** Mọi màn hình phải hiển thị không lỗi JavaScript và không tràn ngang trên cả máy tính lẫn điện thoại. */
const SCREENS = [
  { role: null, paths: ['/', '/bang-gia', '/dang-nhap', '/dang-ky', '/quen-mat-khau', '/khong-ton-tai'] },
  { role: 'khach@demo.vn', paths: ['/khach/phieu', '/khach/tao-yeu-cau', '/khach/bao-hanh', '/khach/ho-so', '/khach/thong-bao'] },
  { role: 'ktv@demo.vn', paths: ['/ktv/lich-viec', '/ktv/ho-so', '/ktv/thong-bao'] },
  { role: 'dpv@demo.vn', paths: ['/dieu-phoi', '/dieu-phoi/thanh-toan', '/dieu-phoi/bao-hanh', '/dieu-phoi/thong-bao'] },
  { role: 'qtv@demo.vn', paths: ['/quan-tri/bao-cao', '/quan-tri/ky-thuat-vien', '/quan-tri/dich-vu', '/quan-tri/linh-kien', '/quan-tri/tai-khoan', '/quan-tri/cau-hinh', '/quan-tri/nhat-ky'] },
];

for (const { role, paths } of SCREENS) {
  test(`Màn hình ${role ? `của ${role}` : 'công khai'}`, async ({ page }) => {
    const errors = trackErrors(page);
    await resetData(page);
    if (role) await loginAs(page, role);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} tràn ngang`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}
