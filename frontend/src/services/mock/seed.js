/** Dữ liệu mẫu. Phường theo đơn vị hành chính TP. Hồ Chí Minh từ năm 2025. */
import { STATUS } from '../../lib/ticketStatus.js';

export const AREAS = [
  'Sài Gòn', 'Bến Thành', 'Tân Định', 'Cầu Ông Lãnh',
  'Bàn Cờ', 'Xuân Hòa', 'Nhiêu Lộc',
  'Chợ Lớn', 'An Đông', 'Chợ Quán',
  'Gia Định', 'Bình Thạnh', 'Bình Lợi Trung', 'Thạnh Mỹ Tây', 'Bình Quới',
];

export const CATEGORIES = [
  { code: 'CAI_HDH', name: 'Cài đặt hệ điều hành', serviceId: 'dv-win' },
  { code: 'PHAN_MEM', name: 'Phần mềm văn phòng, ứng dụng', serviceId: 'dv-office' },
  { code: 'VIRUS', name: 'Virus và mã độc', serviceId: 'dv-virus' },
  { code: 'MANG', name: 'Mạng và Wi-Fi', serviceId: 'dv-mang' },
  { code: 'MAY_CHAM', name: 'Máy chậm, nóng, treo', serviceId: 'dv-toiuu' },
  { code: 'NGUON', name: 'Không lên nguồn, không lên hình', serviceId: 'dv-nguon' },
  { code: 'DU_LIEU', name: 'Khôi phục dữ liệu', serviceId: 'dv-dulieu' },
  { code: 'PHAN_CUNG', name: 'Nâng cấp, thay thế phần cứng', serviceId: 'dv-lapdat' },
  { code: 'KHAC', name: 'Khác', serviceId: 'dv-kiemtra' },
];

export const SERVICES = [
  { id: 'dv-win', name: 'Cài đặt Windows và driver đầy đủ', categoryCode: 'CAI_HDH', price: 250000, durationMin: 90, warrantyDays: 7, active: true },
  { id: 'dv-office', name: 'Cài đặt phần mềm văn phòng', categoryCode: 'PHAN_MEM', price: 100000, durationMin: 45, warrantyDays: 7, active: true },
  { id: 'dv-virus', name: 'Diệt virus và làm sạch hệ thống', categoryCode: 'VIRUS', price: 150000, durationMin: 60, warrantyDays: 30, active: true },
  { id: 'dv-mang', name: 'Khắc phục sự cố mạng, Wi-Fi', categoryCode: 'MANG', price: 150000, durationMin: 60, warrantyDays: 7, active: true },
  { id: 'dv-toiuu', name: 'Tối ưu máy chạy chậm', categoryCode: 'MAY_CHAM', price: 150000, durationMin: 60, warrantyDays: 14, active: true },
  { id: 'dv-vesinh', name: 'Vệ sinh và tra keo tản nhiệt laptop', categoryCode: 'MAY_CHAM', price: 180000, durationMin: 60, warrantyDays: 30, active: true },
  { id: 'dv-nguon', name: 'Kiểm tra, sửa lỗi không lên nguồn', categoryCode: 'NGUON', price: 200000, durationMin: 90, warrantyDays: 30, active: true },
  { id: 'dv-dulieu', name: 'Khôi phục dữ liệu ổ cứng, USB', categoryCode: 'DU_LIEU', price: 400000, durationMin: 120, warrantyDays: 0, active: true },
  { id: 'dv-lapdat', name: 'Công lắp đặt, nâng cấp linh kiện', categoryCode: 'PHAN_CUNG', price: 120000, durationMin: 45, warrantyDays: 30, active: true },
  { id: 'dv-kiemtra', name: 'Kiểm tra tổng quát', categoryCode: 'KHAC', price: 100000, durationMin: 60, warrantyDays: 0, active: true },
];

export const PARTS = [
  { id: 'lk-ssd512', name: 'SSD NVMe 512GB', price: 850000, stock: 6, warrantyDays: 365, active: true },
  { id: 'lk-ssd1t', name: 'SSD NVMe 1TB', price: 1450000, stock: 3, warrantyDays: 365, active: true },
  { id: 'lk-ram8', name: 'RAM DDR4 8GB', price: 550000, stock: 8, warrantyDays: 365, active: true },
  { id: 'lk-keo', name: 'Keo tản nhiệt cao cấp', price: 80000, stock: 20, warrantyDays: 0, active: true },
  { id: 'lk-pin', name: 'Pin laptop thay thế', price: 900000, stock: 2, warrantyDays: 180, active: true },
  { id: 'lk-nguon', name: 'Bộ nguồn PC 450W', price: 650000, stock: 4, warrantyDays: 365, active: true },
  { id: 'lk-router', name: 'Router Wi-Fi 6', price: 750000, stock: 1, warrantyDays: 365, active: true },
];

