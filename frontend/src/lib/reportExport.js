/**
 * UC21: file Excel báo cáo cho chủ cửa hàng: tổng quan, doanh thu, bảng lương kỹ thuật viên, đối soát và danh sách phiếu.
 * Doanh thu và hoa hồng tính theo ngày hoàn tất phiếu; phí giữ lịch không hoàn của phiếu hủy tính theo ngày hủy;
 * số phiếu tạo, hủy tính theo ngày tạo.
 */
import { DEPOSIT_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS, STATUS_LABEL } from './ticketStatus.js';
import { URGENCY_LABEL } from './classifier.js';
import { formatDate, formatDateTime, toDateInput } from './format.js';

const MONEY = '#,##0';
const DECIMAL = '0.0';
const DATE = 'dd/mm/yyyy';
const DATE_TIME = 'dd/mm/yyyy hh:mm';
/** Khi in, mỗi sheet co vừa bề ngang một trang A4 (Excel: Fit All Columns on One Page). */
const fitToPageWidth = {
  files: {
    transform: {
      'xl/worksheets/sheet{id}.xml': {
        transform: (xml) => xml
          .replace(/<worksheet\b[^>]*>/, (open) => `${open}<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`)
          .replace(/<pageSetup\b/, '<pageSetup fitToWidth="1" fitToHeight="0"'),
      },
    },
  },
};
export const WORKBOOK_OPTIONS = { fontFamily: 'Calibri', fontSize: 11, features: [fitToPageWidth] };

const isBlank = (value) => value === null || value === undefined || Number.isNaN(value);
const money = (value, weight) => (isBlank(value) ? null : { value, type: Number, format: MONEY, fontWeight: weight });
const decimal = (value, weight) => (isBlank(value) ? null : { value, type: Number, format: DECIMAL, fontWeight: weight });
const count = (value, weight) => (isBlank(value) ? null : { value, type: Number, fontWeight: weight });
const sum = (list, pick) => list.reduce((s, x) => s + (pick(x) || 0), 0);
const average = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const percent = (part, whole) => (whole ? (part / whole) * 100 : null);
const hours = (t) => (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000;
/** Tiền khách trả khi hoàn tất, phí giữ lịch đã trả trước và được trừ vào tổng tiền, phí giữ lịch không hoàn. */
const paidAtEnd = (t) => t.payment?.amount || 0;
const prepaid = (t) => t.depositApplied || 0;
const forfeit = (t) => t.deposit?.amount || 0;

/** Excel không có múi giờ: ghi đúng giờ hiển thị trên màn hình (giờ của trình duyệt). */
function localDate(value, format = DATE_TIME) {
  if (!value) return null;
  const d = new Date(value);
  return { value: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())), type: Date, format };
}


const THIN = { borderStyle: 'thin' };

/** Ô có kẻ khung; giữ nguyên định dạng số, ngày của ô gốc. */
function framed(c, extra) {
  const base = c !== null && typeof c === 'object' && !(c instanceof Date) ? c : { value: c ?? null };
  return { alignVertical: 'center', ...base, ...THIN, ...extra };
}

/**
 * Bảng có khung: dòng tiêu đề in đậm, canh giữa, xuống dòng; dòng { strong: true, cells } in đậm (dòng cộng);
 * dòng tổng cộng cuối bảng in đậm, kẻ đậm phía trên.
 */
function table(headers, rows, total) {
  const width = headers.length;
  const pad = (cells) => Array.from({ length: width }, (_, i) => cells[i] ?? null);
  return [
    headers.map((h, i) => framed(h, { fontWeight: 'bold', align: 'center', wrap: true, ...(i === 0 ? { height: 32 } : {}) })),
    ...rows.map((r) => (Array.isArray(r) ? pad(r).map((c) => framed(c)) : pad(r.cells).map((c) => framed(c, { fontWeight: 'bold' })))),
    ...(total ? [pad(total).map((c) => framed(c, { fontWeight: 'bold', topBorderStyle: 'medium' }))] : []),
  ];
}

