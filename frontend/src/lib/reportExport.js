/**
 * UC21: file Excel báo cáo cho chủ cửa hàng: tổng quan, doanh thu, bảng lương kỹ thuật viên, đối soát và danh sách phiếu.
 * Doanh thu và hoa hồng tính theo ngày hoàn tất phiếu; số phiếu tạo, hủy tính theo ngày tạo.
 */
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS, STATUS_LABEL } from './ticketStatus.js';
import { URGENCY_LABEL } from './classifier.js';
import { formatDate, formatDateTime, toDateInput } from './format.js';

const MONEY = '#,##0';
const DECIMAL = '0.0';
const DATE = 'dd/mm/yyyy';
const DATE_TIME = 'dd/mm/yyyy hh:mm';
export const WORKBOOK_OPTIONS = { fontFamily: 'Calibri', fontSize: 11 };

const isBlank = (value) => value === null || value === undefined || Number.isNaN(value);
const bold = (value) => ({ value, fontWeight: 'bold' });
const money = (value, weight) => (isBlank(value) ? null : { value, type: Number, format: MONEY, fontWeight: weight });
const decimal = (value, weight) => (isBlank(value) ? null : { value, type: Number, format: DECIMAL, fontWeight: weight });
const count = (value, weight) => (isBlank(value) ? null : { value, type: Number, fontWeight: weight });
const sum = (list, pick) => list.reduce((s, x) => s + (pick(x) || 0), 0);
const average = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const percent = (part, whole) => (whole ? (part / whole) * 100 : null);
const hours = (t) => (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000;

/** Excel không có múi giờ: ghi đúng giờ hiển thị trên màn hình (giờ của trình duyệt). */
function localDate(value, format = DATE_TIME) {
  if (!value) return null;
  const d = new Date(value);
  return { value: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())), type: Date, format };
}

function table(headers, rows, total) {
  return [headers.map(bold), ...rows, ...(total ? [total] : [])];
}

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
      cashHeld: sum(cashHeld.filter((t) => t.techId === k.id), (t) => t.amount),
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
    technicians,
    totals: {
      revenue: sum(completed, (t) => t.amount),
      service: sum(completed, (t) => t.serviceAmount),
      survey: sum(completed, (t) => t.surveyFee),
      parts: sum(completed, (t) => t.partsAmount),
      lateFee: sum(completed, (t) => t.lateFee),
      cash: sum(completed.filter((t) => t.payment?.method === 'TIEN_MAT'), (t) => t.amount),
      transfer: sum(completed.filter((t) => t.payment?.method === 'CHUYEN_KHOAN'), (t) => t.amount),
      salary: sum(technicians, (k) => k.salary),
      commission: sum(technicians, (k) => k.commission),
    },
  };
}

function periodText(s) {
  if (s.isMonth) return `Tháng ${String(s.from.getMonth() + 1).padStart(2, '0')}/${s.from.getFullYear()}`;
  return `${formatDate(s.from)} – ${formatDate(s.lastDay)}`;
}

