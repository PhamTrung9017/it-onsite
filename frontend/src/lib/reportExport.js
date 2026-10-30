/** UC21: file Excel báo cáo thống kê gồm sheet tổng hợp và sheet danh sách phiếu trong kỳ. */
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL } from './ticketStatus.js';
import { URGENCY_LABEL } from './classifier.js';
import { formatDate, formatDateTime, toDateInput } from './format.js';

const MONEY = '#,##0';
const DECIMAL = '0.0';
const DATE = 'dd/mm/yyyy';
const DATE_TIME = 'dd/mm/yyyy hh:mm';
export const WORKBOOK_OPTIONS = { fontFamily: 'Calibri', fontSize: 11 };

const bold = (value) => ({ value, fontWeight: 'bold' });
const money = (value) => (value === null || value === undefined ? null : { value, type: Number, format: MONEY });
const decimal = (value) => (value === null || value === undefined ? null : { value, type: Number, format: DECIMAL });

/** Excel không có múi giờ: ghi đúng giờ hiển thị trên màn hình (giờ của trình duyệt). */
function localDate(value, format) {
  if (!value) return null;
  const d = new Date(value);
  return { value: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())), type: Date, format };
}

function summarySheet(report, days, now) {
  const from = new Date(now.getTime() - days * 86400000);
  const rows = [
    [bold('Báo cáo thống kê IT OnSite')],
    ['Kỳ báo cáo', `${formatDate(from)} – ${formatDate(now)} (${days} ngày)`],
    ['Thời điểm xuất', formatDateTime(now)],
    [],
    [bold('Chỉ số'), bold('Kỳ này'), bold('Kỳ trước')],
    ['Doanh thu (đồng)', money(report.revenue), money(report.revenuePrev)],
    ['Phiếu hoàn tất', report.done, report.donePrev],
    ['Thời gian xử lý trung bình (giờ)', decimal(report.avgHours), decimal(report.avgHoursPrev)],
    ['Đánh giá trung bình (sao)', decimal(report.rating), null],
    ['Lượt đánh giá', report.reviewCount, null],
    ['Tổng số phiếu tạo', report.total, null],
    ['Phiếu đã hủy', report.cancelled, null],
    [],
    [bold('Phiếu theo trạng thái'), bold('Số phiếu')],
    ...report.byStatus.map((s) => [STATUS_LABEL[s.status], s.count]),
    [],
    [bold('Loại sự cố'), bold('Số phiếu')],
    ...report.byCategory.map((c) => [c.name, c.count]),
    [],
    [bold('Kỹ thuật viên'), bold('Phiếu hoàn tất'), bold('Doanh thu (đồng)'), bold('Đánh giá trung bình (sao)')],
    ...report.byTech.map((t) => [t.name, t.done, money(t.revenue), decimal(t.rating)]),
    [],
    [bold('Ngày'), bold('Doanh thu (đồng)')],
    ...report.byDay.map((d) => [localDate(d.date, DATE), money(d.revenue)]),
  ];
  return { sheet: 'Tổng hợp', data: rows, columns: [{ width: 36 }, { width: 18 }, { width: 18 }, { width: 26 }] };
}

const TICKET_COLUMNS = [
  ['Mã phiếu', 20], ['Ngày tạo', 17], ['Khách hàng', 24], ['Phường', 16], ['Loại sự cố', 30], ['Mức khẩn', 11],
  ['Trạng thái', 18], ['Kỹ thuật viên', 22], ['Giờ hẹn', 17], ['Hoàn tất lúc', 17], ['Số tiền (đồng)', 15],
  ['Hình thức thanh toán', 21], ['Tình trạng thanh toán', 26], ['Đánh giá (sao)', 14],
];

function ticketSheet(rows) {
  const data = [
    TICKET_COLUMNS.map(([title]) => bold(title)),
    ...rows.map((r) => [
      r.id,
      localDate(r.createdAt, DATE_TIME),
      r.customer,
      r.ward,
      r.category,
      URGENCY_LABEL[r.urgency] || r.urgency,
      STATUS_LABEL[r.status] || r.status,
      r.technician || null,
      localDate(r.appointmentAt, DATE_TIME),
      localDate(r.completedAt, DATE_TIME),
      money(r.amount),
      PAYMENT_METHOD_LABEL[r.paymentMethod] || null,
      PAYMENT_STATUS_LABEL[r.paymentStatus] || null,
      r.stars ?? null,
    ]),
  ];
  return { sheet: 'Danh sách phiếu', data, columns: TICKET_COLUMNS.map(([, width]) => ({ width })), stickyRowsCount: 1 };
}

export function reportSheets({ report, rows, days, now = new Date() }) {
  return [summarySheet(report, days, now), ticketSheet(rows)];
}

export function reportFileName(days, now = new Date()) {
  return `bao-cao-${days}-ngay-${toDateInput(now)}.xlsx`;
}

export async function downloadReport({ report, rows, days }) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const now = new Date();
  await writeExcelFile(reportSheets({ report, rows, days, now }), WORKBOOK_OPTIONS).toFile(reportFileName(days, now));
}