/** Phần đầu mỗi sheet: tên báo cáo in hoa, canh giữa trên toàn bộ bề ngang, các dòng thông tin kỳ báo cáo. */
function heading(title, lines, width) {
  return [
    [{ value: title.toUpperCase(), fontSize: 14, fontWeight: 'bold', align: 'center', alignVertical: 'center', columnSpan: width, height: 26 }],
    ...lines.map((line) => [{ value: line, fontStyle: 'italic', align: 'center', columnSpan: width }]),
    [],
  ];
}

const sectionTitle = (value) => [{ value, fontWeight: 'bold', fontSize: 12 }];

const commissionBase = (t) => t.serviceAmount + t.surveyFee;

/** Số liệu dùng chung cho các sheet, tính từ dữ liệu thô của từng phiếu. */
export function summarizeExport(data, now = new Date()) {
  const from = new Date(data.period.from);
  const to = new Date(data.period.to);
  const within = (value) => Boolean(value) && new Date(value) >= from && new Date(value) < to;
  const rate = data.payroll.commissionPercent;
  const isMonth = data.period.kind === 'month';
  const completed = data.tickets
    .filter((t) => t.status === STATUS.HOAN_TAT && within(t.completedAt))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const created = data.tickets.filter((t) => within(t.createdAt));
  const cashHeld = data.tickets.filter((t) => t.payment?.status === 'DA_THU');
  const forfeited = data.tickets.filter((t) => t.deposit?.status === 'KHONG_HOAN' && within(t.deposit.settledAt));

  const staff = data.technicians.filter((k) => k.active || completed.some((t) => t.techId === k.id));
  const technicians = staff.map((k) => {
    const jobs = completed.filter((t) => t.techId === k.id);
    const base = sum(jobs, commissionBase);
    const commission = Math.round((base * rate) / 100);
    const baseSalary = isMonth ? data.payroll.baseSalary : 0;
    const given = data.tickets.flatMap((t) => t.assignments).filter((a) => a.techId === k.id && within(a.assignedAt));
    const answered = given.filter((a) => a.result);
    const stars = jobs.filter((t) => t.review).map((t) => t.review.stars);
    return {
      id: k.id,
      name: k.name,
      jobs,
      done: jobs.length,
      warranty: jobs.filter((t) => t.isWarranty).length,
      service: sum(jobs, (t) => t.serviceAmount),
      survey: sum(jobs, (t) => t.surveyFee),
      parts: sum(jobs, (t) => t.partsAmount),
      revenue: sum(jobs, (t) => t.amount),
      base,
      commission,
      baseSalary,
      salary: baseSalary + commission,
      cashHeld: sum(cashHeld.filter((t) => t.techId === k.id), paidAtEnd),
      given: given.length,
      accepted: given.filter((a) => a.result === 'NHAN').length,
      declined: given.filter((a) => a.result === 'TU_CHOI').length,
      overdue: given.filter((a) => a.result === 'QUA_HAN').length,
      pending: given.length - answered.length,
      acceptRate: percent(given.filter((a) => a.result === 'NHAN').length, answered.length),
      avgHours: average(jobs.map(hours)),
      rating: average(stars),
      reviews: stars.length,
      lowReviews: stars.filter((s) => s <= 2).length,
    };
  });

  return {
    isMonth,
    rate,
    baseSalary: data.payroll.baseSalary,
    from,
    lastDay: new Date(to.getTime() - 1),
    finished: !isMonth || now >= new Date(from.getFullYear(), from.getMonth() + 1, 1),
    completed,
    created,
    cashHeld,
    forfeited,
    technicians,
    totals: {
      revenue: sum(completed, (t) => t.amount) + sum(forfeited, forfeit),
      jobs: sum(completed, (t) => t.amount),
      service: sum(completed, (t) => t.serviceAmount),
      survey: sum(completed, (t) => t.surveyFee),
      parts: sum(completed, (t) => t.partsAmount),
      forfeit: sum(forfeited, forfeit),
      prepaid: sum(completed, prepaid),
      cash: sum(completed.filter((t) => t.payment?.method === 'TIEN_MAT'), paidAtEnd),
      transfer: sum(completed.filter((t) => t.payment?.method === 'CHUYEN_KHOAN'), paidAtEnd) + sum(completed, prepaid) + sum(forfeited, forfeit),
      salary: sum(technicians, (k) => k.salary),
      commission: sum(technicians, (k) => k.commission),
    },
  };
}