function overviewSheet(report, s, now) {
  const kpi = (label, cell, cur, prev) => {
    if (isBlank(prev)) return [label, cell(cur)];
    return [label, cell(cur), cell(prev), cell(cur - prev), decimal(percent(cur - prev, prev))];
  };
  return {
    sheet: 'Tổng quan',
    orientation: 'landscape',
    columns: [{ width: 38 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }],
    data: [
      [bold('Báo cáo hoạt động IT OnSite')],
      ['Kỳ báo cáo', periodText(s)],
      ['Từ ngày – đến ngày', `${formatDate(s.from)} – ${formatDate(s.lastDay)}`],
      ['Thời điểm xuất', formatDateTime(now)],
      ['Cơ sở số liệu', 'Doanh thu, lương tính theo ngày hoàn tất phiếu; phiếu tạo, phiếu hủy tính theo ngày tạo'],
      [],
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
      ...table(['Cơ cấu doanh thu', 'Số tiền (đồng)', 'Tỷ trọng (%)'], [
        ['Tiền công dịch vụ', money(s.totals.service), decimal(percent(s.totals.service, s.totals.revenue))],
        ['Phí khảo sát', money(s.totals.survey), decimal(percent(s.totals.survey, s.totals.revenue))],
        ['Linh kiện', money(s.totals.parts), decimal(percent(s.totals.parts, s.totals.revenue))],
        ['Phí đổi lịch sát giờ', money(s.totals.lateFee), decimal(percent(s.totals.lateFee, s.totals.revenue))],
      ], [bold('Tổng doanh thu'), money(s.totals.revenue, 'bold'), null]),
      [],
      ...table(['Theo hình thức thanh toán', 'Số tiền (đồng)'], [
        ['Tiền mặt', money(s.totals.cash)],
        ['Chuyển khoản VietQR', money(s.totals.transfer)],
      ]),
      [],
      ...table([s.isMonth ? 'Lương kỹ thuật viên' : 'Hoa hồng kỹ thuật viên', 'Số tiền (đồng)'], [
        ...(s.isMonth ? [['Tổng lương cứng', money(sum(s.technicians, (k) => k.baseSalary))]] : []),
        ['Tổng hoa hồng', money(s.totals.commission)],
        ...(s.isMonth ? [[bold('Tổng lương phải trả'), money(s.totals.salary, 'bold')]] : []),
        ['Tiền mặt kỹ thuật viên đang giữ, chưa đối soát', money(sum(s.cashHeld, (t) => t.amount))],
      ]),
      [],
      ...table(['Phiếu theo trạng thái', 'Số phiếu'], report.byStatus.map((x) => [STATUS_LABEL[x.status], count(x.count)])),
    ],
  };
}

function dailySheet(report, s) {
  const rows = report.byDay.map((d) => {
    const day = toDateInput(d.date);
    const jobs = s.completed.filter((t) => toDateInput(t.completedAt) === day);
    return [
      localDate(d.date, DATE),
      count(jobs.length),
      money(sum(jobs, (t) => t.serviceAmount)),
      money(sum(jobs, (t) => t.surveyFee)),
      money(sum(jobs, (t) => t.partsAmount)),
      money(sum(jobs, (t) => t.lateFee)),
      money(sum(jobs.filter((t) => t.payment?.method === 'TIEN_MAT'), (t) => t.amount)),
      money(sum(jobs.filter((t) => t.payment?.method === 'CHUYEN_KHOAN'), (t) => t.amount)),
      money(sum(jobs, (t) => t.amount)),
    ];
  });
  const total = [bold('Tổng cộng'), count(s.completed.length, 'bold'), money(s.totals.service, 'bold'), money(s.totals.survey, 'bold'),
    money(s.totals.parts, 'bold'), money(s.totals.lateFee, 'bold'), money(s.totals.cash, 'bold'), money(s.totals.transfer, 'bold'), money(s.totals.revenue, 'bold')];
  return {
    sheet: 'Doanh thu theo ngày',
    orientation: 'landscape',
    columns: [{ width: 13 }, { width: 15 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 18 }],
    stickyRowsCount: 1,
    data: table(['Ngày', 'Phiếu hoàn tất', 'Tiền công dịch vụ', 'Phí khảo sát', 'Linh kiện', 'Phí đổi lịch', 'Tiền mặt', 'Chuyển khoản', 'Tổng doanh thu'], rows, total),
  };
}

