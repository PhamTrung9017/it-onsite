/** Quy tắc nghiệp vụ dùng chung, không phụ thuộc giao diện và lưu trữ. */
import { BUSY_STATUSES, CANCELLABLE } from './ticketStatus.js';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * HOUR;

/** BR-03: điều kiện hủy / đổi lịch và phí áp dụng. */
export function cancellationPolicy(ticket, config, now = Date.now()) {
  if (!CANCELLABLE.includes(ticket.status)) {
    return { allowed: false, fee: 0, reason: 'Kỹ thuật viên đã check-in, không thể hủy hoặc đổi lịch.' };
  }
  const appointment = new Date(ticket.assignment?.appointmentAt || ticket.slotStart).getTime();
  const free = appointment - now >= config.freeCancelHours * HOUR;
  return {
    allowed: true,
    fee: free ? 0 : config.surveyFee,
    reason: free
      ? `Miễn phí vì còn ít nhất ${config.freeCancelHours} giờ trước giờ hẹn.`
      : `Còn dưới ${config.freeCancelHours} giờ trước giờ hẹn nên tính phí khảo sát.`,
  };
}

/** Khung giờ đặt lịch hợp lệ: trong giờ phục vụ và cách hiện tại ít nhất leadHours. */
export function validateSlot(slotStart, config, now = Date.now(), leadHours = 2) {
  const t = new Date(slotStart);
  if (Number.isNaN(t.getTime())) return 'Vui lòng chọn ngày và khung giờ.';
  if (t.getTime() < now + leadHours * HOUR) return `Vui lòng chọn khung giờ cách hiện tại ít nhất ${leadHours} giờ.`;
  const [sh, sm] = config.serviceHours.start.split(':').map(Number);
  const [eh, em] = config.serviceHours.end.split(':').map(Number);
  const minutes = t.getHours() * 60 + t.getMinutes();
  if (minutes < sh * 60 + sm || minutes >= eh * 60 + em) {
    return `Khung giờ phải nằm trong giờ phục vụ ${config.serviceHours.start}–${config.serviceHours.end}.`;
  }
  return null;
}

/** Khoảng thời gian một lịch hẹn chiếm của KTV (gồm thời lượng dịch vụ và thời gian đệm di chuyển). */
export function busyInterval(appointmentAt, durationMin, bufferMin) {
  const start = new Date(appointmentAt).getTime();
  return [start - bufferMin * MINUTE, start + (durationMin + bufferMin) * MINUTE];
}

/** BR-04: KTV có lịch chồng với khung giờ mới hay không. */
export function hasConflict(techId, appointmentAt, durationMin, tickets, config, ignoreTicketId) {
  const [s1, e1] = busyInterval(appointmentAt, durationMin, config.travelBufferMinutes);
  return tickets.some((t) => {
    if (t.id === ignoreTicketId || t.assignment?.techId !== techId || !BUSY_STATUSES.includes(t.status)) return false;
    const [s2, e2] = busyInterval(t.assignment.appointmentAt, t.estimatedMinutes || 60, config.travelBufferMinutes);
    return s1 < e2 && s2 < e1;
  });
}