function periodText(s) {
  if (s.isMonth) return `Tháng ${String(s.from.getMonth() + 1).padStart(2, '0')}/${s.from.getFullYear()}`;
  return `${formatDate(s.from)} – ${formatDate(s.lastDay)}`;
}

/** Dựng một sheet: phần đầu + nội dung; cố định phần đầu và dòng tiêu đề bảng đầu tiên khi cuộn. */
function makeSheet({ sheet, title, s, now, widths, body, freeze = true, landscape = true, extraLines = [] }) {
  const lines = [`Kỳ báo cáo: ${periodText(s)}${s.isMonth ? ` (${formatDate(s.from)} – ${formatDate(s.lastDay)})` : ''}`, ...extraLines, `Thời điểm xuất: ${formatDateTime(now)}`];
  const top = heading(title, lines, widths.length);
  return {
    sheet,
    data: [...top, ...body],
    columns: widths.map((width) => ({ width })),
    orientation: landscape ? 'landscape' : 'portrait',
    ...(freeze ? { stickyRowsCount: top.length + 1 } : {}),
  };
}

function overviewSheet(report, s, now) {
  const kpi = (label, cell, cur, prev) => {
    if (isBlank(prev)) return [label, cell(cur)];
    return [label, cell(cur), cell(prev), cell(cur - prev), decimal(percent(cur - prev, prev))];
  };
  const share = (value) => decimal(percent(value, s.totals.revenue));
  return makeSheet({
    sheet: 'Tổng quan',
    title: 'Báo cáo hoạt động dịch vụ',
    s,
    now,
    freeze: false,
    widths: [40, 18, 18, 16, 16],
    extraLines: ['Doanh thu, lương tính theo ngày hoàn tất phiếu; phí giữ lịch không hoàn tính theo ngày hủy; phiếu tạo, phiếu hủy tính theo ngày tạo'],
    body: [
      sectionTitle('1. Chỉ số chính'),
      ...table(['Chỉ số', 'Kỳ này', 'Kỳ trước', 'Chênh lệch', 'Thay đổi (%)'], [
        kpi('Doanh thu (đồng)', money, report.revenue, report.revenuePrev),
        kpi('Phiếu hoàn tất', count, report.done, report.donePrev),
        kpi('Thời gian xử lý trung bình (giờ)', decimal, report.done ? report.avgHours : null, report.done && report.donePrev ? report.avgHoursPrev : null),
        ['Đánh giá trung bình (sao)', decimal(report.rating)],
        ['Lượt đánh giá', count(report.reviewCount)],
        ['Phiếu tạo mới', count(report.total)],
        ['Phiếu đã hủy', count(report.cancelled)],
        ['Tỷ lệ hủy (%)', decimal(percent(report.cancelled, report.total))],
      ]),
      [],
      sectionTitle('2. Cơ cấu doanh thu'),
      ...table(['Khoản thu', 'Số tiền (đồng)', 'Tỷ trọng (%)'], [
        ['Tiền công dịch vụ', money(s.totals.service), share(s.totals.service)],
        ['Phí khảo sát', money(s.totals.survey), share(s.totals.survey)],
        ['Linh kiện', money(s.totals.parts), share(s.totals.parts)],
        ['Phí giữ lịch không hoàn (phiếu hủy)', money(s.totals.forfeit), share(s.totals.forfeit)],
      ], ['Tổng doanh thu', money(s.totals.revenue), s.totals.revenue ? decimal(100) : null]),
      [],
      sectionTitle('3. Hình thức thanh toán'),
      ...table(['Hình thức', 'Số tiền (đồng)', 'Tỷ trọng (%)'], [
        ['Tiền mặt', money(s.totals.cash), share(s.totals.cash)],
        ['Chuyển khoản VietQR (gồm phí giữ lịch)', money(s.totals.transfer), share(s.totals.transfer)],
      ], ['Tổng cộng', money(s.totals.cash + s.totals.transfer), s.totals.revenue ? decimal(100) : null]),
      [],
      sectionTitle(s.isMonth ? '4. Lương kỹ thuật viên' : '4. Hoa hồng kỹ thuật viên'),
      ...table(['Khoản', 'Số tiền (đồng)'], [
        ...(s.isMonth ? [['Tổng lương cứng', money(sum(s.technicians, (k) => k.baseSalary))]] : []),
        ['Tổng hoa hồng', money(s.totals.commission)],
        ...(s.isMonth ? [{ strong: true, cells: ['Tổng lương phải trả', money(s.totals.salary)] }] : []),
        ['Tiền mặt kỹ thuật viên đang giữ, chưa đối soát', money(sum(s.cashHeld, paidAtEnd))],
      ]),
      [],
      sectionTitle('5. Phiếu theo trạng thái'),
      ...table(['Trạng thái', 'Số phiếu'], report.byStatus.map((x) => [STATUS_LABEL[x.status], count(x.count)]),
        ['Tổng cộng', count(sum(report.byStatus, (x) => x.count))]),
    ],
  });
}