function categorySheet(s) {
  const names = [...new Set([...s.created, ...s.completed].map((t) => t.category))].filter(Boolean);
  const rows = names.map((name) => {
    const made = s.created.filter((t) => t.category === name);
    const jobs = s.completed.filter((t) => t.category === name);
    const revenue = sum(jobs, (t) => t.amount);
    return { name, made: made.length, done: jobs.length, cancelled: made.filter((t) => t.status === STATUS.DA_HUY).length,
      service: sum(jobs, (t) => t.serviceAmount), survey: sum(jobs, (t) => t.surveyFee), parts: sum(jobs, (t) => t.partsAmount), revenue };
  }).sort((a, b) => b.revenue - a.revenue || b.made - a.made);
  return {
    sheet: 'Theo loại sự cố',
    orientation: 'landscape',
    columns: [{ width: 32 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }],
    stickyRowsCount: 1,
    data: table(['Loại sự cố', 'Phiếu tạo', 'Hoàn tất', 'Đã hủy', 'Tiền công dịch vụ', 'Phí khảo sát', 'Linh kiện', 'Doanh thu', 'Tỷ trọng (%)'],
      rows.map((r) => [r.name, count(r.made), count(r.done), count(r.cancelled), money(r.service), money(r.survey), money(r.parts), money(r.revenue), decimal(percent(r.revenue, s.totals.revenue))]),
      [bold('Tổng cộng'), count(s.created.length, 'bold'), count(s.completed.length, 'bold'), count(sum(rows, (r) => r.cancelled), 'bold'),
        money(s.totals.service, 'bold'), money(s.totals.survey, 'bold'), money(s.totals.parts, 'bold'), money(s.totals.revenue, 'bold'), null]),
  };
}

function payrollSheet(s, now) {
  const headers = ['STT', 'Kỹ thuật viên', 'Phiếu hoàn tất', 'Trong đó bảo hành', 'Tiền công dịch vụ', 'Phí khảo sát', 'Tính hoa hồng', 'Hoa hồng',
    ...(s.isMonth ? ['Lương cứng', 'Tổng lương'] : []), 'Tiền mặt đang giữ'];
  const rows = s.technicians.map((k, i) => [
    { value: i + 1, type: Number, align: 'center' }, k.name, count(k.done), count(k.warranty), money(k.service), money(k.survey), money(k.base), money(k.commission),
    ...(s.isMonth ? [money(k.baseSalary), money(k.salary, 'bold')] : []), money(k.cashHeld),
  ]);
  const total = [null, bold('Tổng cộng'), count(sum(s.technicians, (k) => k.done), 'bold'), count(sum(s.technicians, (k) => k.warranty), 'bold'),
    money(sum(s.technicians, (k) => k.service), 'bold'), money(sum(s.technicians, (k) => k.survey), 'bold'), money(sum(s.technicians, (k) => k.base), 'bold'),
    money(s.totals.commission, 'bold'), ...(s.isMonth ? [money(sum(s.technicians, (k) => k.baseSalary), 'bold'), money(s.totals.salary, 'bold')] : []),
    money(sum(s.technicians, (k) => k.cashHeld), 'bold')];
  const title = s.isMonth ? `Bảng lương kỹ thuật viên ${periodText(s).toLowerCase()}` : `Hoa hồng kỹ thuật viên ${periodText(s)}`;
  return {
    sheet: s.isMonth ? 'Bảng lương KTV' : 'Hoa hồng KTV',
    orientation: 'landscape',
    columns: [{ width: 5 }, { width: 22 }, { width: 13 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 16 }],
    data: [
      [bold(title)],
      [s.isMonth ? `Lương cứng ${s.baseSalary.toLocaleString('vi-VN')} đồng/tháng, đã gồm hỗ trợ đi lại cho phiếu bảo hành` : 'Kỳ không trọn tháng nên chưa tính lương cứng'],
      [`Hoa hồng ${String(s.rate).replace('.', ',')}% trên tiền công dịch vụ và phí khảo sát của phiếu hoàn tất, không tính linh kiện`],
      ...(s.isMonth && !s.finished ? [[`Tháng chưa kết thúc, số liệu tạm tính đến ${formatDateTime(now)}`]] : []),
      [],
      ...table(headers, rows, total),
    ],
  };
}

function performanceSheet(s) {
  return {
    sheet: 'Hiệu suất KTV',
    orientation: 'landscape',
    columns: [{ width: 24 }, { width: 13 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 13 }, { width: 15 }],
    stickyRowsCount: 1,
    data: table(['Kỹ thuật viên', 'Lượt được giao', 'Đã nhận', 'Từ chối', 'Quá hạn', 'Chưa phản hồi', 'Tỷ lệ nhận việc (%)', 'Phiếu hoàn tất',
      'Thời gian xử lý TB (giờ)', 'Đánh giá TB (sao)', 'Lượt đánh giá', 'Đánh giá ≤ 2 sao'],
    s.technicians.map((k) => [k.name, count(k.given), count(k.accepted), count(k.declined), count(k.overdue), count(k.pending), decimal(k.acceptRate),
      count(k.done), decimal(k.avgHours), decimal(k.rating), count(k.reviews), count(k.lowReviews)])),
  };
}

