export const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

const pad = (n) => String(n).padStart(2, '0');

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return `${formatTime(value)} ${formatDate(value)}`;
}

export function relativeDay(value, now = new Date()) {
  const d = new Date(value);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return formatDate(value);
}

export function timeAgo(value, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return formatDate(value);
}

/** Giá trị cho ô nhập ngày (yyyy-mm-dd) theo giờ địa phương. */
export function toDateInput(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function combineDateTime(date, time) {
  if (!date || !time) return '';
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).toISOString();
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[parts.length - 2]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

/** Danh sách khung giờ trong giờ phục vụ, bước 30 phút. */
export function timeSlots(start, end, step = 30) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const out = [];
  for (let m = sh * 60 + sm; m <= eh * 60 + em - 60; m += step) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