function dailySheet(report, s, now) {
  const rows = report.byDay.map((d) => {
    const day = toDateInput(d.date);
    const jobs = s.completed.filter((t) => toDateInput(t.completedAt) === day);
    const lost = s.forfeited.filter((t) => toDateInput(t.deposit.settledAt) === day);
    return [
      localDate(d.date, DATE), count(jobs.length), money(sum(jobs, (t) => t.serviceAmount)), money(sum(jobs, (t) => t.surveyFee)),
      money(sum(jobs, (t) => t.partsAmount)), money(sum(lost, forfeit)),
      money(sum(jobs.filter((t) => t.payment?.method === 'TIEN_MAT'), paidAtEnd)),
      money(sum(jobs.filter((t) => t.payment?.method === 'CHUYEN_KHOAN'), paidAtEnd) + sum(jobs, prepaid) + sum(lost, forfeit)),
      money(sum(jobs, (t) => t.amount) + sum(lost, forfeit)),
    ];
  });
  return makeSheet({
    sheet: 'Doanh thu theo ngày',
    title: 'Doanh thu theo ngày',
    s,
    now,
    widths: [13, 12, 18, 14, 14, 16, 15, 15, 18],
    body: table(['Ngày', 'Phiếu hoàn tất', 'Tiền công dịch vụ', 'Phí khảo sát', 'Linh kiện', 'Phí giữ lịch không hoàn', 'Tiền mặt', 'Chuyển khoản', 'Tổng doanh thu'], rows,
      ['Tổng cộng', count(s.completed.length), money(s.totals.service), money(s.totals.survey), money(s.totals.parts), money(s.totals.forfeit),
        money(s.totals.cash), money(s.totals.transfer), money(s.totals.revenue)]),
  });
}