function jobsSheet(s) {
  const rows = [];
  s.technicians.filter((k) => k.done).forEach((k) => {
    k.jobs.forEach((t) => rows.push([
      k.name, t.id, localDate(t.completedAt), t.category, t.ward, t.isWarranty ? 'Có' : null, money(t.serviceAmount), money(t.surveyFee),
      money(t.partsAmount), money(t.lateFee), money(t.amount), PAYMENT_METHOD_LABEL[t.payment?.method] || null,
      PAYMENT_STATUS_LABEL[t.payment?.status] || null, money(commissionBase(t)), money((commissionBase(t) * s.rate) / 100), count(t.review?.stars),
    ]));
    rows.push([bold(`Cộng ${k.name}`), bold(`${k.done} phiếu`), null, null, null, count(k.warranty, 'bold'), money(k.service, 'bold'), money(k.survey, 'bold'),
      money(k.parts, 'bold'), money(sum(k.jobs, (t) => t.lateFee), 'bold'), money(k.revenue, 'bold'), null, null, money(k.base, 'bold'), money(k.commission, 'bold'), null]);
    rows.push([]);
  });
  return {
    sheet: 'Chi tiết công việc KTV',
    orientation: 'landscape',
    columns: [{ width: 24 }, { width: 18 }, { width: 17 }, { width: 30 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 13 }, { width: 13 },
      { width: 13 }, { width: 14 }, { width: 20 }, { width: 25 }, { width: 15 }, { width: 13 }, { width: 13 }],
    stickyRowsCount: 1,
    data: table(['Kỹ thuật viên', 'Mã phiếu', 'Hoàn tất lúc', 'Loại sự cố', 'Phường', 'Bảo hành', 'Tiền công dịch vụ', 'Phí khảo sát', 'Linh kiện',
      'Phí đổi lịch', 'Tổng tiền', 'Hình thức thanh toán', 'Tình trạng thanh toán', 'Tính hoa hồng', 'Hoa hồng', 'Đánh giá (sao)'], rows),
  };
}

function paymentSheet(s, data) {
  const techName = (id) => data.technicians.find((k) => k.id === id)?.name || null;
  const open = data.tickets.filter((t) => ['CHO_XAC_NHAN', 'DA_THU', 'CHO_THANH_TOAN'].includes(t.payment?.status));
  const done = s.completed.filter((t) => t.payment && !open.includes(t));
  const order = { CHO_XAC_NHAN: 0, DA_THU: 1, CHO_THANH_TOAN: 2 };
  const list = [...open.sort((a, b) => order[a.payment.status] - order[b.payment.status]), ...done];
  const of = (status) => data.tickets.filter((t) => t.payment?.status === status);
  const line = (label, tickets) => [label, count(tickets.length), money(sum(tickets, (t) => t.amount))];
  return {
    sheet: 'Thanh toán và đối soát',
    orientation: 'landscape',
    columns: [{ width: 40 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 20 }, { width: 25 }, { width: 17 }, { width: 17 }, { width: 17 }],
    data: [
      ...table(['Việc cần xử lý', 'Số phiếu', 'Số tiền (đồng)'], [
        line('Chuyển khoản chờ điều phối viên xác nhận', of('CHO_XAC_NHAN')),
        line('Tiền mặt kỹ thuật viên đã thu, chưa đối soát', of('DA_THU')),
        line('Khách chưa thanh toán', of('CHO_THANH_TOAN')),
      ]),
      [],
      ...table(['Mã phiếu', 'Kỹ thuật viên', 'Khách hàng', 'Số tiền', 'Hình thức thanh toán', 'Tình trạng thanh toán', 'Khách trả lúc', 'Xác nhận lúc', 'Đối soát lúc'],
        list.map((t) => [t.id, techName(t.techId), t.customer, money(t.amount), PAYMENT_METHOD_LABEL[t.payment.method] || null,
          PAYMENT_STATUS_LABEL[t.payment.status], localDate(t.payment.paidAt), localDate(t.payment.confirmedAt), localDate(t.payment.reconciledAt)])),
    ],
  };
}