export const DEFAULT_SCHEDULE = { workDays: [1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00', daysOff: [] };
const MAX_DAYS_OFF = 60;

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** UC18: lịch hẹn rơi vào ngày nghỉ, ngày không làm hoặc vượt ngoài giờ làm của KTV. */
export function offDuty(schedule, appointmentAt, durationMin) {
  const s = schedule || DEFAULT_SCHEDULE;
  const start = new Date(appointmentAt);
  const end = new Date(start.getTime() + durationMin * MINUTE);
  const weekday = start.getDay() === 0 ? 7 : start.getDay();
  if (s.daysOff.includes(isoDate(start)) || !s.workDays.includes(weekday)) return true;
  if (isoDate(end) !== isoDate(start)) return true;
  return !(toMinutes(s.start) <= start.getHours() * 60 + start.getMinutes() && end.getHours() * 60 + end.getMinutes() <= toMinutes(s.end));
}

export function validateSchedule(s) {
  if (!s.workDays?.length) return 'Chọn ít nhất một ngày làm việc trong tuần.';
  if (!/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end)) return 'Giờ làm việc không hợp lệ.';
  if (toMinutes(s.start) >= toMinutes(s.end)) return 'Giờ bắt đầu làm việc phải trước giờ kết thúc.';
  if (s.daysOff.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return 'Ngày nghỉ không hợp lệ.';
  if (s.daysOff.length > MAX_DAYS_OFF) return `Chỉ lưu tối đa ${MAX_DAYS_OFF} ngày nghỉ.`;
  return null;
}

/**
 * BR-05: xếp hạng KTV gợi ý: đúng kỹ năng → đúng khu vực → ít việc trong ngày → điểm đánh giá cao.
 * KTV trùng lịch (BR-04) hoặc ngoài lịch làm việc (UC18) xếp cuối, kèm cờ để giao diện hiển thị lý do.
 */
export function rankTechnicians({ ticket, technicians, tickets, config, appointmentAt }) {
  const day = new Date(appointmentAt).toDateString();
  return technicians
    .filter((t) => t.active)
    .map((tech) => {
      const skill = tech.skills.includes(ticket.categoryCode);
      const area = tech.areas.includes(ticket.ward);
      const jobsToday = tickets.filter(
        (t) => t.assignment?.techId === tech.id && BUSY_STATUSES.includes(t.status)
          && new Date(t.assignment.appointmentAt).toDateString() === day,
      ).length;
      const conflict = hasConflict(tech.id, appointmentAt, ticket.estimatedMinutes || 60, tickets, config, ticket.id);
      const away = offDuty(tech.schedule, appointmentAt, ticket.estimatedMinutes || 60);
      return { tech, skill, area, jobsToday, conflict, offDuty: away };
    })
    .sort((a, b) =>
      Number(a.conflict || a.offDuty) - Number(b.conflict || b.offDuty)
      || Number(b.skill) - Number(a.skill)
      || Number(b.area) - Number(a.area)
      || a.jobsToday - b.jobsToday
      || b.tech.rating - a.tech.rating);
}

/** BR-06: hạn phản hồi của KTV. */
export function responseDeadline(assignedAt, config) {
  return new Date(new Date(assignedAt).getTime() + config.techResponseMinutes * MINUTE).toISOString();
}

/** Tổng tiền các hạng mục đã được khách duyệt (BR-13: dùng đơn giá đã cố định trên báo giá). */
export function approvedTotal(quotes) {
  return quotes
    .filter((q) => q.status === 'DA_DUYET' || q.status === 'DUYET_MOT_PHAN')
    .flatMap((q) => q.items.filter((i) => i.selected))
    .reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

export function quoteTotal(items, onlySelected = false) {
  return items.filter((i) => !onlySelected || i.selected).reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

/** BR-02: số tiền phải thanh toán của một phiếu. */
export function amountDue(ticket, config) {
  const main = ticket.quotes.find((q) => q.type === 'CHINH');
  if (main && main.status === 'TU_CHOI') return ticket.isWarranty ? 0 : config.surveyFee;
  return approvedTotal(ticket.quotes);
}

/** BR-07: kiểm tra phiếu bảo hành còn hiệu lực. */
export function warrantyStatus(warranty, now = Date.now()) {
  const end = new Date(warranty.endAt).getTime();
  if (now > end) return { valid: false, daysLeft: 0 };
  return { valid: true, daysLeft: Math.ceil((end - now) / DAY) };
}

/** BR-10: điều kiện đánh giá. */
export function reviewPolicy(ticket, config, now = Date.now()) {
  if (ticket.status !== 'HOAN_TAT') return { allowed: false, reason: 'Chỉ đánh giá được sau khi phiếu hoàn tất.' };
  if (ticket.review) return { allowed: false, reason: 'Phiếu này đã được đánh giá.' };
  const completed = new Date(ticket.completedAt).getTime();
  if (now - completed > config.reviewWindowDays * DAY) {
    return { allowed: false, reason: `Đã quá ${config.reviewWindowDays} ngày kể từ khi hoàn tất.` };
  }
  return { allowed: true };
}

export function validateReview(stars, comment) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return 'Vui lòng chọn số sao từ 1 đến 5.';
  if (stars <= 2 && !comment.trim()) return 'Đánh giá từ 2 sao trở xuống cần ghi lý do để chúng tôi cải thiện.';
  return null;
}

/** BR-11: đủ ảnh trước và sau mới được báo hoàn thành. */
export function canComplete(ticket) {
  return (ticket.photosBefore?.length || 0) >= 1 && (ticket.photosAfter?.length || 0) >= 1;
}