function categorySheet(s, now) {
  const names = [...new Set([...s.created, ...s.completed, ...s.forfeited].map((t) => t.category))].filter(Boolean);
  const rows = names.map((name) => {
    const made = s.created.filter((t) => t.category === name);
    const jobs = s.completed.filter((t) => t.category === name);
    const lost = sum(s.forfeited.filter((t) => t.category === name), forfeit);
    return { name, made: made.length, done: jobs.length, cancelled: made.filter((t) => t.status === STATUS.DA_HUY).length,
      service: sum(jobs, (t) => t.serviceAmount), survey: sum(jobs, (t) => t.surveyFee), parts: sum(jobs, (t) => t.partsAmount), lost,
      revenue: sum(jobs, (t) => t.amount) + lost };
  }).sort((a, b) => b.revenue - a.revenue || b.made - a.made);
  return makeSheet({
    sheet: 'Theo loại sự cố',
    title: 'Doanh thu và số phiếu theo loại sự cố',
    s,
    now,
    widths: [32, 10, 10, 10, 18, 14, 14, 16, 16, 12],
    body: table(['Loại sự cố', 'Phiếu tạo', 'Hoàn tất', 'Đã hủy', 'Tiền công dịch vụ', 'Phí khảo sát', 'Linh kiện', 'Phí giữ lịch không hoàn', 'Doanh thu', 'Tỷ trọng (%)'],
      rows.map((r) => [r.name, count(r.made), count(r.done), count(r.cancelled), money(r.service), money(r.survey), money(r.parts), money(r.lost), money(r.revenue),
        decimal(percent(r.revenue, s.totals.revenue))]),
      ['Tổng cộng', count(s.created.length), count(s.completed.length), count(sum(rows, (r) => r.cancelled)), money(s.totals.service), money(s.totals.survey),
        money(s.totals.parts), money(s.totals.forfeit), money(s.totals.revenue), s.totals.revenue ? decimal(100) : null]),
  });
}

function payrollSheet(s, now) {
  const month = s.isMonth;
  const headers = ['STT', 'Kỹ thuật viên', 'Phiếu hoàn tất', 'Trong đó bảo hành', 'Tiền công dịch vụ', 'Phí khảo sát', 'Tính hoa hồng', 'Hoa hồng',
    ...(month ? ['Lương cứng', 'Tổng lương'] : []), 'Tiền mặt đang giữ', ...(month ? ['Ký nhận'] : [])];
  const rows = s.technicians.map((k, i) => [
    { value: i + 1, type: Number, align: 'center' }, k.name, count(k.done), count(k.warranty), money(k.service), money(k.survey), money(k.base), money(k.commission),
    ...(month ? [money(k.baseSalary), money(k.salary, 'bold')] : []), money(k.cashHeld), ...(month ? [{ value: null, height: 30 }] : []),
  ]);
  const total = [null, 'Tổng cộng', count(sum(s.technicians, (k) => k.done)), count(sum(s.technicians, (k) => k.warranty)),
    money(sum(s.technicians, (k) => k.service)), money(sum(s.technicians, (k) => k.survey)), money(sum(s.technicians, (k) => k.base)), money(s.totals.commission),
    ...(month ? [money(sum(s.technicians, (k) => k.baseSalary)), money(s.totals.salary)] : []), money(sum(s.technicians, (k) => k.cashHeld)), null];
  const widths = [6, 22, 10, 11, 15, 12, 14, 13, ...(month ? [13, 14] : []), 14, ...(month ? [16] : [])];
  const half = Math.floor(widths.length / 2);
  const sign = (left, right, style) => [null, { value: left, align: 'center', columnSpan: half - 1, ...style }, ...Array(half - 2).fill(null),
    { value: right, align: 'center', columnSpan: widths.length - half, ...style }];
  return makeSheet({
    sheet: month ? 'Bảng lương KTV' : 'Hoa hồng KTV',
    title: month ? `Bảng lương kỹ thuật viên ${periodText(s).toLowerCase()}` : 'Hoa hồng kỹ thuật viên',
    s,
    now,
    widths,
    freeze: false,
    extraLines: [
      month ? `Lương cứng ${s.baseSalary.toLocaleString('vi-VN')} đồng/tháng, đã gồm hỗ trợ đi lại cho phiếu bảo hành` : 'Kỳ không trọn tháng nên chưa tính lương cứng',
      `Hoa hồng ${String(s.rate).replace('.', ',')}% trên tiền công dịch vụ và phí khảo sát của phiếu hoàn tất, không tính linh kiện`,
      ...(month && !s.finished ? ['Tháng chưa kết thúc, số liệu tạm tính đến thời điểm xuất'] : []),
    ],
    body: [
      ...table(headers, rows, total),
      ...(month ? [[], [], sign('Người lập bảng', 'Chủ cửa hàng duyệt', { fontWeight: 'bold' }), sign('(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)', { fontStyle: 'italic' })] : []),
    ],
  });
}