function partsSheet(s) {
  const byName = new Map();
  s.completed.forEach((t) => t.parts.forEach((p) => {
    const row = byName.get(p.name) || { qty: 0, amount: 0, tickets: new Set() };
    row.qty += p.qty;
    row.amount += p.qty * p.unitPrice;
    row.tickets.add(t.id);
    byName.set(p.name, row);
  }));
  const rows = [...byName].sort((a, b) => b[1].amount - a[1].amount);
  return {
    sheet: 'Linh kiện đã dùng',
    columns: [{ width: 34 }, { width: 11 }, { width: 18 }, { width: 11 }],
    data: table(['Linh kiện', 'Số lượng', 'Thành tiền (đồng)', 'Số phiếu'],
      rows.map(([name, r]) => [name, count(r.qty), money(r.amount), count(r.tickets.size)]),
      [bold('Tổng cộng'), count(sum(rows, ([, r]) => r.qty), 'bold'), money(s.totals.parts, 'bold'), null]),
  };
}

function reviewSheet(s, data) {
  const techName = (id) => data.technicians.find((k) => k.id === id)?.name || null;
  const rows = s.completed.filter((t) => t.review).sort((a, b) => a.review.stars - b.review.stars || b.review.at.localeCompare(a.review.at));
  return {
    sheet: 'Đánh giá của khách',
    orientation: 'landscape',
    columns: [{ width: 17 }, { width: 18 }, { width: 24 }, { width: 24 }, { width: 9 }, { width: 60 }],
    stickyRowsCount: 1,
    data: table(['Đánh giá lúc', 'Mã phiếu', 'Kỹ thuật viên', 'Khách hàng', 'Số sao', 'Nhận xét'],
      rows.map((t) => [localDate(t.review.at), t.id, techName(t.techId), t.customer, count(t.review.stars), t.review.comment || null])),
  };
}

function ticketSheet(s, data) {
  const techName = (id) => data.technicians.find((k) => k.id === id)?.name || null;
  return {
    sheet: 'Danh sách phiếu',
    orientation: 'landscape',
    columns: [{ width: 18 }, { width: 17 }, { width: 24 }, { width: 15 }, { width: 30 }, { width: 11 }, { width: 18 }, { width: 10 }, { width: 22 },
      { width: 17 }, { width: 17 }, { width: 14 }, { width: 20 }, { width: 25 }, { width: 13 }],
    stickyRowsCount: 1,
    data: table(['Mã phiếu', 'Ngày tạo', 'Khách hàng', 'Phường', 'Loại sự cố', 'Mức khẩn', 'Trạng thái', 'Bảo hành', 'Kỹ thuật viên', 'Giờ hẹn',
      'Hoàn tất lúc', 'Số tiền', 'Hình thức thanh toán', 'Tình trạng thanh toán', 'Đánh giá (sao)'],
    s.created.map((t) => [t.id, localDate(t.createdAt), t.customer, t.ward, t.category, URGENCY_LABEL[t.urgency] || t.urgency, STATUS_LABEL[t.status] || t.status,
      t.isWarranty ? 'Có' : null, techName(t.techId), localDate(t.appointmentAt), localDate(t.completedAt), money(t.amount),
      PAYMENT_METHOD_LABEL[t.payment?.method] || null, PAYMENT_STATUS_LABEL[t.payment?.status] || null, count(t.review?.stars)])),
  };
}

export function reportSheets({ report, data, now = new Date() }) {
  const s = summarizeExport(data, now);
  return [
    overviewSheet(report, s, now),
    dailySheet(report, s),
    categorySheet(s),
    payrollSheet(s, now),
    performanceSheet(s),
    jobsSheet(s),
    paymentSheet(s, data),
    partsSheet(s),
    reviewSheet(s, data),
    ticketSheet(s, data),
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
