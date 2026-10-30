import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  claimStatus, expectStatus, getTicket, loginAs, myTickets, notificationsOf, resetData, tomorrowInput, trackErrors, warrantiesOf,
} from './helpers.js';

const PHOTO = new URL('./fixtures/anh-sau.jpg', import.meta.url).pathname;

test.describe('Các luồng phụ và màn hình quản trị', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = trackErrors(page);
    await resetData(page);
  });
  test.afterEach(() => {
    expect(errors, 'Không có lỗi JavaScript trên trang').toEqual([]);
  });

  test('UC07: khách đổi lịch hẹn', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    const ticket = (await myTickets(page)).find((t) => t.status === 'MOI');
    await page.goto(`/khach/phieu/${ticket.id}`);
    await page.getByRole('button', { name: 'Đổi lịch' }).click();
    await page.fill('#d', await tomorrowInput(page));
    await page.selectOption('#tm', '16:30');
    await page.getByRole('button', { name: 'Lưu lịch mới' }).click();
    const hourInVietnam = (iso) => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
    await expect.poll(async () => hourInVietnam((await getTicket(page, ticket.id)).slotStart)).toBe('16');
  });

  test('UC18: ngày nghỉ của kỹ thuật viên chặn phân công vào ngày đó', async ({ page }) => {
    const tomorrow = await tomorrowInput(page);
    await loginAs(page, 'qtv@demo.vn');
    await page.goto('/quan-tri/ky-thuat-vien');
    await page.getByRole('row', { name: /Lê Hoàng Phúc/ }).getByRole('button', { name: 'Sửa' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'CN', exact: true }).click();
    await page.fill('#wo', tomorrow);
    await dialog.getByRole('button', { name: 'Thêm' }).click();
    await expect(dialog.getByRole('button', { name: /^Bỏ ngày nghỉ/ })).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByRole('row', { name: /Lê Hoàng Phúc/ }).getByRole('cell', { name: 'T2–T7, 08:00–20:00' })).toBeVisible();

    await loginAs(page, 'dpv@demo.vn');
    await page.goto('/dieu-phoi');
    await page.locator('section[aria-label="Chờ phân công"] button.ticket-card').first().click();
    await page.fill('#ad', tomorrow);
    await page.selectOption('#at', '10:00');
    const row = page.locator('.stack-sm > .row', { hasText: 'Lê Hoàng Phúc' });
    await expect(row.getByText('Ngoài lịch làm việc')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Phân công' })).toBeDisabled();

    await loginAs(page, 'phuc.le@demo.vn');
    await page.goto('/ktv/ho-so');
    await expect(page.getByText(/Ngày nghỉ sắp tới:/)).toBeVisible();
  });

  test('UC21: quản trị viên xuất báo cáo ra file Excel', async ({ page }) => {
    await loginAs(page, 'qtv@demo.vn');
    await page.goto('/quan-tri/bao-cao');
    await page.getByRole('button', { name: '7 ngày' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất Excel' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^bao-cao-7-ngay-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const content = readFileSync(await file.path());
    expect(content.subarray(0, 2).toString()).toBe('PK');
    await expect(page.getByText('Đã tải file Excel báo cáo.')).toBeVisible();
  });

  test('UC13, UC10: nghiệm thu chưa đạt, báo giá bổ sung, làm lại rồi thu tiền mặt', async ({ page }) => {
    await loginAs(page, 'chau.le@demo.vn');
    const ticket = (await myTickets(page)).find((t) => t.status === 'DANG_THUC_HIEN');

    await loginAs(page, 'phuc.le@demo.vn');
    await page.goto(`/ktv/viec/${ticket.id}`);
    await page.locator('input[type=file]').nth(1).setInputFiles(PHOTO);
    await page.getByRole('button', { name: 'Báo hoàn thành' }).click();
    await expectStatus(page, ticket.id, 'CHO_NGHIEM_THU');

    await loginAs(page, 'chau.le@demo.vn');
    await page.goto(`/khach/phieu/${ticket.id}`);
    await page.getByRole('button', { name: 'Chưa đạt, yêu cầu làm lại' }).click();
    await page.fill('#nr', 'Vẫn còn thiếu thư mục Tài liệu.');
    await page.getByRole('dialog').getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expectStatus(page, ticket.id, 'DANG_THUC_HIEN');

    await loginAs(page, 'phuc.le@demo.vn');
    await page.goto(`/ktv/viec/${ticket.id}`);
    await page.getByPlaceholder('Thêm công việc').fill('Khôi phục thư mục Tài liệu');
    await page.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect.poll(async () => (await getTicket(page, ticket.id)).checklist.length).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Báo giá bổ sung' }).click();
    await page.locator('.segmented').getByRole('button', { name: 'Linh kiện' }).click();
    await page.getByRole('button', { name: /^Thêm SSD NVMe 512GB/ }).click();
    await page.getByRole('button', { name: 'Gửi báo giá cho khách' }).click();
    const quoted = await expectStatus(page, ticket.id, 'CHO_DUYET_BAO_GIA');
    expect(quoted.quotes.at(-1).type).toBe('BO_SUNG');

    await loginAs(page, 'chau.le@demo.vn');
    await page.goto(`/khach/phieu/${ticket.id}/bao-gia`);
    await page.getByRole('button', { name: /Đồng ý báo giá/ }).click();
    await expectStatus(page, ticket.id, 'DANG_THUC_HIEN');

    await loginAs(page, 'phuc.le@demo.vn');
    await page.goto(`/ktv/viec/${ticket.id}`);
    await page.getByRole('button', { name: 'Báo hoàn thành' }).click();
    await expectStatus(page, ticket.id, 'CHO_NGHIEM_THU');

    await loginAs(page, 'chau.le@demo.vn');
    await page.goto(`/khach/phieu/${ticket.id}`);
    await page.getByRole('button', { name: 'Nghiệm thu đạt' }).click();
    const due = await expectStatus(page, ticket.id, 'CHO_THANH_TOAN');
    const approved = due.quotes.flatMap((q) => q.items).filter((i) => i.selected).reduce((s, i) => s + i.unitPrice * i.qty, 0);
    expect(due.payment.amount, 'cộng cả báo giá chính và bổ sung').toBe(approved);
    await page.goto(`/khach/phieu/${ticket.id}/thanh-toan`);
    await page.getByRole('button', { name: 'Tiền mặt' }).click();
    await page.getByRole('button', { name: 'Trả tiền mặt cho kỹ thuật viên' }).click();

    await loginAs(page, 'phuc.le@demo.vn');
    await page.goto(`/ktv/viec/${ticket.id}`);
    await page.getByRole('button', { name: 'Xác nhận đã thu tiền mặt' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Đã thu/ }).click();
    await expectStatus(page, ticket.id, 'HOAN_TAT');
    await expect(page.getByText('Phiếu đã hoàn tất')).toBeVisible();

    await loginAs(page, 'chau.le@demo.vn');
    await page.goto(`/khach/phieu/${ticket.id}`);
    await page.getByRole('link', { name: 'Xem biên nhận' }).click();
    const receipt = page.getByRole('article', { name: `Biên nhận phiếu ${ticket.id}` });
    await expect(receipt.getByText('Báo giá bổ sung').first()).toBeVisible();
    await expect(receipt.getByText('Đã thu tiền mặt · Tiền mặt')).toBeVisible();
    const total = `${approved.toLocaleString('vi-VN')}đ`;
    await expect(receipt.locator('tfoot')).toContainText(total);
  });

  test('UC11 luồng 1a: khách đọc mã xác nhận cho kỹ thuật viên', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    const { id } = (await myTickets(page)).find((t) => t.status === 'CHO_DUYET_BAO_GIA');
    await loginAs(page, 'ktv@demo.vn');
    await page.goto(`/ktv/viec/${id}`);
    await page.getByRole('button', { name: 'Khách xác nhận tại chỗ' }).click();
    await expect(page.locator('#oc')).toBeVisible();
    const message = (await notificationsOf(page, 'khach@demo.vn')).find((n) => n.title === 'Mã xác nhận báo giá').body;
    const code = message.match(/\b\d{6}\b/)[0];
    await page.fill('#oc', code);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expectStatus(page, id, 'DANG_THUC_HIEN');
  });

  test('UC09: kỹ thuật viên từ chối việc, phiếu quay về chờ phân công', async ({ page }) => {
    await loginAs(page, 'ktv@demo.vn');
    await page.goto('/ktv/lich-viec');
    await page.getByText('Đã phân công').first().click();
    const id = decodeURIComponent(page.url().split('/').pop());
    await page.getByRole('button', { name: 'Từ chối' }).click();
    await page.fill('#dr', 'Trùng lịch cá nhân');
    await page.getByRole('dialog').getByRole('button', { name: 'Từ chối' }).click();
    await expectStatus(page, id, 'DA_TIEP_NHAN');

    await loginAs(page, 'dpv@demo.vn');
    await page.goto('/dieu-phoi');
    const column = page.locator('section.board-col', { hasText: 'Chờ phân công' });
    await expect(column.locator('button.ticket-card', { hasText: id.replace('YC-', '') })).toBeVisible();
  });

  test('UC15: điều phối viên từ chối bảo hành, khách gửi lại được', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    let done;
    let warranty;
    for (const t of (await myTickets(page)).filter((x) => x.status === 'HOAN_TAT')) {
      [warranty] = await warrantiesOf(page, t.id, 'khach@demo.vn');
      if (warranty) { done = t; break; }
    }
    await page.goto('/khach/bao-hanh');
    const item = page.locator('.list-item', { hasText: warranty.name }).filter({ hasText: done.id }).first();
    await item.getByRole('button', { name: 'Yêu cầu bảo hành' }).click();
    await page.fill('#wd', 'Ổ cứng không nhận sau khi rơi.');
    await page.getByRole('dialog').getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect.poll(() => claimStatus(page, done.id)).toBe('CHO_XU_LY');

    await loginAs(page, 'dpv@demo.vn');
    await page.goto('/dieu-phoi/bao-hanh');
    await page.locator('.list-item', { hasText: done.id }).getByRole('button', { name: 'Từ chối' }).click();
    await page.fill('#wr', 'Lỗi do rơi vỡ, ngoài phạm vi bảo hành.');
    await page.getByRole('dialog').getByRole('button', { name: 'Từ chối' }).click();
    await expect.poll(() => claimStatus(page, done.id)).toBe('TU_CHOI');

    await loginAs(page, 'khach@demo.vn');
    await page.goto('/khach/bao-hanh');
    const again = page.locator('.list-item', { hasText: warranty.name }).filter({ hasText: done.id }).first();
    await expect(again.getByText('Bị từ chối')).toBeVisible();
    await expect(again.getByRole('button', { name: 'Yêu cầu bảo hành' })).toBeVisible();
  });

  test('UC02: hồ sơ, thiết bị, đổi mật khẩu, tải dữ liệu cá nhân', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    await page.goto('/khach/ho-so');
    await page.fill('#pn', 'Nguyễn Văn Anh Tuấn');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText('Đã lưu hồ sơ.')).toBeVisible();

    await page.getByRole('button', { name: 'Thêm thiết bị' }).click();
    await page.fill('#db', 'Acer');
    await page.fill('#dm', 'Aspire 7');
    await page.fill('#dn', 'Máy đặt ở phòng họp');
    await page.getByRole('dialog').getByRole('button', { name: 'Thêm' }).click();
    await expect(page.getByText('Acer Aspire 7')).toBeVisible();
    await expect(page.getByText('Máy đặt ở phòng họp')).toBeVisible();
    await page.getByRole('button', { name: 'Xóa Aspire 7' }).click();
    await expect(page.getByText('Acer Aspire 7')).toHaveCount(0);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải dữ liệu của tôi' }).click();
    expect((await download).suggestedFilename()).toMatch(/^du-lieu-ca-nhan-/);

    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await page.fill('#c1', '123456');
    await page.fill('#c2', 'matkhaumoi1');
    await page.getByRole('dialog').getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByText('Đã đổi mật khẩu.')).toBeVisible();
  });

  test('UC01: đăng ký tài khoản mới rồi vào đặt lịch', async ({ page }) => {
    await page.goto('/dang-ky');
    await page.fill('#n', 'Phạm Minh Khang');
    await page.fill('#e', 'khang.pham@example.com');
    await page.fill('#p', '0912345678');
    await page.fill('#pw', 'matkhau123');
    await page.locator('label.check input').check();
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page).toHaveURL(/\/khach\/tao-yeu-cau$/);
  });

  test('UC17: đánh dấu đã đọc thông báo', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    await page.goto('/khach/thong-bao');
    await page.getByRole('button', { name: 'Đánh dấu đã đọc tất cả' }).click();
    await expect(page.getByRole('button', { name: 'Đánh dấu đã đọc tất cả' })).toHaveCount(0);
    await expect.poll(async () => (await notificationsOf(page, 'khach@demo.vn')).filter((n) => !n.read).length).toBe(0);
  });

  test('UC18–UC23: quản trị bảng giá, kỹ thuật viên, tài khoản, cấu hình', async ({ page }) => {
    await loginAs(page, 'qtv@demo.vn');

    await page.goto('/quan-tri/dich-vu');
    await page.getByRole('button', { name: 'Thêm dịch vụ' }).click();
    await page.fill('#cn', 'Cài đặt máy in mạng');
    await page.selectOption('#cc', 'PHAN_MEM');
    await page.fill('#cp', '120000');
    await page.fill('#cd', '45');
    await page.fill('#cw', '7');
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByRole('cell', { name: 'Cài đặt máy in mạng' }).first()).toBeVisible();

    await page.goto('/quan-tri/ky-thuat-vien');
    await page.getByRole('button', { name: 'Thêm kỹ thuật viên' }).click();
    await page.fill('#tn', 'Phan Văn Tài');
    await page.fill('#te', 'tai.phan@demo.vn');
    await page.fill('#tp', '0913111222');
    await page.getByRole('dialog').getByRole('button', { name: 'Mạng và Wi-Fi' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Bàn Cờ' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu' }).click();
    await expect(page.getByText('Phan Văn Tài')).toBeVisible();

    await page.goto('/quan-tri/tai-khoan');
    await page.getByRole('button', { name: 'Tạo tài khoản nội bộ' }).click();
    await page.fill('#un', 'Lý Thu Trang');
    await page.fill('#ue', 'trang.ly@demo.vn');
    await page.fill('#up', '0913333444');
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo' }).click();
    await expect(page.getByText('Lý Thu Trang')).toBeVisible();

    await page.goto('/quan-tri/cau-hinh');
    await page.fill('#surveyFee', '60000');
    await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
    await expect(page.getByText('Đã lưu cấu hình.')).toBeVisible();
    await page.goto('/bang-gia');
    await expect(page.getByText('60.000đ').first()).toBeVisible();

    await page.goto('/quan-tri/nhat-ky');
    await expect(page.getByText('CAU_HINH').first()).toBeVisible();
  });
});