function performanceSheet(s, now) {
  return makeSheet({
    sheet: 'Hiệu suất KTV',
    title: 'Hiệu suất kỹ thuật viên',
    s,
    now,
    widths: [24, 11, 10, 10, 10, 11, 12, 11, 14, 12, 11, 12],
    body: table(['Kỹ thuật viên', 'Lượt được giao', 'Đã nhận', 'Từ chối', 'Quá hạn', 'Chưa phản hồi', 'Tỷ lệ nhận việc (%)', 'Phiếu hoàn tất',
      'Thời gian xử lý TB (giờ)', 'Đánh giá TB (sao)', 'Lượt đánh giá', 'Đánh giá ≤ 2 sao'],
    s.technicians.map((k) => [k.name, count(k.given), count(k.accepted), count(k.declined), count(k.overdue), count(k.pending), decimal(k.acceptRate),
      count(k.done), decimal(k.avgHours), decimal(k.rating), count(k.reviews), count(k.lowReviews)])),
  });
}

function jobsSheet(s, now) {
  const rows = [];
  s.technicians.filter((k) => k.done).forEach((k) => {
    k.jobs.forEach((t) => rows.push([
      k.name, t.id, localDate(t.completedAt), t.category, t.ward, t.isWarranty ? 'Có' : null, money(t.serviceAmount), money(t.surveyFee),
      money(t.partsAmount), money(t.amount), money(prepaid(t)), PAYMENT_METHOD_LABEL[t.payment?.method] || null,
      PAYMENT_STATUS_LABEL[t.payment?.status] || null, money(commissionBase(t)), money((commissionBase(t) * s.rate) / 100), count(t.review?.stars),
    ]));
    rows.push({ strong: true, cells: [`Cộng ${k.name}`, `${k.done} phiếu`, null, null, null, count(k.warranty), money(k.service), money(k.survey),
      money(k.parts), money(k.revenue), money(sum(k.jobs, prepaid)), null, null, money(k.base), money(k.commission), null] });
  });
  return makeSheet({
    sheet: 'Chi tiết công việc KTV',
    title: 'Chi tiết công việc kỹ thuật viên',
    s,
    now,
    widths: [24, 18, 17, 28, 15, 9, 14, 12, 12, 13, 13, 19, 24, 14, 12, 10],
    body: table(['Kỹ thuật viên', 'Mã phiếu', 'Hoàn tất lúc', 'Loại sự cố', 'Phường', 'Bảo hành', 'Tiền công dịch vụ', 'Phí khảo sát', 'Linh kiện',
      'Tổng tiền', 'Trong đó trả trước', 'Hình thức thanh toán', 'Tình trạng thanh toán', 'Tính hoa hồng', 'Hoa hồng', 'Đánh giá (sao)'], rows,
    ['Tổng cộng', `${s.completed.length} phiếu`, null, null, null, count(sum(s.technicians, (k) => k.warranty)), money(s.totals.service), money(s.totals.survey),
      money(s.totals.parts), money(s.totals.jobs), money(s.totals.prepaid), null, null, money(sum(s.technicians, (k) => k.base)), money(s.totals.commission), null]),
  });
}

