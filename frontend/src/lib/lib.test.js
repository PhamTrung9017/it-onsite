import { describe, expect, it } from 'vitest';
import { buildVietQR, crc16, sanitizeContent } from './vietqr.js';
import { canTransition, STATUS } from './ticketStatus.js';
import {
  amountDue, canComplete, cancellationPolicy, depositDeadline, hasConflict, offDuty, rankTechnicians, reviewPolicy, validateReview, validateSchedule,
  reportPeriod, reschedulePolicy, validateSlot, warrantyStatus,
} from './rules.js';
import { formatSchedule } from './format.js';
import { classifyIssue, redactPersonalData } from './classifier.js';

const config = {
  surveyFee: 50000,
  freeCancelHours: 2,
  depositMinutes: 30,
  techResponseMinutes: 15,
  travelBufferMinutes: 30,
  reviewWindowDays: 7,
  serviceHours: { start: '08:00', end: '20:00' },
};
const HOUR = 3600 * 1000;

describe('VietQR', () => {
  it('CRC-16/CCITT-FALSE đúng giá trị kiểm tra chuẩn', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
  it('tạo chuỗi trùng với mẫu tham chiếu', () => {
    expect(buildVietQR({ bin: '970423', accountNumber: '0123456789', amount: 150000, content: 'DH123456' }))
      .toBe('00020101021238540010A00000072701240006970423011001234567890208QRIBFTTA530370454061500005802VN62120808DH123456630479AB');
  });
  it('bỏ dấu và ký tự đặc biệt trong nội dung chuyển khoản', () => {
    expect(sanitizeContent('Thanh toán YC-20261030-001')).toBe('Thanh toan YC20261030001');
  });
});

describe('Máy trạng thái phiếu', () => {
  it('cho phép luồng chính và chặn chuyển sai quy trình', () => {
    expect(canTransition(STATUS.MOI, STATUS.DA_TIEP_NHAN)).toBe(true);
    expect(canTransition(STATUS.CHO_DUYET_BAO_GIA, STATUS.CHO_THANH_TOAN)).toBe(true);
    expect(canTransition(STATUS.MOI, STATUS.HOAN_TAT)).toBe(false);
    expect(canTransition(STATUS.DANG_KHAO_SAT, STATUS.DA_HUY)).toBe(false);
    expect(canTransition(STATUS.HOAN_TAT, STATUS.DA_HUY)).toBe(false);
  });
});

describe('BR-03 hủy và đổi lịch', () => {
  const now = new Date('2026-10-30T08:00:00+07:00').getTime();
  const paid = { amount: 50000, status: 'DA_XAC_NHAN' };
  it('hủy miễn phí khi cửa hàng chưa tiếp nhận phiếu', () => {
    expect(cancellationPolicy({ status: STATUS.MOI, deposit: paid })).toMatchObject({ allowed: true, fee: 0 });
  });
  it('mất phí giữ lịch khi hủy sau khi cửa hàng tiếp nhận', () => {
    expect(cancellationPolicy({ status: STATUS.KTV_DA_NHAN, deposit: paid })).toMatchObject({ allowed: true, fee: 50000 });
    expect(cancellationPolicy({ status: STATUS.KTV_DA_NHAN, deposit: null })).toMatchObject({ allowed: true, fee: 0 });
  });
  it('không cho hủy sau khi KTV check-in', () => {
    expect(cancellationPolicy({ status: STATUS.DANG_KHAO_SAT, deposit: paid }).allowed).toBe(false);
  });
  it('khách đổi lịch khi còn ít nhất 2 giờ, sát giờ phải gọi cửa hàng', () => {
    const at = (h) => ({ status: STATUS.DA_PHAN_CONG, slotStart: new Date(now + h * HOUR).toISOString() });
    expect(reschedulePolicy(at(2), config, now).allowed).toBe(true);
    expect(reschedulePolicy(at(1.5), config, now)).toMatchObject({ allowed: false, reason: expect.stringMatching(/gọi cửa hàng/) });
  });
  it('hạn chuyển phí giữ lịch là 30 phút sau khi gửi yêu cầu', () => {
    expect(depositDeadline({ createdAt: '2026-10-30T01:00:00.000Z' }, config)).toBe('2026-10-30T01:30:00.000Z');
  });
});

describe('Khung giờ đặt lịch', () => {
  const now = new Date(2026, 9, 30, 8, 0).getTime();
  it('chặn khung giờ quá sát và ngoài giờ phục vụ', () => {
    expect(validateSlot(new Date(2026, 9, 30, 9, 0).toISOString(), config, now)).toMatch(/ít nhất 2 giờ/);
    expect(validateSlot(new Date(2026, 9, 30, 21, 0).toISOString(), config, now)).toMatch(/giờ phục vụ/);
    expect(validateSlot(new Date(2026, 9, 30, 14, 0).toISOString(), config, now)).toBeNull();
  });
});

describe('BR-04 và BR-05 điều phối', () => {
  const base = new Date(2026, 9, 30, 9, 0).toISOString();
  const busy = [{ id: 'A', status: STATUS.KTV_DA_NHAN, estimatedMinutes: 60, assignment: { techId: 'k1', appointmentAt: base } }];
  it('phát hiện chồng lịch có tính thời gian đệm', () => {
    expect(hasConflict('k1', new Date(2026, 9, 30, 10, 15).toISOString(), 60, busy, config)).toBe(true);
    expect(hasConflict('k1', new Date(2026, 9, 30, 11, 30).toISOString(), 60, busy, config)).toBe(false);
    expect(hasConflict('k2', base, 60, busy, config)).toBe(false);
  });
  it('xếp KTV đúng kỹ năng và khu vực lên trước, KTV trùng lịch xuống cuối', () => {
    const technicians = [
      { id: 'k1', active: true, skills: ['VIRUS'], areas: ['Bến Thành'], rating: 5 },
      { id: 'k2', active: true, skills: ['VIRUS'], areas: ['Gia Định'], rating: 4.2 },
      { id: 'k3', active: true, skills: ['MANG'], areas: ['Bến Thành'], rating: 4.9 },
    ];
    const ticket = { id: 'T', categoryCode: 'VIRUS', ward: 'Bến Thành', estimatedMinutes: 60 };
    const ranked = rankTechnicians({ ticket, technicians, tickets: busy, config, appointmentAt: base });
    expect(ranked.map((r) => r.tech.id)).toEqual(['k2', 'k3', 'k1']);
    expect(ranked[2].conflict).toBe(true);
  });
});

describe('UC18 lịch làm việc của KTV', () => {
  const schedule = { workDays: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', daysOff: ['2026-11-02'] };
  const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).toISOString();
  it('nhận ra lịch hẹn ngoài ngày, giờ làm và ngày nghỉ', () => {
    expect(offDuty(schedule, at(3, 9), 60)).toBe(false);
    expect(offDuty(schedule, at(3, 16, 30), 60)).toBe(true);
    expect(offDuty(schedule, at(3, 7, 30), 60)).toBe(true);
    expect(offDuty(schedule, at(1, 9), 60)).toBe(true);
    expect(offDuty(schedule, at(2, 9), 60)).toBe(true);
  });
  it('KTV ngoài lịch làm việc xếp cuối dù đúng kỹ năng và khu vực', () => {
    const technicians = [
      { id: 'k1', active: true, skills: ['VIRUS'], areas: ['Bến Thành'], rating: 5, schedule },
      { id: 'k2', active: true, skills: ['MANG'], areas: ['Gia Định'], rating: 4 },
    ];
    const ticket = { id: 'T', categoryCode: 'VIRUS', ward: 'Bến Thành', estimatedMinutes: 60 };
    const ranked = rankTechnicians({ ticket, technicians, tickets: [], config, appointmentAt: at(2, 9) });
    expect(ranked.map((r) => [r.tech.id, r.offDuty])).toEqual([['k2', false], ['k1', true]]);
  });
  it('kiểm tra dữ liệu lịch và hiển thị gọn', () => {
    expect(validateSchedule({ ...schedule, workDays: [] })).toMatch(/ít nhất một ngày/);
    expect(validateSchedule({ ...schedule, start: '18:00' })).toMatch(/trước giờ kết thúc/);
    expect(validateSchedule(schedule)).toBeNull();
    expect(formatSchedule(schedule)).toBe('T2–T6, 08:00–17:00');
    expect(formatSchedule({ ...schedule, workDays: [1, 3, 5] })).toBe('T2, T4, T6, 08:00–17:00');
  });
});

describe('BR-02 số tiền phải trả', () => {
  const item = (price, selected = true) => ({ unitPrice: price, qty: 1, selected });
  it('tính tổng các hạng mục đã duyệt, gồm báo giá bổ sung', () => {
    const t = { quotes: [
      { type: 'CHINH', status: 'DUYET_MOT_PHAN', items: [item(300000), item(100000, false)] },
      { type: 'BO_SUNG', status: 'DA_DUYET', items: [item(80000)] },
    ] };
    expect(amountDue(t, config)).toBe(380000);
  });
  it('thu phí khảo sát khi khách từ chối báo giá chính', () => {
    expect(amountDue({ quotes: [{ type: 'CHINH', status: 'TU_CHOI', items: [item(300000)] }] }, config)).toBe(50000);
  });
  it('trừ phí giữ lịch đã trả vào số tiền phải trả', () => {
    const deposit = { amount: 50000, status: 'DA_XAC_NHAN' };
    expect(amountDue({ deposit, quotes: [{ type: 'CHINH', status: 'DA_DUYET', items: [item(300000)] }] }, config)).toBe(250000);
    expect(amountDue({ deposit, quotes: [{ type: 'CHINH', status: 'TU_CHOI', items: [item(300000)] }] }, config)).toBe(0);
  });
});

describe('BR-07, BR-10, BR-11', () => {
  const now = new Date('2026-10-30T08:00:00Z').getTime();
  it('bảo hành hết hạn thì không hợp lệ', () => {
    expect(warrantyStatus({ endAt: '2026-10-29T00:00:00Z' }, now).valid).toBe(false);
    expect(warrantyStatus({ endAt: '2026-11-05T00:00:00Z' }, now)).toMatchObject({ valid: true });
  });
  it('chỉ đánh giá một lần, trong 7 ngày, 1–2 sao phải có lý do', () => {
    const done = { status: STATUS.HOAN_TAT, completedAt: new Date(now - 2 * 24 * HOUR).toISOString() };
    expect(reviewPolicy(done, config, now).allowed).toBe(true);
    expect(reviewPolicy({ ...done, review: { stars: 5 } }, config, now).allowed).toBe(false);
    expect(reviewPolicy({ ...done, completedAt: new Date(now - 8 * 24 * HOUR).toISOString() }, config, now).allowed).toBe(false);
    expect(validateReview(2, '')).toMatch(/lý do/);
    expect(validateReview(4, '')).toBeNull();
  });
  it('cần ảnh trước và sau mới báo hoàn thành', () => {
    expect(canComplete({ photosBefore: ['a'], photosAfter: [] })).toBe(false);
    expect(canComplete({ photosBefore: ['a'], photosAfter: ['b'] })).toBe(true);
  });
});

describe('UC05 phân loại sự cố', () => {
  it('ẩn dữ liệu cá nhân trước khi gửi đi', () => {
    const out = redactPersonalData('Gọi 0909 123 456 hoặc a.b@gmail.com, mật khẩu: abc123');
    expect(out).not.toMatch(/0909|gmail|abc123/);
  });
  it('nhận đúng loại sự cố phổ biến', () => {
    expect(classifyIssue('Máy bị virus, hiện quảng cáo liên tục').categoryCode).toBe('VIRUS');
    expect(classifyIssue('Wifi mất kết nối, router chớp đèn đỏ').categoryCode).toBe('MANG');
    expect(classifyIssue('Laptop không lên nguồn, cần gấp').urgency).toBe('CAO');
    expect(classifyIssue('abc xyz').confidence).toBeLessThan(0.6);
  });
});

describe('UC21 kỳ báo cáo', () => {
  it('khoảng ngày tùy chọn tính cả hai đầu, kỳ trước cùng độ dài', () => {
    const p = reportPeriod({ from: '2026-10-05', to: '2026-10-11' });
    expect(p.kind).toBe('range');
    expect([p.start, p.end, p.prevStart]).toEqual([new Date(2026, 9, 5), new Date(2026, 9, 12), new Date(2026, 8, 28)]);
  });
});
