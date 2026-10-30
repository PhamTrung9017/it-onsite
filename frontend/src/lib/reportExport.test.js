import { describe, expect, it } from 'vitest';
import writeExcelFile from 'write-excel-file/node';
import { WORKBOOK_OPTIONS, reportFileName, reportSheets } from './reportExport.js';

const report = {
  revenue: 950000, revenuePrev: 400000, done: 2, donePrev: 1, avgHours: 26.25, avgHoursPrev: 30, rating: 4.5, reviewCount: 2,
  cancelled: 1, total: 3,
  byDay: [{ date: '2026-10-29T17:00:00.000Z', revenue: 0 }, { date: '2026-10-30T17:00:00.000Z', revenue: 950000 }],
  byStatus: [{ status: 'HOAN_TAT', count: 2 }, { status: 'DA_HUY', count: 1 }],
  byCategory: [{ name: 'Virus và mã độc', count: 2 }],
  byTech: [{ name: 'Nguyễn Văn An', done: 2, revenue: 950000, rating: 4.5 }],
};
const rows = [
  { id: 'YC-20261030-002', createdAt: '2026-10-30T02:00:00.000Z', customer: 'Nguyễn Văn Anh', ward: 'Bến Thành', category: 'Virus và mã độc', urgency: 'CAO', status: 'HOAN_TAT', technician: 'Nguyễn Văn An', appointmentAt: '2026-10-30T03:00:00.000Z', completedAt: '2026-10-30T05:30:00.000Z', amount: 650000, paymentMethod: 'TIEN_MAT', paymentStatus: 'DA_DOI_SOAT', stars: 5 },
  { id: 'YC-20261029-001', createdAt: '2026-10-29T02:00:00.000Z', customer: 'Trần Bình', ward: 'Gia Định', category: 'Virus và mã độc', urgency: 'TRUNG_BINH', status: 'DA_HUY', technician: '', appointmentAt: '2026-10-29T08:00:00.000Z', completedAt: null, amount: null, paymentMethod: null, paymentStatus: null, stars: null },
];

describe('UC21 xuất báo cáo Excel', () => {
  const now = new Date(2026, 9, 30, 15, 40);
  const [summary, tickets] = reportSheets({ report, rows, days: 30, now });

  it('sheet tổng hợp giữ nguyên số liệu của màn hình báo cáo', () => {
    expect(summary.sheet).toBe('Tổng hợp');
    const line = (label) => summary.data.find((r) => r[0] === label);
    expect(line('Doanh thu (đồng)').slice(1).map((c) => c.value)).toEqual([950000, 400000]);
    expect(line('Thời gian xử lý trung bình (giờ)')[1]).toMatchObject({ value: 26.25, format: '0.0' });
    expect(line('Đánh giá trung bình (sao)')[1].value).toBe(4.5);
    expect(line('Phiếu hoàn tất').slice(1)).toEqual([2, 1]);
    expect(line('Hoàn tất')[1]).toBe(2);
  });

  it('sheet danh sách phiếu có đủ cột, nhãn tiếng Việt và ô trống khi chưa có dữ liệu', () => {
    expect(tickets.sheet).toBe('Danh sách phiếu');
    expect(tickets.data).toHaveLength(rows.length + 1);
    expect(tickets.data.every((r) => r.length === 14)).toBe(true);
    const [first, second] = tickets.data.slice(1);
    expect(first.slice(5, 7)).toEqual(['Cao', 'Hoàn tất']);
    expect(first[10]).toMatchObject({ value: 650000, format: '#,##0' });
    expect(first.slice(11)).toEqual(['Tiền mặt', 'Đã đối soát tiền mặt', 5]);
    expect(second.slice(9)).toEqual([null, null, null, null, null]);
  });

  it('ngày giờ trong file trùng với giờ hiển thị trên màn hình', () => {
    const created = tickets.data[1][1].value;
    const shown = new Date(rows[0].createdAt);
    expect([created.getUTCHours(), created.getUTCMinutes()]).toEqual([shown.getHours(), shown.getMinutes()]);
  });

  it('ghi được ra file xlsx', async () => {
    const buffer = await writeExcelFile(reportSheets({ report, rows, days: 30, now }), WORKBOOK_OPTIONS).toBuffer();
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(reportFileName(30, now)).toBe('bao-cao-30-ngay-2026-10-30.xlsx');
  });
});