function paymentSheet(s, data, now) {
  const techName = (id) => data.technicians.find((k) => k.id === id)?.name || null;
  const open = data.tickets.filter((t) => ['CHO_XAC_NHAN', 'DA_THU', 'CHO_THANH_TOAN'].includes(t.payment?.status));
  const done = s.completed.filter((t) => t.payment && !open.includes(t));
  const order = { CHO_XAC_NHAN: 0, DA_THU: 1, CHO_THANH_TOAN: 2 };
  const list = [...open.sort((a, b) => order[a.payment.status] - order[b.payment.status]), ...done];
  const of = (status) => data.tickets.filter((t) => t.payment?.status === status);
  const deposits = (status) => data.tickets.filter((t) => t.deposit?.status === status);
  const line = (label, tickets, pick = paidAtEnd) => [label, count(tickets.length), money(sum(tickets, pick))];
  const cancelled = data.tickets
    .filter((t) => t.status === STATUS.DA_HUY && ['CHO_HOAN', 'DA_HOAN', 'KHONG_HOAN'].includes(t.deposit?.status)
      && (t.deposit.status === 'CHO_HOAN' || (t.deposit.settledAt && new Date(t.deposit.settledAt) >= s.from && new Date(t.deposit.settledAt) <= s.lastDay)))
    .sort((a, b) => (a.cancel?.at || '').localeCompare(b.cancel?.at || ''));
  return makeSheet({
    sheet: 'Thanh toán và đối soát',
    title: 'Thanh toán và đối soát',
    s,
    now,
    freeze: false,
    widths: [40, 20, 22, 14, 14, 20, 25, 17, 17, 17],
    body: [
      sectionTitle('1. Việc cần xử lý'),
      ...table(['Nội dung', 'Số phiếu', 'Số tiền (đồng)'], [
        line('Phí giữ lịch khách báo đã chuyển, chờ xác nhận', deposits('CHO_XAC_NHAN'), forfeit),
        line('Phí giữ lịch cần chuyển trả cho khách', deposits('CHO_HOAN'), forfeit),
        line('Chuyển khoản chờ điều phối viên xác nhận', of('CHO_XAC_NHAN')),
        line('Tiền mặt kỹ thuật viên đã thu, chưa đối soát', of('DA_THU')),
        line('Khách chưa thanh toán', of('CHO_THANH_TOAN')),
      ]),
      [],
      sectionTitle('2. Chi tiết thanh toán'),
      ...table(['Mã phiếu', 'Kỹ thuật viên', 'Khách hàng', 'Phí giữ lịch đã trả trước', 'Thanh toán khi hoàn tất', 'Hình thức thanh toán', 'Tình trạng thanh toán',
        'Khách trả lúc', 'Xác nhận lúc', 'Đối soát lúc'],
      list.map((t) => [t.id, techName(t.techId), t.customer, money(prepaid(t)), money(paidAtEnd(t)), PAYMENT_METHOD_LABEL[t.payment.method] || null,
        PAYMENT_STATUS_LABEL[t.payment.status], localDate(t.payment.paidAt), localDate(t.payment.confirmedAt), localDate(t.payment.reconciledAt)])),
      [],
      sectionTitle('3. Phí giữ lịch của phiếu hủy'),
      ...table(['Mã phiếu', 'Khách hàng', 'Người hủy', 'Hủy lúc', 'Số tiền', 'Xử lý phí giữ lịch', 'Lý do hủy', 'Hoàn tất xử lý lúc'],
        cancelled.map((t) => [t.id, t.customer, t.cancel?.byName || null, localDate(t.cancel?.at), money(forfeit(t)), DEPOSIT_STATUS_LABEL[t.deposit.status],
          { value: t.cancel?.reason || null, wrap: true }, localDate(t.deposit.status === 'CHO_HOAN' ? null : t.deposit.settledAt)])),
    ],
  });
}

