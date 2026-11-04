import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import { WORKBOOK_OPTIONS, reportFileName, reportSheets, summarizeExport } from './reportExport.js';

const at = (month, day, hour = 9) => new Date(2026, month - 1, day, hour).toISOString();
const paid = (method, status, amount) => ({ amount, method, status, paidAt: at(10, 20, 12), confirmedAt: null, reconciledAt: null });
const applied = { depositApplied: 50000, deposit: { amount: 50000, status: 'DA_TRU', confirmedAt: at(10, 10, 10), settledAt: at(10, 12) } };
const ticket = (id, extra) => ({
  id, createdAt: at(10, 10), completedAt: null, customer: 'Khách mẫu', ward: 'Bến Thành', category: 'Virus và mã độc', urgency: 'TRUNG_BINH',
  status: 'HOAN_TAT', isWarranty: false, techId: 'k1', appointmentAt: at(10, 11), serviceAmount: 0, partsAmount: 0, surveyFee: 0,
  parts: [], amount: null, depositApplied: 0, deposit: null, cancel: null, payment: null, review: null, assignments: [], ...extra,
});

const data = {
  period: { kind: 'month', from: at(10, 1, 0), to: at(11, 1, 0) },
  payroll: { baseSalary: 5000000, commissionPercent: 30 },
  technicians: [{ id: 'k1', name: 'Nguyễn Văn An', active: true }, { id: 'k2', name: 'Lê Hoàng Phúc', active: true }, { id: 'k3', name: 'Đã nghỉ', active: false }],
  tickets: [
    ticket('A', {
      ...applied, completedAt: at(10, 12), serviceAmount: 300000, partsAmount: 1200000, amount: 1500000, payment: paid('TIEN_MAT', 'DA_DOI_SOAT', 1450000),
      parts: [{ name: 'SSD 512GB', qty: 1, unitPrice: 1200000 }], review: { stars: 5, comment: '', at: at(10, 13) },
      assignments: [{ techId: 'k2', assignedAt: at(10, 10, 10), result: 'TU_CHOI' }, { techId: 'k1', assignedAt: at(10, 10, 11), result: 'NHAN' }],
    }),
    ticket('B', { ...applied, completedAt: at(10, 15), surveyFee: 50000, amount: 50000, payment: paid(null, 'MIEN_PHI', 0), review: { stars: 2, comment: 'Chờ lâu', at: at(10, 16) } }),
    ticket('C', { completedAt: at(10, 18), isWarranty: true, amount: 0, payment: paid(null, 'MIEN_PHI', 0) }),
    ticket('D', {
      status: 'DA_HUY', techId: null, deposit: { amount: 50000, status: 'KHONG_HOAN', confirmedAt: at(10, 10, 10), settledAt: at(10, 12, 15) },
      cancel: { byName: 'Khách mẫu', reason: 'Đổi ý', fee: 50000, at: at(10, 12, 15) },
    }),
    ticket('E', { createdAt: at(9, 20), completedAt: at(9, 25), techId: 'k2', serviceAmount: 200000, amount: 200000, ...applied, payment: paid('TIEN_MAT', 'DA_THU', 150000) }),
  ],
};
const report = {
  period: data.period, revenue: 1600000, forfeitedDeposits: 50000, revenuePrev: 200000, done: 3, donePrev: 1, avgHours: 60, avgHoursPrev: 120, rating: 3.5, reviewCount: 2,
  cancelled: 1, total: 4, byDay: [{ date: at(10, 12, 0), revenue: 1550000 }, { date: at(10, 15, 0), revenue: 50000 }],
  byStatus: [{ status: 'HOAN_TAT', count: 3 }, { status: 'DA_HUY', count: 1 }], byCategory: [], byTech: [],
};
const now = new Date(2026, 10, 2, 8);