export const DEFAULT_CONFIG = {
  surveyFee: 50000,
  freeCancelHours: 2,
  techResponseMinutes: 15,
  travelBufferMinutes: 30,
  reviewWindowDays: 7,
  aiConfidenceThreshold: 0.6,
  serviceHours: { start: '08:00', end: '20:00' },
  areas: AREAS,
  bank: { name: 'Ngân hàng mẫu', bin: '970423', accountNumber: '0123456789', accountName: 'CAI WIN DAO' },
  payroll: { baseSalary: 5000000, commissionPercent: 30 },
};

const USERS = [
  { id: 'u-kh1', name: 'Nguyễn Văn Anh', email: 'khach@demo.vn', phone: '0909000001', roles: ['KHACH'], address: '120 Nguyễn Trãi', ward: 'Bến Thành' },
  { id: 'u-kh2', name: 'Trần Thị Bình', email: 'binh.tran@demo.vn', phone: '0909000002', roles: ['KHACH'], address: '45 Lê Văn Sỹ', ward: 'Nhiêu Lộc' },
  { id: 'u-kh3', name: 'Lê Minh Châu', email: 'chau.le@demo.vn', phone: '0909000003', roles: ['KHACH'], address: '18 Phan Đăng Lưu', ward: 'Gia Định' },
  { id: 'u-kh4', name: 'Võ Thị Dung', email: 'dung.vo@demo.vn', phone: '0909000004', roles: ['KHACH'], address: '77 Trần Hưng Đạo', ward: 'Chợ Quán' },
  { id: 'u-kh5', name: 'Hoàng Gia Bảo', email: 'bao.hoang@demo.vn', phone: '0909000005', roles: ['KHACH'], address: '9 Xô Viết Nghệ Tĩnh', ward: 'Thạnh Mỹ Tây' },
  { id: 'u-ktv1', name: 'Nguyễn Văn An', email: 'ktv@demo.vn', phone: '0909000011', roles: ['KTV'] },
  { id: 'u-ktv2', name: 'Lê Hoàng Phúc', email: 'phuc.le@demo.vn', phone: '0909000012', roles: ['KTV'] },
  { id: 'u-ktv3', name: 'Trần Quang Huy', email: 'huy.tran@demo.vn', phone: '0909000013', roles: ['KTV'] },
  { id: 'u-ktv4', name: 'Đỗ Thu Hà', email: 'ha.do@demo.vn', phone: '0909000014', roles: ['KTV'] },
  { id: 'u-dpv1', name: 'Trần Thị Lan', email: 'dpv@demo.vn', phone: '0909000021', roles: ['DPV'] },
  { id: 'u-qtv1', name: 'Hoàng Minh Quân', email: 'qtv@demo.vn', phone: '0909000031', roles: ['QTV', 'DPV'] },
];

const withAccount = (u) => ({ ...u, password: '123456', locked: false, createdAt: '2026-09-01T02:00:00.000Z', consentAt: '2026-09-01T02:00:00.000Z' });