function partsSheet(s, now) {
  const byName = new Map();
  s.completed.forEach((t) => t.parts.forEach((p) => {
    const row = byName.get(p.name) || { qty: 0, amount: 0, tickets: new Set() };
    row.qty += p.qty;
    row.amount += p.qty * p.unitPrice;
    row.tickets.add(t.id);
    byName.set(p.name, row);
  }));
  const rows = [...byName].sort((a, b) => b[1].amount - a[1].amount);
  return makeSheet({
    sheet: 'Linh kiện đã dùng',
    title: 'Linh kiện đã dùng',
    s,
    now,
    landscape: false,
    widths: [34, 11, 18, 11],
    body: table(['Linh kiện', 'Số lượng', 'Thành tiền (đồng)', 'Số phiếu'],
      rows.map(([name, r]) => [name, count(r.qty), money(r.amount), count(r.tickets.size)]),
      ['Tổng cộng', count(sum(rows, ([, r]) => r.qty)), money(s.totals.parts), null]),
  });
}

function reviewSheet(s, data, now) {
  const techName = (id) => data.technicians.find((k) => k.id === id)?.name || null;
  const rows = s.completed.filter((t) => t.review).sort((a, b) => a.review.stars - b.review.stars || b.review.at.localeCompare(a.review.at));
  return makeSheet({
    sheet: 'Đánh giá của khách',
    title: 'Đánh giá của khách hàng',
    s,
    now,
    widths: [17, 18, 22, 22, 8, 60],
    body: table(['Đánh giá lúc', 'Mã phiếu', 'Kỹ thuật viên', 'Khách hàng', 'Số sao', 'Nhận xét'],
      rows.map((t) => [localDate(t.review.at), t.id, techName(t.techId), t.customer, { value: t.review.stars, type: Number, align: 'center' }, { value: t.review.comment || null, wrap: true }])),
  });
}

function ticketSheet(s, data, now) {
  const techName = (id) => data.technicians.find((k) => k.id === id)?.name || null;
  return makeSheet({
    sheet: 'Danh sách phiếu',
    title: 'Danh sách phiếu yêu cầu',
    s,
    now,
    widths: [18, 17, 22, 15, 28, 11, 17, 9, 20, 17, 17, 13, 19, 24, 20, 10],
    body: table(['Mã phiếu', 'Ngày tạo', 'Khách hàng', 'Phường', 'Loại sự cố', 'Mức khẩn', 'Trạng thái', 'Bảo hành', 'Kỹ thuật viên', 'Giờ hẹn',
      'Hoàn tất lúc', 'Số tiền', 'Hình thức thanh toán', 'Tình trạng thanh toán', 'Phí giữ lịch', 'Đánh giá (sao)'],
    s.created.map((t) => [t.id, localDate(t.createdAt), t.customer, t.ward, t.category, URGENCY_LABEL[t.urgency] || t.urgency, STATUS_LABEL[t.status] || t.status,
      t.isWarranty ? 'Có' : null, techName(t.techId), localDate(t.appointmentAt), localDate(t.completedAt), money(t.amount),
      PAYMENT_METHOD_LABEL[t.payment?.method] || null, PAYMENT_STATUS_LABEL[t.payment?.status] || null,
      t.deposit ? DEPOSIT_STATUS_LABEL[t.deposit.status] : null, count(t.review?.stars)])),
  });
}

export function reportSheets({ report, data, now = new Date() }) {
  const s = summarizeExport(data, now);
  return [
    overviewSheet(report, s, now),
    dailySheet(report, s, now),
    categorySheet(s, now),
    payrollSheet(s, now),
    performanceSheet(s, now),
    jobsSheet(s, now),
    paymentSheet(s, data, now),
    partsSheet(s, now),
    reviewSheet(s, data, now),
    ticketSheet(s, data, now),
  ];
}

export function reportFileName(data, now = new Date()) {
  const from = new Date(data.period.from);
  if (data.period.kind === 'month') return `bao-cao-thang-${String(from.getMonth() + 1).padStart(2, '0')}-${from.getFullYear()}.xlsx`;
  return `bao-cao-${toDateInput(from)}-den-${toDateInput(now)}.xlsx`;
}

export async function downloadReport({ report, data }) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const now = new Date();
  await writeExcelFile(reportSheets({ report, data, now }), WORKBOOK_OPTIONS).toFile(reportFileName(data, now));
}
