import { test, expect } from '@playwright/test';
import {
  BACKEND, claimStatus, expectStatus, getTicket, loginAs, myTickets, readMock, resetData, surveyFee, technician, tomorrowInput, trackErrors,
  warrantiesOf, warrantyTicketOf,
} from './helpers.js';

const PHOTO_BEFORE = new URL('./fixtures/anh-truoc.jpg', import.meta.url).pathname;
const PHOTO_AFTER = new URL('./fixtures/anh-sau.jpg', import.meta.url).pathname;

test.describe('Quy trình nghiệp vụ IT OnSite', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = trackErrors(page);
    await resetData(page);
  });
  test.afterEach(() => {
    expect(errors, 'Không có lỗi JavaScript trên trang').toEqual([]);
  });

  test('UC04 → UC16: đặt lịch, phân công, báo giá duyệt một phần, nghiệm thu, chuyển khoản, đánh giá, bảo hành', async ({ page }) => {
    let id;
    let techId;

    await test.step('UC04-UC05: khách mô tả sự cố, nhận gợi ý loại sự cố và đặt lịch', async () => {
      await loginAs(page, 'khach@demo.vn');
      await page.goto('/khach/tao-yeu-cau');
      await page.locator('.choice').first().click();
      await page.fill('#desc', 'Máy tính không lên nguồn, bấm nút nguồn không có đèn, quạt không quay từ sáng nay.');
      await page.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(page.locator('#cat')).toHaveValue('NGUON');
      await page.getByRole('button', { name: 'Tiếp tục' }).click();
      await page.fill('#addr', '120 Nguyễn Trãi');
      await page.selectOption('#ward', 'Bến Thành');
      await page.fill('#date', await tomorrowInput(page));
      await page.selectOption('#time', '15:00');
      for (const box of await page.locator('label.check input[type=checkbox]').all()) await box.check();
      await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
      await page.waitForURL(/\/khach\/phieu\/YC-/);
      id = decodeURIComponent(page.url().split('/').pop());
      await expectStatus(page, id, 'MOI');
    });

    await test.step('UC08: điều phối viên tiếp nhận và phân công kỹ thuật viên phù hợp nhất (BR-05)', async () => {
      await loginAs(page, 'dpv@demo.vn');
      await page.goto('/dieu-phoi');
      await page.locator('button.ticket-card', { hasText: id.replace('YC-', '') }).click();
      await page.getByRole('button', { name: 'Tiếp nhận' }).click();
      await expectStatus(page, id, 'DA_TIEP_NHAN');
      const best = page.locator('.row', { has: page.getByText('Phù hợp nhất') }).first();
      await best.getByRole('button', { name: 'Phân công' }).click();
      const t = await expectStatus(page, id, 'DA_PHAN_CONG');
      techId = t.assignment.techId;
      expect((await technician(page, techId)).skills, 'BR-05: ưu tiên đúng kỹ năng').toContain('NGUON');
    });

    await test.step('UC09, UC12, UC10: kỹ thuật viên nhận việc, check-in, chụp ảnh và lập báo giá', async () => {
      await loginAs(page, (await technician(page, techId)).email);
      await page.goto(`/ktv/viec/${id}`);
      await page.getByRole('button', { name: 'Nhận việc' }).click();
      await expectStatus(page, id, 'KTV_DA_NHAN');
      await page.getByRole('button', { name: 'Check-in' }).click();
      await expectStatus(page, id, 'DANG_KHAO_SAT');
      await page.locator('input[type=file]').first().setInputFiles(PHOTO_BEFORE);
      await expect.poll(async () => (await getTicket(page, id)).photosBefore.length).toBe(1);
      await page.getByRole('link', { name: 'Lập báo giá' }).click();
      const add = page.getByRole('button', { name: /^Thêm / });
      await add.nth(0).click();
      await add.nth(1).click();
      await page.fill('#nt', 'Nguồn hỏng tụ, đề xuất thay nguồn và vệ sinh.');
      await page.getByRole('button', { name: 'Gửi báo giá cho khách' }).click();
      await expectStatus(page, id, 'CHO_DUYET_BAO_GIA');
    });

    await test.step('UC11: khách bỏ một hạng mục và duyệt phần còn lại', async () => {
      await loginAs(page, 'khach@demo.vn');
      await page.goto(`/khach/phieu/${id}/bao-gia`);
      await page.getByRole('checkbox').nth(1).click();
      await page.getByRole('button', { name: /Đồng ý 1\/2 hạng mục/ }).click();
      const t = await expectStatus(page, id, 'DANG_THUC_HIEN');
      expect(t.quotes.at(-1).status).toBe('DUYET_MOT_PHAN');
    });

    await test.step('UC12: kỹ thuật viên chỉ báo hoàn thành được khi có ảnh trước và sau (BR-11)', async () => {
      await loginAs(page, (await technician(page, techId)).email);
      await page.goto(`/ktv/viec/${id}`);
      await expect(page.getByRole('button', { name: 'Báo hoàn thành' })).toBeDisabled();
      await page.locator('input[type=file]').nth(1).setInputFiles(PHOTO_AFTER);
      await expect(page.getByRole('button', { name: 'Báo hoàn thành' })).toBeEnabled();
      await page.getByRole('button', { name: 'Báo hoàn thành' }).click();
      await expectStatus(page, id, 'CHO_NGHIEM_THU');
    });

    await test.step('UC13-UC14: khách nghiệm thu và báo đã chuyển khoản VietQR', async () => {
      await loginAs(page, 'khach@demo.vn');
      await page.goto(`/khach/phieu/${id}`);
      await page.getByRole('button', { name: 'Nghiệm thu đạt' }).click();
      const t = await expectStatus(page, id, 'CHO_THANH_TOAN');
      const approved = t.quotes.at(-1).items.filter((it) => it.selected).reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
      expect(t.payment.amount, 'BR-02: chỉ thu các hạng mục đã duyệt, miễn phí khảo sát').toBe(approved);
      await page.getByRole('link', { name: 'Thanh toán' }).click();
      await expect(page.getByRole('img', { name: 'Mã VietQR chuyển khoản' })).toBeVisible();
      await page.getByRole('button', { name: 'Tôi đã chuyển khoản' }).click();
      await expect.poll(async () => (await getTicket(page, id)).payment.status).toBe('CHO_XAC_NHAN');
    });

    await test.step('UC14: điều phối viên xác nhận chuyển khoản, phiếu hoàn tất và phát hành bảo hành', async () => {
      await loginAs(page, 'dpv@demo.vn');
      await page.goto('/dieu-phoi/thanh-toan');
      await page.locator('tr', { hasText: id }).getByRole('button', { name: 'Xác nhận đã nhận' }).click();
      await expectStatus(page, id, 'HOAN_TAT');
      expect((await warrantiesOf(page, id, 'khach@demo.vn')).length).toBeGreaterThan(0);
    });

    await test.step('UC16, UC15: khách đánh giá và gửi yêu cầu bảo hành, điều phối viên chấp nhận (BR-07)', async () => {
      await loginAs(page, 'khach@demo.vn');
      await page.goto(`/khach/phieu/${id}`);
      await page.getByRole('radio', { name: '5 sao' }).click();
      await page.fill('#cmt', 'Đến đúng giờ, giải thích rõ ràng.');
      await page.getByRole('button', { name: 'Gửi đánh giá' }).click();
      await expect.poll(async () => (await getTicket(page, id)).review?.stars).toBe(5);

      await page.goto('/khach/bao-hanh');
      const item = page.locator('.list-item', { hasText: id }).filter({ has: page.getByRole('button', { name: 'Yêu cầu bảo hành' }) }).first();
      await item.getByRole('button', { name: 'Yêu cầu bảo hành' }).click();
      await page.fill('#wd', 'Máy lại không lên nguồn sau 3 ngày.');
      await page.getByRole('dialog').getByRole('button', { name: 'Gửi yêu cầu' }).click();
      await expect.poll(() => claimStatus(page, id)).toBe('CHO_XU_LY');

      await loginAs(page, 'dpv@demo.vn');
      await page.goto('/dieu-phoi/bao-hanh');
      await page.locator('.list-item', { hasText: id }).getByRole('button', { name: 'Chấp nhận, tạo phiếu' }).click();
      await expect.poll(() => claimStatus(page, id)).toBe('HOP_LE');
      expect((await warrantyTicketOf(page, id)).status).toBe('MOI');
    });
  });

  test('UC11 nhánh từ chối: khách chỉ trả phí khảo sát, kỹ thuật viên thu tiền mặt, điều phối viên đối soát (BR-02, BR-08)', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    const ticket = (await myTickets(page)).find((t) => t.status === 'CHO_DUYET_BAO_GIA');
    await page.goto(`/khach/phieu/${ticket.id}/bao-gia`);
    await page.getByRole('button', { name: /Từ chối báo giá/ }).click();
    await page.fill('#rr', 'Chi phí cao hơn dự kiến.');
    await page.getByRole('button', { name: 'Xác nhận từ chối' }).click();
    const t = await expectStatus(page, ticket.id, 'CHO_THANH_TOAN');
    expect(t.payment.amount).toBe(await surveyFee(page));

    await page.goto(`/khach/phieu/${ticket.id}/thanh-toan`);
    await page.getByRole('button', { name: 'Tiền mặt' }).click();
    await page.getByRole('button', { name: 'Trả tiền mặt cho kỹ thuật viên' }).click();
    await page.waitForURL(new RegExp(`/khach/phieu/${ticket.id}$`));

    await loginAs(page, (await technician(page, t.assignment.techId)).email);
    await page.goto(`/ktv/viec/${ticket.id}`);
    await page.getByRole('button', { name: 'Xác nhận đã thu tiền mặt' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Đã thu/ }).click();
    await expectStatus(page, ticket.id, 'HOAN_TAT');

    await loginAs(page, 'dpv@demo.vn');
    await page.goto('/dieu-phoi/thanh-toan');
    await page.locator('tr', { hasText: ticket.id }).getByRole('button', { name: 'Đối soát' }).click();
    await expect.poll(async () => (await getTicket(page, ticket.id)).payment.status).toBe('DA_DOI_SOAT');
  });

  test('BR-06: kỹ thuật viên quá hạn phản hồi thì phân công tự thu hồi', async ({ page }) => {
    test.skip(BACKEND, 'Trên backend thật, quy tắc này được kiểm thử bằng pytest (tests/test_flow.py)');
    await loginAs(page, 'dpv@demo.vn');
    const db = await readMock(page);
    const pending = db.tickets.find((t) => t.status === 'DA_PHAN_CONG' && !t.assignment.result);
    pending.assignment.deadline = new Date(Date.now() - 60_000).toISOString();
    await page.evaluate((data) => localStorage.setItem('itonsite.mock.v1', JSON.stringify(data)), db);
    await page.goto('/dieu-phoi');
    const t = await expectStatus(page, pending.id, 'DA_TIEP_NHAN');
    expect(t.assignment.result).toBe('QUA_HAN');
  });

  test('UC07: khách hủy miễn phí khi phiếu chưa có kỹ thuật viên đến (BR-03)', async ({ page }) => {
    await loginAs(page, 'khach@demo.vn');
    const ticket = (await myTickets(page)).find((t) => t.status === 'MOI');
    await page.goto(`/khach/phieu/${ticket.id}`);
    await page.getByRole('button', { name: 'Hủy yêu cầu' }).click();
    await page.fill('#rs', 'Đã tự khắc phục được.');
    await page.getByRole('button', { name: 'Xác nhận hủy' }).click();
    await expectStatus(page, ticket.id, 'DA_HUY');
  });

  test('UC01, UC22: sai mật khẩu bị từ chối, sai vai trò bị chuyển về trang của mình', async ({ page }) => {
    await page.goto('/dang-nhap');
    await page.fill('#id', 'khach@demo.vn');
    await page.fill('#pw', 'sai-mat-khau');
    await page.click('button[type=submit]');
    await expect(page.getByText('mật khẩu không đúng')).toBeVisible();

    await loginAs(page, 'khach@demo.vn');
    await page.goto('/quan-tri/bao-cao');
    await expect(page).toHaveURL(/\/khach\/phieu$/);
  });
});