const TECHNICIANS = [
  { id: 'k1', userId: 'u-ktv1', skills: ['CAI_HDH', 'PHAN_MEM', 'VIRUS', 'MAY_CHAM', 'PHAN_CUNG'], areas: ['Bến Thành', 'Sài Gòn', 'Tân Định', 'Cầu Ông Lãnh', 'Chợ Quán'], rating: 4.9, ratingCount: 0, active: true, schedule: { workDays: [1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00', daysOff: [] } },
  { id: 'k2', userId: 'u-ktv2', skills: ['NGUON', 'PHAN_CUNG', 'DU_LIEU', 'MAY_CHAM'], areas: ['Gia Định', 'Bình Thạnh', 'Bình Lợi Trung', 'Thạnh Mỹ Tây', 'Bình Quới'], rating: 4.7, ratingCount: 0, active: true, schedule: { workDays: [1, 2, 3, 4, 5, 6, 7], start: '08:00', end: '20:00', daysOff: [] } },
  { id: 'k3', userId: 'u-ktv3', skills: ['MANG', 'VIRUS', 'PHAN_MEM', 'CAI_HDH'], areas: ['Bàn Cờ', 'Xuân Hòa', 'Nhiêu Lộc', 'Chợ Lớn', 'An Đông'], rating: 4.8, ratingCount: 0, active: true, schedule: { workDays: [1, 2, 3, 4, 5], start: '08:00', end: '19:00', daysOff: [] } },
  { id: 'k4', userId: 'u-ktv4', skills: ['CAI_HDH', 'PHAN_MEM', 'KHAC'], areas: ['Chợ Lớn', 'An Đông', 'Chợ Quán'], rating: 4.5, ratingCount: 0, active: false, schedule: { workDays: [1, 2, 3, 4, 5, 6], start: '08:00', end: '17:00', daysOff: [] } },
];

const DEVICES = [
  { id: 'tb1', customerId: 'u-kh1', type: 'Laptop', brand: 'Dell', model: 'Inspiron 15 3520' },
  { id: 'tb2', customerId: 'u-kh1', type: 'PC', brand: 'Lắp ráp', model: 'PC văn phòng i5', note: 'Máy đặt ở phòng kế toán, tầng 2' },
  { id: 'tb3', customerId: 'u-kh2', type: 'Laptop', brand: 'HP', model: 'Pavilion 14' },
  { id: 'tb4', customerId: 'u-kh3', type: 'Laptop', brand: 'Asus', model: 'Vivobook 15' },
  { id: 'tb5', customerId: 'u-kh4', type: 'Laptop', brand: 'Lenovo', model: 'ThinkPad E14' },
  { id: 'tb6', customerId: 'u-kh5', type: 'PC', brand: 'Lắp ráp', model: 'PC gaming' },
];

/* ---------- Sinh dữ liệu phiếu theo thời điểm hiện tại ---------- */

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const iso = (t) => new Date(t).toISOString();
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function at(dayOffset, hh, mm = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm);
  return d.getTime();
}

function ticketId(t, n) {
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  return `YC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${String(n).padStart(3, '0')}`;
}

function serviceItem(serviceId, selected = true) {
  const s = SERVICES.find((x) => x.id === serviceId);
  return { id: `${serviceId}-${Math.random().toString(36).slice(2, 7)}`, kind: 'service', refId: s.id, name: s.name, qty: 1, unitPrice: s.price, warrantyDays: s.warrantyDays, selected };
}
function partItem(partId, selected = true) {
  const p = PARTS.find((x) => x.id === partId);
  return { id: `${partId}-${Math.random().toString(36).slice(2, 7)}`, kind: 'part', refId: p.id, name: p.name, qty: 1, unitPrice: p.price, warrantyDays: p.warrantyDays, selected };
}

function history(steps) {
  return steps.map(([status, t, by, note]) => ({ status, at: iso(t), by, note: note || '' }));
}

function baseTicket(o) {
  const customer = USERS.find((u) => u.id === o.customerId);
  const cat = CATEGORIES.find((c) => c.code === o.categoryCode);
  const svc = SERVICES.find((s) => s.id === cat.serviceId);
  return {
    id: o.id,
    customerId: o.customerId,
    deviceId: o.deviceId,
    description: o.description,
    photos: [],
    address: o.address || customer.address,
    ward: o.ward || customer.ward,
    contactPhone: customer.phone,
    slotStart: iso(o.slotStart),
    categoryCode: o.categoryCode,
    urgency: o.urgency || 'TRUNG_BINH',
    estimatedMinutes: svc.durationMin,
    aiResult: o.aiResult || { categoryCode: o.categoryCode, confidence: 0.86, urgency: o.urgency || 'TRUNG_BINH', reason: 'Mô tả khớp với các dấu hiệu đặc trưng.', state: 'ok', promptVersion: 'v1', ms: 820 },
    categoryConfirmed: o.status !== STATUS.MOI,
    deviceCredentials: '',
    status: o.status,
    version: 1,
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.createdAt),
    history: [],
    assignment: null,
    quotes: [],
    checkInAt: null,
    checklist: [],
    photosBefore: [],
    photosAfter: [],
    acceptance: null,
    payment: null,
    review: null,
    cancel: null,
    completedAt: null,
    isWarranty: false,
    warrantyOf: null,
  };
}

export function buildSeed(nowDate = new Date()) {
  const now = nowDate.getTime();
  const tickets = [];
  const warranties = [];
  const notifications = [];
  let seq = 1;
  const nextId = (t) => ticketId(t, seq++);

  /* --- Lịch sử 30 ngày cho báo cáo --- */
  const r = rng(20261030);
  const histCats = ['CAI_HDH', 'VIRUS', 'MAY_CHAM', 'PHAN_MEM', 'MANG', 'PHAN_CUNG', 'NGUON', 'CAI_HDH', 'VIRUS', 'MAY_CHAM'];
  const customers = USERS.filter((u) => u.roles.includes('KHACH'));
  const activeTechs = TECHNICIANS.filter((t) => t.active);
  let served = 0;
  for (let d = 30; d >= 2; d -= 1) {
    const count = 1 + Math.floor(r() * 3);
    for (let k = 0; k < count; k += 1) {
      const cust = customers[Math.floor(r() * customers.length)];
      const dev = DEVICES.find((x) => x.customerId === cust.id);
      const cat = histCats[Math.floor(r() * histCats.length)];
      const tech = activeTechs[Math.floor(r() * activeTechs.length)];
      const created = at(-d, 8 + Math.floor(r() * 8), Math.floor(r() * 4) * 15, nowDate);
      const appt = created + (3 + Math.floor(r() * 20)) * HOUR;
      const done = appt + (60 + Math.floor(r() * 120)) * MIN;
      const cancelled = r() < 0.08;
      const rejected = !cancelled && r() < 0.1;
      const id = nextId(created);
      const t = baseTicket({ id, customerId: cust.id, deviceId: dev.id, categoryCode: cat, status: cancelled ? STATUS.DA_HUY : STATUS.HOAN_TAT, createdAt: created, slotStart: appt, description: `Yêu cầu ${CATEGORIES.find((c) => c.code === cat).name.toLowerCase()}.` });
      if (cancelled) {
        t.history = history([[STATUS.MOI, created, cust.name], [STATUS.DA_HUY, created + 2 * HOUR, cust.name, 'Khách hủy']]);
        t.cancel = { by: cust.id, reason: 'Đã tự xử lý được', fee: 0, at: iso(created + 2 * HOUR) };
      } else {
        const svcId = CATEGORIES.find((c) => c.code === cat).serviceId;
        const items = [serviceItem(svcId)];
        if (cat === 'PHAN_CUNG') items.push(partItem(r() < 0.5 ? 'lk-ssd512' : 'lk-ram8'));
        if (cat === 'MAY_CHAM' && r() < 0.5) items.push(serviceItem('dv-vesinh'));
        served += 1;
        const missed = { 4: 'TU_CHOI', 8: 'QUA_HAN' }[served % 9];
        const other = activeTechs[(activeTechs.indexOf(tech) + 1) % activeTechs.length];
        const answered = created + (missed === 'TU_CHOI' ? 15 : 27) * MIN;
        if (missed) {
          t.assignmentLog = [{ techId: other.id, appointmentAt: iso(appt), assignedAt: iso(created + 12 * MIN), deadline: iso(created + 27 * MIN), result: missed, respondedAt: iso(answered), ...(missed === 'TU_CHOI' ? { rejectReason: 'Đang xử lý phiếu khác ở xa' } : {}) }];
        }
        t.assignment = { techId: tech.id, appointmentAt: iso(appt), assignedAt: iso(created + 20 * MIN), deadline: iso(created + 35 * MIN), result: 'NHAN', respondedAt: iso(created + 28 * MIN) };
        t.checkInAt = iso(appt);
        t.quotes = [{ id: `bg-${id}`, type: 'CHINH', status: rejected ? 'TU_CHOI' : 'DA_DUYET', items, note: '', createdAt: iso(appt + 20 * MIN), createdBy: tech.id, decidedAt: iso(appt + 30 * MIN), rejectReason: rejected ? 'Chi phí cao hơn dự kiến' : '' }];
        const amount = rejected ? DEFAULT_CONFIG.surveyFee : items.reduce((s, i) => s + i.unitPrice, 0);
        const method = r() < 0.55 ? 'CHUYEN_KHOAN' : 'TIEN_MAT';
        t.photosBefore = rejected ? [] : ['mau'];
        t.photosAfter = rejected ? [] : ['mau'];
        t.acceptance = rejected ? null : { result: 'DAT', at: iso(done) };
        const reconciled = method === 'TIEN_MAT' && d > 3;
        t.payment = {
          amount, method, status: method === 'TIEN_MAT' ? (reconciled ? 'DA_DOI_SOAT' : 'DA_THU') : 'DA_XAC_NHAN', paidAt: iso(done + 10 * MIN),
          confirmedBy: method === 'TIEN_MAT' ? tech.userId : 'u-dpv1', confirmedAt: iso(done + 10 * MIN), ...(reconciled ? { reconciledAt: iso(done + DAY) } : {}),
        };
        t.completedAt = iso(done + 10 * MIN);
        t.history = history([
          [STATUS.MOI, created, cust.name], [STATUS.DA_TIEP_NHAN, created + 10 * MIN, 'Trần Thị Lan'],
          ...(missed ? [[STATUS.DA_PHAN_CONG, created + 12 * MIN, 'Trần Thị Lan'], [STATUS.DA_TIEP_NHAN, answered, 'Hệ thống', missed === 'TU_CHOI' ? 'KTV từ chối' : 'KTV quá hạn phản hồi, đã thu hồi phân công']] : []),
          [STATUS.DA_PHAN_CONG, created + 20 * MIN, 'Trần Thị Lan'], [STATUS.KTV_DA_NHAN, created + 28 * MIN, 'KTV'],
          [STATUS.DANG_KHAO_SAT, appt, 'KTV'], [STATUS.CHO_DUYET_BAO_GIA, appt + 20 * MIN, 'KTV'],
          ...(rejected
            ? [[STATUS.CHO_THANH_TOAN, appt + 30 * MIN, cust.name, 'Khách từ chối báo giá']]
            : [[STATUS.DANG_THUC_HIEN, appt + 30 * MIN, cust.name], [STATUS.CHO_NGHIEM_THU, done - 10 * MIN, 'KTV'], [STATUS.CHO_THANH_TOAN, done, cust.name]]),
          [STATUS.HOAN_TAT, done + 10 * MIN, 'Hệ thống'],
        ]);
        if (!rejected && r() < 0.75) {
          const stars = r() < 0.12 ? 3 : r() < 0.3 ? 4 : 5;
          t.review = { stars, comment: stars === 5 ? 'Kỹ thuật viên đến đúng giờ, làm nhanh, giải thích rõ.' : 'Ổn, nhưng phải chờ hơi lâu.', at: iso(done + 2 * HOUR) };
        }
      }
      tickets.push(t);
    }
  }

  /* --- Phiếu đang xử lý dùng để trình diễn --- */
  const kh1 = USERS.find((u) => u.id === 'u-kh1');

  // 1. Khách demo: phiếu đã hoàn tất 2 ngày trước, còn bảo hành, chưa đánh giá
  {
    const created = at(-3, 9, 0, nowDate); const appt = at(-2, 9, 0, nowDate); const done = at(-2, 11, 15, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh1', deviceId: 'tb1', categoryCode: 'MAY_CHAM', status: STATUS.HOAN_TAT, createdAt: created, slotStart: appt, description: 'Laptop chạy rất chậm, quạt kêu to và nóng khi mở nhiều tab trình duyệt.' });
    const items = [serviceItem('dv-vesinh'), partItem('lk-ssd512'), serviceItem('dv-lapdat')];
    t.assignment = { techId: 'k1', appointmentAt: iso(appt), assignedAt: iso(created + 15 * MIN), deadline: iso(created + 30 * MIN), result: 'NHAN', respondedAt: iso(created + 20 * MIN) };
    t.checkInAt = iso(appt);
    t.quotes = [{ id: `bg-${id}`, type: 'CHINH', status: 'DA_DUYET', items, note: 'Ổ HDD cũ đã chậm, đề xuất thay SSD và vệ sinh máy.', createdAt: iso(appt + 25 * MIN), createdBy: 'k1', decidedAt: iso(appt + 35 * MIN), rejectReason: '' }];
    t.checklist = [{ text: 'Sao lưu dữ liệu', done: true }, { text: 'Lắp SSD và chuyển hệ điều hành', done: true }, { text: 'Vệ sinh, tra keo tản nhiệt', done: true }];
    t.photosBefore = ['mau']; t.photosAfter = ['mau'];
    t.acceptance = { result: 'DAT', at: iso(done) };
    const amount = items.reduce((s, i) => s + i.unitPrice, 0);
    t.payment = { amount, method: 'CHUYEN_KHOAN', status: 'DA_XAC_NHAN', paidAt: iso(done + 5 * MIN), confirmedBy: 'u-dpv1' };
    t.completedAt = iso(done + 10 * MIN);
    t.history = history([
      [STATUS.MOI, created, kh1.name], [STATUS.DA_TIEP_NHAN, created + 8 * MIN, 'Trần Thị Lan'], [STATUS.DA_PHAN_CONG, created + 15 * MIN, 'Trần Thị Lan'],
      [STATUS.KTV_DA_NHAN, created + 20 * MIN, 'Nguyễn Văn An'], [STATUS.DANG_KHAO_SAT, appt, 'Nguyễn Văn An'], [STATUS.CHO_DUYET_BAO_GIA, appt + 25 * MIN, 'Nguyễn Văn An'],
      [STATUS.DANG_THUC_HIEN, appt + 35 * MIN, kh1.name], [STATUS.CHO_NGHIEM_THU, done - 5 * MIN, 'Nguyễn Văn An'], [STATUS.CHO_THANH_TOAN, done, kh1.name],
      [STATUS.HOAN_TAT, done + 10 * MIN, 'Trần Thị Lan', 'Đã xác nhận chuyển khoản'],
    ]);
    tickets.push(t);
    items.filter((i) => i.warrantyDays > 0).forEach((i) => warranties.push({
      id: `bh-${i.id}`, ticketId: id, quoteItemId: i.id, deviceId: 'tb1', customerId: 'u-kh1', name: i.name, startAt: iso(done), endAt: iso(done + i.warrantyDays * DAY),
    }));
  }

  // 2. Khách demo: chờ duyệt báo giá (KTV k1 đang khảo sát tại chỗ)
  {
    const created = at(0, 7, 30, nowDate); const appt = now - 40 * MIN;
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh1', deviceId: 'tb2', categoryCode: 'NGUON', urgency: 'CAO', status: STATUS.CHO_DUYET_BAO_GIA, createdAt: created, slotStart: appt, description: 'PC bật lên quạt quay nhưng không lên hình, cần dùng gấp để làm việc.' });
    t.assignment = { techId: 'k1', appointmentAt: iso(appt), assignedAt: iso(created + 10 * MIN), deadline: iso(created + 25 * MIN), result: 'NHAN', respondedAt: iso(created + 14 * MIN) };
    t.checkInAt = iso(appt + 2 * MIN);
    t.quotes = [{ id: `bg-${id}`, type: 'CHINH', status: 'CHO_DUYET', items: [serviceItem('dv-nguon'), partItem('lk-nguon'), serviceItem('dv-toiuu')], note: 'Bộ nguồn cũ đã phù, không cấp đủ điện cho card màn hình.', createdAt: iso(now - 8 * MIN), createdBy: 'k1', decidedAt: null, rejectReason: '' }];
    t.photosBefore = ['mau'];
    t.history = history([
      [STATUS.MOI, created, kh1.name], [STATUS.DA_TIEP_NHAN, created + 5 * MIN, 'Trần Thị Lan'], [STATUS.DA_PHAN_CONG, created + 10 * MIN, 'Trần Thị Lan'],
      [STATUS.KTV_DA_NHAN, created + 14 * MIN, 'Nguyễn Văn An'], [STATUS.DANG_KHAO_SAT, appt + 2 * MIN, 'Nguyễn Văn An'], [STATUS.CHO_DUYET_BAO_GIA, now - 8 * MIN, 'Nguyễn Văn An'],
    ]);
    tickets.push(t);
    notifications.push({ id: 'tb-n1', userId: 'u-kh1', title: 'Có báo giá mới', body: `Kỹ thuật viên đã gửi báo giá cho phiếu ${id}. Vui lòng xem và duyệt.`, ticketId: id, read: false, createdAt: iso(now - 8 * MIN) });
  }

  // 3. Khách demo: phiếu mới tạo, chờ điều phối (ngày mai)
  {
    const created = now - 25 * MIN; const appt = at(1, 14, 0, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh1', deviceId: 'tb1', categoryCode: 'PHAN_MEM', status: STATUS.MOI, createdAt: created, slotStart: appt, description: 'Cần cài Office và phần mềm kế toán MISA cho máy mới.', aiResult: { categoryCode: 'PHAN_MEM', confidence: 0.82, urgency: 'TRUNG_BINH', reason: 'Mô tả có 3 dấu hiệu khớp với loại sự cố này.', state: 'ok', promptVersion: 'v1', ms: 740 } });
    t.history = history([[STATUS.MOI, created, kh1.name]]);
    tickets.push(t);
  }

  // 4. Phiếu mới của khách khác, AI chưa chắc chắn
  {
    const created = now - 12 * MIN; const appt = at(1, 9, 30, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh3', deviceId: 'tb4', categoryCode: 'KHAC', status: STATUS.MOI, createdAt: created, slotStart: appt, description: 'Máy hay tự tắt khi đang dùng, không rõ lỗi gì.', aiResult: { categoryCode: 'KHAC', confidence: 0.41, urgency: 'TRUNG_BINH', reason: 'Không nhận ra từ khóa đặc trưng của loại sự cố nào.', state: 'low_confidence', promptVersion: 'v1', ms: 910 } });
    t.history = history([[STATUS.MOI, created, 'Lê Minh Châu']]);
    tickets.push(t);
  }

  // 5. Đã tiếp nhận, chờ phân công (khẩn)
  {
    const created = now - 50 * MIN; const appt = at(0, 16, 0, nowDate) > now + 3 * HOUR ? at(0, 16, 0, nowDate) : at(1, 10, 0, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh2', deviceId: 'tb3', categoryCode: 'VIRUS', urgency: 'CAO', status: STATUS.DA_TIEP_NHAN, createdAt: created, slotStart: appt, description: 'Máy hiện thông báo đòi tiền chuộc, file Word không mở được. Cần xử lý gấp.' });
    t.history = history([[STATUS.MOI, created, 'Trần Thị Bình'], [STATUS.DA_TIEP_NHAN, created + 6 * MIN, 'Trần Thị Lan']]);
    tickets.push(t);
  }

  // 6. KTV demo: vừa được phân công, chờ phản hồi (còn hạn)
  {
    const created = now - 30 * MIN; const appt = at(0, 15, 30, nowDate) > now + 2 * HOUR ? at(0, 15, 30, nowDate) : at(1, 15, 30, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh4', deviceId: 'tb5', categoryCode: 'CAI_HDH', status: STATUS.DA_PHAN_CONG, createdAt: created, slotStart: appt, description: 'Muốn cài lại Windows 11 sạch, giữ lại dữ liệu ổ D.' });
    t.assignment = { techId: 'k1', appointmentAt: iso(appt), assignedAt: iso(now - 4 * MIN), deadline: iso(now + 11 * MIN), result: null, respondedAt: null };
    t.history = history([[STATUS.MOI, created, 'Võ Thị Dung'], [STATUS.DA_TIEP_NHAN, created + 10 * MIN, 'Trần Thị Lan'], [STATUS.DA_PHAN_CONG, now - 4 * MIN, 'Trần Thị Lan']]);
    tickets.push(t);
    notifications.push({ id: 'tb-n2', userId: 'u-ktv1', title: 'Việc mới được phân công', body: `Bạn được phân công phiếu ${id}. Vui lòng nhận hoặc từ chối trong 15 phút.`, ticketId: id, read: false, createdAt: iso(now - 4 * MIN) });
  }

  // 7. KTV demo: đã nhận việc, chiều nay
  {
    const created = at(-1, 20, 0, nowDate); const appt = at(0, 17, 0, nowDate) > now + HOUR ? at(0, 17, 0, nowDate) : at(1, 8, 30, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh5', deviceId: 'tb6', categoryCode: 'MANG', address: '9 Xô Viết Nghệ Tĩnh', ward: 'Thạnh Mỹ Tây', status: STATUS.KTV_DA_NHAN, createdAt: created, slotStart: appt, description: 'Wifi trong nhà chập chờn, phòng ngủ không bắt được sóng.' });
    t.assignment = { techId: 'k1', appointmentAt: iso(appt), assignedAt: iso(created + 30 * MIN), deadline: iso(created + 45 * MIN), result: 'NHAN', respondedAt: iso(created + 35 * MIN) };
    t.history = history([[STATUS.MOI, created, 'Hoàng Gia Bảo'], [STATUS.DA_TIEP_NHAN, created + 20 * MIN, 'Trần Thị Lan'], [STATUS.DA_PHAN_CONG, created + 30 * MIN, 'Trần Thị Lan'], [STATUS.KTV_DA_NHAN, created + 35 * MIN, 'Nguyễn Văn An']]);
    tickets.push(t);
  }

  // 8. KTV khác: đang thực hiện
  {
    const created = at(0, 7, 0, nowDate) < now ? at(0, 7, 0, nowDate) : now - 3 * HOUR; const appt = now - 70 * MIN;
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh3', deviceId: 'tb4', categoryCode: 'DU_LIEU', status: STATUS.DANG_THUC_HIEN, createdAt: created, slotStart: appt, description: 'USB chứa tài liệu luận văn không đọc được, cần lấy lại dữ liệu.' });
    t.assignment = { techId: 'k2', appointmentAt: iso(appt), assignedAt: iso(created + 10 * MIN), deadline: iso(created + 25 * MIN), result: 'NHAN', respondedAt: iso(created + 12 * MIN) };
    t.checkInAt = iso(appt);
    t.quotes = [{ id: `bg-${id}`, type: 'CHINH', status: 'DA_DUYET', items: [serviceItem('dv-dulieu')], note: '', createdAt: iso(appt + 15 * MIN), createdBy: 'k2', decidedAt: iso(appt + 20 * MIN), rejectReason: '' }];
    t.photosBefore = ['mau'];
    t.history = history([[STATUS.MOI, created, 'Lê Minh Châu'], [STATUS.DA_TIEP_NHAN, created + 5 * MIN, 'Trần Thị Lan'], [STATUS.DA_PHAN_CONG, created + 10 * MIN, 'Trần Thị Lan'], [STATUS.KTV_DA_NHAN, created + 12 * MIN, 'Lê Hoàng Phúc'], [STATUS.DANG_KHAO_SAT, appt, 'Lê Hoàng Phúc'], [STATUS.CHO_DUYET_BAO_GIA, appt + 15 * MIN, 'Lê Hoàng Phúc'], [STATUS.DANG_THUC_HIEN, appt + 20 * MIN, 'Lê Minh Châu']]);
    tickets.push(t);
  }

  // 9. Chờ xác nhận chuyển khoản (đối soát)
  {
    const created = at(-1, 9, 0, nowDate); const appt = at(-1, 14, 0, nowDate); const done = at(-1, 15, 20, nowDate);
    const id = nextId(created);
    const t = baseTicket({ id, customerId: 'u-kh2', deviceId: 'tb3', categoryCode: 'CAI_HDH', status: STATUS.CHO_THANH_TOAN, createdAt: created, slotStart: appt, description: 'Cài lại Windows và driver sau khi thay ổ cứng.' });
    const items = [serviceItem('dv-win'), serviceItem('dv-office')];
    t.assignment = { techId: 'k3', appointmentAt: iso(appt), assignedAt: iso(created + 10 * MIN), deadline: iso(created + 25 * MIN), result: 'NHAN', respondedAt: iso(created + 12 * MIN) };
    t.checkInAt = iso(appt);
    t.quotes = [{ id: `bg-${id}`, type: 'CHINH', status: 'DA_DUYET', items, note: '', createdAt: iso(appt + 10 * MIN), createdBy: 'k3', decidedAt: iso(appt + 15 * MIN), rejectReason: '' }];
    t.photosBefore = ['mau']; t.photosAfter = ['mau'];
    t.acceptance = { result: 'DAT', at: iso(done) };
    t.payment = { amount: items.reduce((s, i) => s + i.unitPrice, 0), method: 'CHUYEN_KHOAN', status: 'CHO_XAC_NHAN', paidAt: iso(done + 6 * MIN) };
    t.history = history([[STATUS.MOI, created, 'Trần Thị Bình'], [STATUS.DA_TIEP_NHAN, created + 5 * MIN, 'Trần Thị Lan'], [STATUS.DA_PHAN_CONG, created + 10 * MIN, 'Trần Thị Lan'], [STATUS.KTV_DA_NHAN, created + 12 * MIN, 'Trần Quang Huy'], [STATUS.DANG_KHAO_SAT, appt, 'Trần Quang Huy'], [STATUS.CHO_DUYET_BAO_GIA, appt + 10 * MIN, 'Trần Quang Huy'], [STATUS.DANG_THUC_HIEN, appt + 15 * MIN, 'Trần Thị Bình'], [STATUS.CHO_NGHIEM_THU, done - 5 * MIN, 'Trần Quang Huy'], [STATUS.CHO_THANH_TOAN, done, 'Trần Thị Bình']]);
    tickets.push(t);
  }

  // Cập nhật số lượt đánh giá của KTV theo dữ liệu sinh ra
  const technicians = TECHNICIANS.map((tech) => {
    const reviews = tickets.filter((t) => t.assignment?.techId === tech.id && t.review);
    if (!reviews.length) return { ...tech };
    const avg = reviews.reduce((s, t) => s + t.review.stars, 0) / reviews.length;
    return { ...tech, rating: Math.round(avg * 10) / 10, ratingCount: reviews.length };
  });

  notifications.push({ id: 'tb-n3', userId: 'u-dpv1', title: 'Phiếu mới cần tiếp nhận', body: 'Có 2 phiếu mới đang chờ tiếp nhận trên bảng điều phối.', ticketId: null, read: false, createdAt: iso(now - 12 * MIN) });

  return {
    version: 1,
    config: structuredClone(DEFAULT_CONFIG),
    users: USERS.map(withAccount),
    technicians,
    categories: structuredClone(CATEGORIES),
    services: structuredClone(SERVICES),
    parts: structuredClone(PARTS),
    devices: structuredClone(DEVICES),
    tickets,
    warranties,
    warrantyClaims: [],
    notifications,
    audit: [],
    resetTokens: [],
    seq,
  };
}