describe('UC21 xuất báo cáo Excel', () => {
  const s = summarizeExport(data, now);
  const sheets = reportSheets({ report, data, now });
  const sheet = (name) => sheets.find((x) => x.sheet === name).data;
  const row = (name, first) => sheet(name).find((r) => [r[0], r[0]?.value, r[1], r[1]?.value].includes(first));
  const values = (r) => r.map((c) => (c && typeof c === 'object' && 'value' in c ? c.value : c));
  const body = (name, header) => {
    const rows = sheet(name);
    return rows.slice(rows.findIndex((r) => r[0]?.value === header) + 1);
  };

  it('doanh thu gồm phiếu hoàn tất và phí giữ lịch không hoàn; lương không tính linh kiện và phí giữ lịch không hoàn', () => {
    expect(s.totals).toMatchObject({ revenue: 1600000, jobs: 1550000, service: 300000, survey: 50000, parts: 1200000, forfeit: 50000, prepaid: 100000, cash: 1450000, transfer: 150000 });
    const [an, phuc] = s.technicians;
    expect(s.technicians.map((k) => k.id)).toEqual(['k1', 'k2']);
    expect(an).toMatchObject({ done: 3, warranty: 1, base: 350000, commission: 105000, baseSalary: 5000000, salary: 5105000 });
    expect(phuc).toMatchObject({ done: 0, commission: 0, salary: 5000000, cashHeld: 150000, given: 1, declined: 1, acceptRate: 0 });
    expect(s.totals.salary).toBe(10105000);
  });

  it('kỳ không trọn tháng chỉ tính hoa hồng', () => {
    const days = summarizeExport({ ...data, period: { kind: 'days', from: at(10, 1, 0), to: at(10, 31, 0) } }, now);
    expect(days.technicians[0]).toMatchObject({ commission: 105000, baseSalary: 0, salary: 105000 });
    expect(reportSheets({ report, data: { ...data, period: { kind: 'days', from: at(10, 1, 0), to: at(10, 31, 0) } }, now })[3].sheet).toBe('Hoa hồng KTV');
  });

  it('đủ 10 sheet, bảng lương có dòng tổng cộng khớp số liệu', () => {
    expect(sheets.map((x) => x.sheet)).toEqual(['Tổng quan', 'Doanh thu theo ngày', 'Theo loại sự cố', 'Bảng lương KTV', 'Hiệu suất KTV',
      'Chi tiết công việc KTV', 'Thanh toán và đối soát', 'Linh kiện đã dùng', 'Đánh giá của khách', 'Danh sách phiếu']);
    expect(sheets.every((x) => x.sheet.length <= 31)).toBe(true);
    expect(values(row('Bảng lương KTV', 'Nguyễn Văn An'))).toEqual([1, 'Nguyễn Văn An', 3, 1, 300000, 50000, 350000, 105000, 5000000, 5105000, 0, null]);
    expect(values(row('Bảng lương KTV', 'Tổng cộng')).slice(7)).toEqual([105000, 10000000, 10105000, 150000, null]);
    expect(sheet('Bảng lương KTV')[0][0]).toMatchObject({ value: 'BẢNG LƯƠNG KỸ THUẬT VIÊN THÁNG 10/2026', columnSpan: 12 });
    expect(sheet('Bảng lương KTV').some((r) => r[1]?.value === 'Người lập bảng')).toBe(true);
  });

  it('chi tiết công việc có dòng cộng từng kỹ thuật viên để đối chiếu lương', () => {
    const subtotal = values(row('Chi tiết công việc KTV', 'Cộng Nguyễn Văn An'));
    expect(subtotal[1]).toBe('3 phiếu');
    expect(subtotal.slice(6, 11)).toEqual([300000, 50000, 1200000, 1550000, 100000]);
    expect(subtotal.slice(13, 15)).toEqual([350000, 105000]);
  });

  it('các sheet phụ: đối soát, linh kiện, đánh giá thấp lên trước, danh sách phiếu tạo trong kỳ', () => {
    expect(values(row('Thanh toán và đối soát', 'Tiền mặt kỹ thuật viên đã thu, chưa đối soát'))).toEqual(['Tiền mặt kỹ thuật viên đã thu, chưa đối soát', 1, 150000]);
    expect(values(row('Thanh toán và đối soát', 'D')).slice(0, 6)).toEqual(['D', 'Khách mẫu', 'Khách mẫu', expect.any(Date), 50000, 'Không hoàn']);
    expect(values(row('Linh kiện đã dùng', 'SSD 512GB'))).toEqual(['SSD 512GB', 1, 1200000, 1]);
    expect(values(body('Đánh giá của khách', 'Đánh giá lúc')[0]).slice(1, 6)).toEqual(['B', 'Nguyễn Văn An', 'Khách mẫu', 2, 'Chờ lâu']);
    expect(body('Danh sách phiếu', 'Mã phiếu')).toHaveLength(4);
    expect(values(row('Doanh thu theo ngày', 'Tổng cộng')).slice(1)).toEqual([3, 300000, 50000, 1200000, 50000, 1450000, 150000, 1600000]);
    expect(values(row('Theo loại sự cố', 'Tổng cộng')).slice(7, 9)).toEqual([50000, 1600000]);
  });

  it('ngày giờ trong file trùng giờ hiển thị trên màn hình', () => {
    const created = body('Danh sách phiếu', 'Mã phiếu')[0][1].value;
    expect([created.getUTCDate(), created.getUTCHours()]).toEqual([10, 9]);
  });

  it('bảng có kẻ khung, dòng tiêu đề in đậm, cố định phần đầu khi cuộn', () => {
    const tickets = sheets.find((x) => x.sheet === 'Danh sách phiếu');
    const header = body('Danh sách phiếu', 'Mã phiếu');
    expect(tickets.stickyRowsCount).toBe(sheet('Danh sách phiếu').length - header.length);
    expect(header[0].every((c) => c.borderStyle === 'thin')).toBe(true);
    expect(sheet('Danh sách phiếu')[tickets.stickyRowsCount - 1].every((c) => c.fontWeight === 'bold' && c.align === 'center')).toBe(true);
  });

  it('ghi được ra file xlsx', async () => {
    const buffer = await writeExcelFile(sheets, WORKBOOK_OPTIONS).toBuffer();
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(reportFileName(data, now)).toBe('bao-cao-thang-10-2026.xlsx');
  });
});
