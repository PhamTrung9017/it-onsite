/** API giả lập: dữ liệu lưu trong localStorage, áp dụng đầy đủ quy tắc nghiệp vụ như backend. */
import { AREAS, buildSeed } from './seed.js';
import { canTransition, STATUS, STATUS_LABEL, BUSY_STATUSES, isClosed } from '../../lib/ticketStatus.js';
import {
  DEFAULT_SCHEDULE, amountDue, canComplete, cancellationPolicy, hasConflict, offDuty, rankTechnicians, responseDeadline,
  reviewPolicy, validateReview, validateSchedule, validateSlot, warrantyStatus,
} from '../../lib/rules.js';
import { classifyIssue, redactPersonalData } from '../../lib/classifier.js';
import { buildVietQR } from '../../lib/vietqr.js';
import { ApiError } from '../apiError.js';

const KEY = 'itonsite.mock.v1';
const SESSION_KEY = 'itonsite.session.v1';
const DAY = 86400000;

export { ApiError };

/* ---------- Lưu trữ ---------- */

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : null;
  } catch {
    cache = null;
  }
  if (!cache || cache.version !== 1) {
    cache = buildSeed();
    persist();
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    throw new ApiError('Bộ nhớ trình duyệt đã đầy. Hãy xóa bớt ảnh hoặc khôi phục dữ liệu mẫu.', 507);
  }
}

const clone = (x) => structuredClone(x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

async function respond(fn, delay = 220) {
  await sleep(delay);
  const db = load();
  sweep(db);
  const result = fn(db);
  persist();
  return result === undefined ? undefined : clone(result);
}

/* ---------- Phiên đăng nhập ---------- */

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function currentUser(db) {
  const s = readSession();
  const user = s && db.users.find((u) => u.id === s.userId);
  if (!user || user.locked) throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  return user;
}

function requireRole(db, ...roles) {
  const user = currentUser(db);
  if (!roles.some((r) => user.roles.includes(r))) throw new ApiError('Bạn không có quyền thực hiện thao tác này.', 403);
  return user;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, roles: u.roles, address: u.address || '', ward: u.ward || '', locked: u.locked });

/* ---------- Tiện ích nghiệp vụ ---------- */

function findTicket(db, id) {
  const t = db.tickets.find((x) => x.id === id);
  if (!t) throw new ApiError('Không tìm thấy phiếu yêu cầu.', 404);
  return t;
}

const WORKING = [STATUS.DANG_KHAO_SAT, STATUS.CHO_DUYET_BAO_GIA, STATUS.DANG_THUC_HIEN];

function requireWorking(t) {
  if (!WORKING.includes(t.status)) throw new ApiError('Chỉ cập nhật ảnh và công việc khi đang khảo sát hoặc đang thực hiện.', 409);
}

function techOfUser(db, userId) {
  return db.technicians.find((t) => t.userId === userId);
}

function canView(db, user, t) {
  if (user.roles.includes('QTV') || user.roles.includes('DPV')) return true;
  if (user.roles.includes('KHACH') && t.customerId === user.id) return true;
  const tech = techOfUser(db, user.id);
  return Boolean(tech && t.assignment?.techId === tech.id);
}

function notify(db, userIds, title, body, ticketId = null) {
  [...new Set(userIds.filter(Boolean))].forEach((userId) => {
    db.notifications.push({ id: `tb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, userId, title, body, ticketId, read: false, createdAt: nowIso() });
  });
}

const dispatcherIds = (db) => db.users.filter((u) => u.roles.includes('DPV') && !u.locked).map((u) => u.id);
const adminIds = (db) => db.users.filter((u) => u.roles.includes('QTV') && !u.locked).map((u) => u.id);
const techUserId = (db, techId) => db.technicians.find((t) => t.id === techId)?.userId;

function audit(db, user, action, target, detail = '') {
  db.audit.push({ at: nowIso(), userId: user?.id || 'he-thong', userName: user?.name || 'Hệ thống', action, target, detail });
  if (db.audit.length > 500) db.audit.splice(0, db.audit.length - 500);
}

/** Chuyển trạng thái duy nhất của hệ thống: kiểm tra hợp lệ, ghi lịch sử, tăng phiên bản, gửi thông báo. */
function transition(db, t, to, actor, note = '') {
  if (!canTransition(t.status, to)) {
    throw new ApiError(`Không thể chuyển phiếu từ "${STATUS_LABEL[t.status]}" sang "${STATUS_LABEL[to]}".`, 409);
  }
  t.status = to;
  t.version += 1;
  t.updatedAt = nowIso();
  t.history.push({ status: to, at: t.updatedAt, by: actor?.name || 'Hệ thống', note });
  if (to === STATUS.HOAN_TAT || to === STATUS.DA_HUY) t.deviceCredentials = ''; // BR-12
  audit(db, actor, 'CHUYEN_TRANG_THAI', t.id, `${STATUS_LABEL[to]}${note ? ` – ${note}` : ''}`);
  const techUser = t.assignment ? techUserId(db, t.assignment.techId) : null;
  const msg = `Phiếu ${t.id}: ${STATUS_LABEL[to]}${note ? ` (${note})` : ''}.`;
  const recipients = [t.customerId, techUser];
  if ([STATUS.MOI, STATUS.DA_HUY, STATUS.CHO_THANH_TOAN].includes(to)) recipients.push(...dispatcherIds(db));
  notify(db, recipients.filter((id) => id !== actor?.id), 'Cập nhật trạng thái phiếu', msg, t.id);
}

/** BR-06: thu hồi phân công quá hạn phản hồi. */
function sweep(db) {
  const now = Date.now();
  db.tickets.forEach((t) => {
    if (t.status === STATUS.DA_PHAN_CONG && t.assignment && !t.assignment.result && new Date(t.assignment.deadline).getTime() < now) {
      t.assignment.result = 'QUA_HAN';
      t.assignment.respondedAt = nowIso();
      const techName = db.users.find((u) => u.id === techUserId(db, t.assignment.techId))?.name || 'KTV';
      transition(db, t, STATUS.DA_TIEP_NHAN, null, `${techName} quá hạn phản hồi, đã thu hồi phân công`);
      notify(db, dispatcherIds(db), 'Phân công quá hạn', `KTV chưa phản hồi phiếu ${t.id}. Vui lòng phân công lại.`, t.id);
    }
  });
}

function enrichTicket(db, t, viewer) {
  const customer = db.users.find((u) => u.id === t.customerId);
  const device = db.devices.find((d) => d.id === t.deviceId);
  const tech = t.assignment && db.technicians.find((x) => x.id === t.assignment.techId);
  const techUser = tech && db.users.find((u) => u.id === tech.userId);
  const category = db.categories.find((c) => c.code === t.categoryCode);
  const isAssignedTech = viewer && tech && tech.userId === viewer.id;
  return {
    ...t,
    // BR-12: chỉ KTV đang phụ trách được xem thông tin đăng nhập thiết bị
    deviceCredentials: isAssignedTech ? t.deviceCredentials : t.deviceCredentials ? '••••••' : '',
    customer: customer && { id: customer.id, name: customer.name, phone: customer.phone },
    device: device || null,
    category: category || null,
    technician: tech ? { id: tech.id, name: techUser?.name, phone: techUser?.phone, rating: tech.rating, ratingCount: tech.ratingCount } : null,
    amountDue: amountDue(t, db.config),
  };
}

function createTicketRecord(db, data) {
  const created = new Date();
  const p = (x) => String(x).padStart(2, '0');
  db.seq += 1;
  const id = `YC-${created.getFullYear()}${p(created.getMonth() + 1)}${p(created.getDate())}-${String(db.seq).padStart(3, '0')}`;
  const cat = db.categories.find((c) => c.code === data.categoryCode) || db.categories.find((c) => c.code === 'KHAC');
  const svc = db.services.find((s) => s.id === cat.serviceId);
  const t = {
    id,
    customerId: data.customerId,
    deviceId: data.deviceId,
    description: data.description,
    photos: data.photos || [],
    address: data.address,
    ward: data.ward,
    contactPhone: data.contactPhone,
    slotStart: data.slotStart,
    categoryCode: cat.code,
    urgency: data.urgency || 'TRUNG_BINH',
    estimatedMinutes: svc?.durationMin || 60,
    aiResult: data.aiResult || null,
    categoryConfirmed: false,
    deviceCredentials: data.deviceCredentials || '',
    status: STATUS.MOI,
    version: 1,
    createdAt: created.toISOString(),
    updatedAt: created.toISOString(),
    history: [{ status: STATUS.MOI, at: created.toISOString(), by: data.actorName, note: data.note || '' }],
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
    isWarranty: Boolean(data.isWarranty),
    warrantyOf: data.warrantyOf || null,
  };
  db.tickets.push(t);
  return t;
}

/** Mở bước thanh toán; không phát sinh chi phí thì hoàn tất luôn. */
function openPayment(db, t, actor) {
  const amount = amountDue(t, db.config) + (t.lateRescheduleFee || 0);
  if (amount > 0) {
    t.payment = { amount, method: null, status: 'CHO_THANH_TOAN' };
    return;
  }
  t.payment = { amount: 0, method: null, status: 'MIEN_PHI', paidAt: nowIso() };
  complete(db, t, actor, 'Không phát sinh chi phí');
}

/** Hoàn tất phiếu và phát hành bảo hành theo hạng mục (BR-07); phiếu bảo hành không phát hành bảo hành mới. */
function complete(db, t, actor, note) {
  transition(db, t, STATUS.HOAN_TAT, actor, note);
  t.completedAt = nowIso();
  const start = Date.now();
  (t.isWarranty ? [] : t.quotes)
    .filter((q) => q.status === 'DA_DUYET' || q.status === 'DUYET_MOT_PHAN')
    .flatMap((q) => q.items.filter((i) => i.selected && i.warrantyDays > 0))
    .forEach((i) => db.warranties.push({
      id: `bh-${i.id}`, ticketId: t.id, quoteItemId: i.id, deviceId: t.deviceId, customerId: t.customerId,
      name: i.name, startAt: new Date(start).toISOString(), endAt: new Date(start + i.warrantyDays * DAY).toISOString(),
    }));
  notify(db, [t.customerId], 'Phiếu đã hoàn tất', `Cảm ơn bạn! Phiếu ${t.id} đã hoàn tất. Bạn có thể đánh giá dịch vụ trong ${db.config.reviewWindowDays} ngày.`, t.id);
}

/* ---------- API ---------- */

export const mockApi = {
  /* ---------- Hệ thống ---------- */
  resetDemoData: () => respond(() => {
    cache = buildSeed();
  }, 300),

  /* ---------- Xác thực (UC01) ---------- */
  login: ({ identifier, password }) => respond((db) => {
    const id = identifier.trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === id || u.phone === id.replace(/\s/g, ''));
    if (!user || user.password !== password) throw new ApiError('Email/số điện thoại hoặc mật khẩu không đúng.', 401);
    if (user.locked) throw new ApiError('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.', 403);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, at: nowIso() }));
    audit(db, user, 'DANG_NHAP', user.id);
    return publicUser(user);
  }, 350),

  logout: async () => {
    localStorage.removeItem(SESSION_KEY);
  },

  me: () => respond((db) => publicUser(currentUser(db)), 80),

  register: ({ name, email, phone, password, consent }) => respond((db) => {
    if (!consent) throw new ApiError('Bạn cần đồng ý điều khoản và chính sách xử lý dữ liệu cá nhân.');
    if (!name.trim()) throw new ApiError('Vui lòng nhập họ tên.');
    if (!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email)) throw new ApiError('Email không hợp lệ.');
    if (!/^0\d{9}$/.test(phone)) throw new ApiError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.');
    if (password.length < 8) throw new ApiError('Mật khẩu cần ít nhất 8 ký tự.');
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase() || u.phone === phone)) {
      throw new ApiError('Email hoặc số điện thoại đã được đăng ký.', 409);
    }
    const user = { id: `u-${Date.now()}`, name: name.trim(), email, phone, password, roles: ['KHACH'], locked: false, address: '', ward: '', createdAt: nowIso(), consentAt: nowIso() };
    db.users.push(user);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, at: nowIso() }));
    audit(db, user, 'DANG_KY', user.id);
    return publicUser(user);
  }, 400),

  requestPasswordReset: ({ email }) => respond((db) => {
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) db.resetTokens.push({ userId: user.id, at: nowIso() });
    // Luôn trả cùng một thông báo để không lộ email nào đã đăng ký
    return { ok: true };
  }, 400),

  resetPassword: ({ token }) => respond((db) => {
    if (!db.resetTokens.some((r) => r.token && r.token === token)) throw new ApiError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
  }, 300),

  changePassword: ({ current, next }) => respond((db) => {
    const user = currentUser(db);
    if (user.password !== current) throw new ApiError('Mật khẩu hiện tại không đúng.');
    if (next.length < 8) throw new ApiError('Mật khẩu mới cần ít nhất 8 ký tự.');
    user.password = next;
    audit(db, user, 'DOI_MAT_KHAU', user.id);
  }),

  /* ---------- Công khai (UC03) ---------- */
  getCatalog: () => respond((db) => ({
    services: db.services.filter((s) => s.active),
    categories: db.categories,
    config: { surveyFee: db.config.surveyFee, freeCancelHours: db.config.freeCancelHours, serviceHours: db.config.serviceHours, areas: db.config.areas, reviewWindowDays: db.config.reviewWindowDays },
  }), 120),

  /* ---------- Khách hàng: hồ sơ, thiết bị (UC02) ---------- */
  updateProfile: (data) => respond((db) => {
    const user = currentUser(db);
    if (data.phone && !/^0\d{9}$/.test(data.phone)) throw new ApiError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.');
    Object.assign(user, { name: data.name?.trim() || user.name, phone: data.phone || user.phone, address: data.address ?? user.address, ward: data.ward ?? user.ward });
    audit(db, user, 'CAP_NHAT_HO_SO', user.id);
    return publicUser(user);
  }),

  listDevices: () => respond((db) => {
    const user = currentUser(db);
    return db.devices.filter((d) => d.customerId === user.id).map((d) => ({
      ...d,
      repairCount: db.tickets.filter((t) => t.deviceId === d.id && t.status === STATUS.HOAN_TAT).length,
      activeWarranties: db.warranties.filter((w) => w.deviceId === d.id && warrantyStatus(w).valid).length,
    }));
  }, 150),

  addDevice: ({ type, brand, model, note = '' }) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    if (!brand.trim() || !model.trim()) throw new ApiError('Vui lòng nhập hãng và dòng máy.');
    if (note.length > 255) throw new ApiError('Ghi chú thiết bị tối đa 255 ký tự.');
    const d = { id: `tb-${Date.now()}`, customerId: user.id, type, brand: brand.trim(), model: model.trim(), note: note.trim() };
    db.devices.push(d);
    return d;
  }),

  removeDevice: (id) => respond((db) => {
    const user = currentUser(db);
    const used = db.tickets.some((t) => t.deviceId === id && !isClosed(t.status));
    if (used) throw new ApiError('Thiết bị đang có phiếu xử lý, chưa thể xóa.', 409);
    db.devices = db.devices.filter((d) => !(d.id === id && d.customerId === user.id));
  }),

  /** NFR-10: chủ thể dữ liệu xem và tải dữ liệu của mình. */
  exportMyData: () => respond((db) => {
    const user = currentUser(db);
    return {
      exportedAt: nowIso(),
      profile: publicUser(user),
      consentAt: user.consentAt,
      devices: db.devices.filter((d) => d.customerId === user.id),
      tickets: db.tickets.filter((t) => t.customerId === user.id).map((t) => ({ id: t.id, status: STATUS_LABEL[t.status], description: t.description, address: t.address, createdAt: t.createdAt })),
      warranties: db.warranties.filter((w) => w.customerId === user.id),
    };
  }),

  requestDataDeletion: ({ reason }) => respond((db) => {
    const user = currentUser(db);
    const open = db.tickets.some((t) => t.customerId === user.id && !isClosed(t.status));
    if (open) throw new ApiError('Bạn còn phiếu đang xử lý. Yêu cầu xóa dữ liệu sẽ thực hiện được sau khi các phiếu kết thúc.', 409);
    notify(db, adminIds(db), 'Yêu cầu xóa dữ liệu cá nhân', `${user.name} yêu cầu xóa dữ liệu cá nhân. Lý do: ${reason || 'không ghi'}.`);
    audit(db, user, 'YEU_CAU_XOA_DU_LIEU', user.id, reason);
    return { ok: true };
  }),

  /* ---------- Phân loại sự cố (UC05) ---------- */
  classifyIssue: ({ description }) => respond((db) => {
    const started = Date.now();
    const cleaned = redactPersonalData(description);
    const r = classifyIssue(cleaned);
    const cat = db.categories.find((c) => c.code === r.categoryCode);
    const svc = db.services.find((s) => s.id === cat.serviceId);
    return {
      ...r,
      state: r.confidence < db.config.aiConfidenceThreshold ? 'low_confidence' : 'ok',
      category: cat,
      // BR-09: giá luôn lấy từ bảng giá trong CSDL
      suggestedService: svc,
      promptVersion: 'v1',
      ms: Date.now() - started + 650,
      redacted: cleaned !== description,
    };
  }, 650),

  /* ---------- Phiếu yêu cầu (UC04, UC06, UC07) ---------- */
  createTicket: (data) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    if (!data.deviceId || !db.devices.some((d) => d.id === data.deviceId && d.customerId === user.id)) throw new ApiError('Vui lòng chọn thiết bị.');
    if ((data.description || '').trim().length < 10) throw new ApiError('Mô tả sự cố cần ít nhất 10 ký tự.');
    if (!data.address?.trim() || !data.ward) throw new ApiError('Vui lòng nhập địa chỉ và chọn phường.');
    if (!db.config.areas.includes(data.ward)) throw new ApiError('Phường này hiện chưa nằm trong khu vực phục vụ.');
    const slotError = validateSlot(data.slotStart, db.config);
    if (slotError) throw new ApiError(slotError);
    if (!data.acceptTerms || !data.acceptPrivacy) throw new ApiError('Bạn cần đồng ý điều khoản dịch vụ và xử lý dữ liệu cá nhân.');
    if ((data.photos || []).length > 5) throw new ApiError('Mỗi yêu cầu đính kèm tối đa 5 ảnh.');
    const t = createTicketRecord(db, {
      ...data,
      customerId: user.id,
      contactPhone: user.phone,
      actorName: user.name,
      categoryCode: data.categoryCode || data.aiResult?.categoryCode || 'KHAC',
      urgency: data.aiResult?.urgency || 'TRUNG_BINH',
    });
    audit(db, user, 'TAO_PHIEU', t.id);
    notify(db, dispatcherIds(db), 'Phiếu mới cần tiếp nhận', `${user.name} vừa gửi phiếu ${t.id}.`, t.id);
    notify(db, [user.id], 'Đã nhận yêu cầu', `Phiếu ${t.id} đã được ghi nhận. Điều phối viên sẽ phân công kỹ thuật viên sớm.`, t.id);
    return enrichTicket(db, t, user);
  }, 450),

  listMyTickets: () => respond((db) => {
    const user = currentUser(db);
    return db.tickets
      .filter((t) => t.customerId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => enrichTicket(db, t, user));
  }, 160),

  getTicket: (id) => respond((db) => {
    const user = currentUser(db);
    const t = findTicket(db, id);
    if (!canView(db, user, t)) throw new ApiError('Bạn không có quyền xem phiếu này.', 403);
    return { ...enrichTicket(db, t, user), policy: cancellationPolicy(t, db.config), reviewPolicy: reviewPolicy(t, db.config), config: { surveyFee: db.config.surveyFee, freeCancelHours: db.config.freeCancelHours, serviceHours: db.config.serviceHours } };
  }, 150),

  cancelTicket: (id, { reason }) => respond((db) => {
    const user = requireRole(db, 'KHACH', 'DPV');
    const t = findTicket(db, id);
    const byCustomer = t.customerId === user.id;
    if (!byCustomer && !user.roles.includes('DPV')) throw new ApiError('Bạn không có quyền hủy phiếu này.', 403);
    const policy = cancellationPolicy(t, db.config);
    if (!policy.allowed) throw new ApiError(policy.reason, 409);
    if (!reason?.trim()) throw new ApiError('Vui lòng cho biết lý do hủy.');
    t.cancel = { by: user.id, byName: user.name, reason: reason.trim(), fee: byCustomer ? policy.fee : 0, at: nowIso() };
    transition(db, t, STATUS.DA_HUY, user, reason.trim());
    return enrichTicket(db, t, user);
  }),

  rescheduleTicket: (id, { slotStart }) => respond((db) => {
    const user = requireRole(db, 'KHACH', 'DPV');
    const t = findTicket(db, id);
    const byCustomer = t.customerId === user.id;
    if (!byCustomer && !user.roles.includes('DPV')) throw new ApiError('Bạn không có quyền đổi lịch phiếu này.', 403);
    const policy = cancellationPolicy(t, db.config);
    if (!policy.allowed) throw new ApiError(policy.reason, 409);
    const err = validateSlot(slotStart, db.config);
    if (err) throw new ApiError(err);
    if (t.assignment && [STATUS.DA_PHAN_CONG, STATUS.KTV_DA_NHAN].includes(t.status)) {
      // Giữ KTV đã phân công nếu KTV rảnh ở khung giờ mới (BR-04); nếu không, khách chọn giờ khác hoặc liên hệ điều phối
      const tech = db.technicians.find((x) => x.id === t.assignment.techId);
      if (offDuty(tech?.schedule, slotStart, t.estimatedMinutes)) {
        throw new ApiError('Kỹ thuật viên phụ trách không làm việc vào giờ này. Vui lòng chọn khung giờ khác.', 409);
      }
      if (hasConflict(t.assignment.techId, slotStart, t.estimatedMinutes, db.tickets, db.config, t.id)) {
        throw new ApiError('Kỹ thuật viên phụ trách đã có lịch ở khung giờ này. Vui lòng chọn khung giờ khác.', 409);
      }
      t.assignment.appointmentAt = slotStart;
      notify(db, [techUserId(db, t.assignment.techId)], 'Khách đổi lịch hẹn', `Phiếu ${t.id} đổi lịch hẹn, vui lòng xem giờ mới.`, t.id);
    }
    const fee = byCustomer ? policy.fee : 0;
    t.slotStart = slotStart;
    t.lateRescheduleFee = (t.lateRescheduleFee || 0) + fee;
    t.version += 1;
    t.updatedAt = nowIso();
    t.history.push({ status: t.status, at: t.updatedAt, by: user.name, note: `Đổi lịch hẹn${fee ? ` (phí đổi lịch sát giờ ${fee.toLocaleString('vi-VN')}đ)` : ''}` });
    notify(db, dispatcherIds(db).filter((x) => x !== user.id), 'Khách đổi lịch hẹn', `Phiếu ${t.id} đổi sang khung giờ mới.`, t.id);
    audit(db, user, 'DOI_LICH', t.id, slotStart);
    return enrichTicket(db, t, user);
  }),

  /* ---------- Báo giá (UC11) ---------- */
  decideQuote: (ticketId, quoteId, { decision, itemIds = [], reason = '' }) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    const t = findTicket(db, ticketId);
    if (t.customerId !== user.id) throw new ApiError('Bạn không có quyền duyệt báo giá này.', 403);
    const q = t.quotes.find((x) => x.id === quoteId);
    if (!q || q.status !== 'CHO_DUYET' || t.status !== STATUS.CHO_DUYET_BAO_GIA) throw new ApiError('Báo giá không còn ở trạng thái chờ duyệt.', 409);
    applyQuoteDecision(db, t, q, user, decision, itemIds, reason);
    return enrichTicket(db, t, user);
  }, 350),

  /* ---------- Nghiệm thu (UC13) ---------- */
  acceptWork: (id, { ok, reason }) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    const t = findTicket(db, id);
    if (t.customerId !== user.id) throw new ApiError('Bạn không có quyền nghiệm thu phiếu này.', 403);
    if (t.status !== STATUS.CHO_NGHIEM_THU) throw new ApiError('Phiếu chưa ở bước nghiệm thu.', 409);
    if (ok) {
      t.acceptance = { result: 'DAT', at: nowIso() };
      transition(db, t, STATUS.CHO_THANH_TOAN, user, 'Khách nghiệm thu đạt');
      openPayment(db, t, user);
    } else {
      if (!reason?.trim()) throw new ApiError('Vui lòng mô tả điểm chưa đạt để kỹ thuật viên xử lý lại.');
      t.acceptance = { result: 'CHUA_DAT', reason: reason.trim(), at: nowIso() };
      transition(db, t, STATUS.DANG_THUC_HIEN, user, `Chưa đạt: ${reason.trim()}`);
    }
    return enrichTicket(db, t, user);
  }),

  /* ---------- Thanh toán (UC14) ---------- */
  getPaymentInfo: (id) => respond((db) => {
    const user = currentUser(db);
    const t = findTicket(db, id);
    if (!canView(db, user, t)) throw new ApiError('Bạn không có quyền xem phiếu này.', 403);
    const amount = t.payment?.amount ?? amountDue(t, db.config);
    const bank = db.config.bank;
    return {
      amount,
      content: `IT OnSite ${t.id}`,
      bank,
      qrPayload: buildVietQR({ bin: bank.bin, accountNumber: bank.accountNumber, amount, content: `ITONSITE ${t.id}` }),
      payment: t.payment,
      payable: t.status === STATUS.CHO_THANH_TOAN && t.payment?.status === 'CHO_THANH_TOAN',
    };
  }, 120),

  reportTransfer: (id) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    const t = findTicket(db, id);
    if (t.customerId !== user.id || t.status !== STATUS.CHO_THANH_TOAN) throw new ApiError('Phiếu không ở bước thanh toán.', 409);
    if (t.payment?.status !== 'CHO_THANH_TOAN') throw new ApiError('Phiếu này đã được ghi nhận thanh toán.', 409);
    t.payment = { ...t.payment, method: 'CHUYEN_KHOAN', status: 'CHO_XAC_NHAN', paidAt: nowIso() };
    t.version += 1;
    notify(db, dispatcherIds(db), 'Khách báo đã chuyển khoản', `Phiếu ${t.id}: ${t.payment.amount.toLocaleString('vi-VN')}đ cần đối soát.`, t.id);
    return enrichTicket(db, t, user);
  }),

  chooseCash: (id) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    const t = findTicket(db, id);
    if (t.customerId !== user.id || t.status !== STATUS.CHO_THANH_TOAN) throw new ApiError('Phiếu không ở bước thanh toán.', 409);
    if (t.payment?.status !== 'CHO_THANH_TOAN') throw new ApiError('Phiếu này đã được ghi nhận thanh toán.', 409);
    t.payment = { ...t.payment, method: 'TIEN_MAT', status: 'CHO_THANH_TOAN' };
    const techUser = t.assignment && techUserId(db, t.assignment.techId);
    notify(db, [techUser], 'Khách chọn trả tiền mặt', `Phiếu ${t.id}: thu ${t.payment.amount.toLocaleString('vi-VN')}đ tiền mặt.`, t.id);
    return enrichTicket(db, t, user);
  }),

  /* ---------- Bảo hành (UC15) ---------- */
  listMyWarranties: () => respond((db) => {
    const user = currentUser(db);
    return db.warranties
      .filter((w) => w.customerId === user.id)
      .map((w) => ({ ...w, ...warrantyStatus(w), device: db.devices.find((d) => d.id === w.deviceId), claim: db.warrantyClaims.filter((c) => c.warrantyId === w.id).at(-1) || null }))
      .sort((a, b) => Number(b.valid) - Number(a.valid) || b.endAt.localeCompare(a.endAt));
  }, 150),

  createWarrantyClaim: ({ warrantyId, description, slotStart }) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    const w = db.warranties.find((x) => x.id === warrantyId && x.customerId === user.id);
    if (!w) throw new ApiError('Không tìm thấy phiếu bảo hành.', 404);
    if (!warrantyStatus(w).valid) throw new ApiError('Phiếu bảo hành đã hết hạn.', 409);
    if (db.warrantyClaims.some((c) => c.warrantyId === w.id && c.status === 'CHO_XU_LY')) throw new ApiError('Hạng mục này đang có yêu cầu bảo hành chờ xử lý.', 409);
    if ((description || '').trim().length < 10) throw new ApiError('Vui lòng mô tả lỗi ít nhất 10 ký tự.');
    const err = validateSlot(slotStart, db.config);
    if (err) throw new ApiError(err);
    const claim = { id: `ycbh-${Date.now()}`, warrantyId: w.id, customerId: user.id, description: description.trim(), slotStart, status: 'CHO_XU_LY', createdAt: nowIso(), newTicketId: null, reason: '' };
    db.warrantyClaims.push(claim);
    notify(db, dispatcherIds(db), 'Yêu cầu bảo hành mới', `${user.name} yêu cầu bảo hành "${w.name}" (phiếu gốc ${w.ticketId}).`);
    return claim;
  }),

  /* ---------- Đánh giá (UC16) ---------- */
  submitReview: (id, { stars, comment }) => respond((db) => {
    const user = requireRole(db, 'KHACH');
    const t = findTicket(db, id);
    if (t.customerId !== user.id) throw new ApiError('Bạn không có quyền đánh giá phiếu này.', 403);
    const policy = reviewPolicy(t, db.config);
    if (!policy.allowed) throw new ApiError(policy.reason, 409);
    const err = validateReview(stars, comment || '');
    if (err) throw new ApiError(err);
    t.review = { stars, comment: (comment || '').trim(), at: nowIso() };
    const tech = db.technicians.find((x) => x.id === t.assignment?.techId);
    if (tech) {
      tech.rating = Math.round(((tech.rating * tech.ratingCount + stars) / (tech.ratingCount + 1)) * 10) / 10;
      tech.ratingCount += 1;
    }
    if (stars <= 2) notify(db, adminIds(db), 'Cảnh báo đánh giá thấp', `Phiếu ${t.id} nhận ${stars} sao: "${t.review.comment}"`, t.id);
    return enrichTicket(db, t, user);
  }),

  /* ---------- Thông báo (UC17) ---------- */
  listNotifications: () => respond((db) => {
    const user = currentUser(db);
    return db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  }, 100),

  markNotificationsRead: (ids) => respond((db) => {
    const user = currentUser(db);
    db.notifications.forEach((n) => {
      if (n.userId === user.id && (!ids || ids.includes(n.id))) n.read = true;
    });
  }, 60),

  /* ---------- Kỹ thuật viên (UC09, UC10, UC12, UC14) ---------- */
  listMyJobs: () => respond((db) => {
    const user = requireRole(db, 'KTV');
    const tech = techOfUser(db, user.id);
    if (!tech) return [];
    return db.tickets
      .filter((t) => t.assignment?.techId === tech.id && (!isClosed(t.status) || Date.now() - new Date(t.updatedAt).getTime() < 7 * DAY))
      .filter((t) => !(t.status === STATUS.DA_TIEP_NHAN))
      .sort((a, b) => a.assignment.appointmentAt.localeCompare(b.assignment.appointmentAt))
      .map((t) => enrichTicket(db, t, user));
  }, 160),

  respondAssignment: (id, { accept, reason }) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    const tech = techOfUser(db, user.id);
    if (t.assignment?.techId !== tech?.id || t.status !== STATUS.DA_PHAN_CONG || t.assignment.result) throw new ApiError('Phân công này không còn chờ bạn phản hồi.', 409);
    if (new Date(t.assignment.deadline).getTime() < Date.now()) throw new ApiError('Đã quá hạn phản hồi, phân công này sẽ được chuyển cho kỹ thuật viên khác.', 409);
    t.assignment.respondedAt = nowIso();
    if (accept) {
      t.assignment.result = 'NHAN';
      transition(db, t, STATUS.KTV_DA_NHAN, user);
    } else {
      if (!reason?.trim()) throw new ApiError('Vui lòng cho biết lý do từ chối.');
      t.assignment.result = 'TU_CHOI';
      t.assignment.rejectReason = reason.trim();
      transition(db, t, STATUS.DA_TIEP_NHAN, user, `KTV từ chối: ${reason.trim()}`);
      notify(db, dispatcherIds(db), 'KTV từ chối việc', `${user.name} từ chối phiếu ${t.id}. Vui lòng phân công lại.`, t.id);
    }
    return enrichTicket(db, t, user);
  }),

  checkIn: (id) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    t.checkInAt = nowIso();
    transition(db, t, STATUS.DANG_KHAO_SAT, user, 'Kỹ thuật viên đã đến nơi');
    return enrichTicket(db, t, user);
  }),

  createQuote: (id, { items, note }) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    if (![STATUS.DANG_KHAO_SAT, STATUS.DANG_THUC_HIEN].includes(t.status)) throw new ApiError('Chỉ lập báo giá khi đang khảo sát hoặc đang thực hiện (báo giá bổ sung).', 409);
    if (!items?.length) throw new ApiError('Báo giá cần ít nhất một hạng mục.');
    const type = t.status === STATUS.DANG_KHAO_SAT ? 'CHINH' : 'BO_SUNG';
    const quote = {
      id: `bg-${t.id}-${t.quotes.length + 1}`,
      type,
      status: 'CHO_DUYET',
      // BR-13: cố định đơn giá tại thời điểm lập báo giá
      items: items.map((it, i) => {
        const src = it.kind === 'service' ? db.services.find((s) => s.id === it.refId) : db.parts.find((p) => p.id === it.refId);
        if (!src) throw new ApiError('Hạng mục không còn trong danh mục.');
        const needed = items.filter((x) => x.kind === 'part' && x.refId === it.refId).reduce((sum, x) => sum + x.qty, 0);
        if (it.kind === 'part' && src.stock < needed) throw new ApiError(`Linh kiện "${src.name}" chỉ còn ${src.stock} trong kho.`);
        return { id: `${t.id}-${t.quotes.length + 1}-${i}`, kind: it.kind, refId: src.id, name: src.name, qty: it.qty, unitPrice: t.isWarranty ? 0 : src.price, warrantyDays: src.warrantyDays, selected: true };
      }),
      note: note || '',
      createdAt: nowIso(),
      createdBy: techOfUser(db, user.id).id,
      decidedAt: null,
      rejectReason: '',
    };
    t.quotes.push(quote);
    transition(db, t, STATUS.CHO_DUYET_BAO_GIA, user, type === 'BO_SUNG' ? 'Báo giá bổ sung' : '');
    notify(db, [t.customerId], type === 'BO_SUNG' ? 'Có báo giá bổ sung' : 'Có báo giá mới', `Phiếu ${t.id}: vui lòng xem và duyệt báo giá.`, t.id);
    return enrichTicket(db, t, user);
  }, 350),

  myTechProfile: () => respond((db) => {
    const user = requireRole(db, 'KTV');
    const tech = techOfUser(db, user.id);
    const jobs = db.tickets.filter((t) => t.assignment?.techId === tech?.id);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const doneMonth = jobs.filter((t) => t.status === STATUS.HOAN_TAT && new Date(t.completedAt) >= monthStart);
    const reviews = jobs.filter((t) => t.review).sort((a, b) => b.review.at.localeCompare(a.review.at)).slice(0, 5)
      .map((t) => ({ ticketId: t.id, ...t.review, customer: db.users.find((u) => u.id === t.customerId)?.name }));
    return {
      user: publicUser(user),
      tech,
      categories: db.categories,
      stats: { doneMonth: doneMonth.length, revenueMonth: doneMonth.reduce((s, t) => s + (t.payment?.amount || 0), 0), doneTotal: jobs.filter((t) => t.status === STATUS.HOAN_TAT).length },
      reviews,
    };
  }, 150),

  listParts: () => respond((db) => {
    requireRole(db, 'KTV', 'QTV');
    return db.parts.filter((p) => p.active);
  }, 100),

  /** UC11 luồng 1a: gửi mã xác nhận cho khách duyệt tại chỗ. */
  sendOnsiteCode: (id) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id || t.status !== STATUS.CHO_DUYET_BAO_GIA) throw new ApiError('Không có báo giá chờ duyệt.', 409);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    t.onsiteCode = { code, expiresAt: new Date(Date.now() + 10 * 60000).toISOString() };
    notify(db, [t.customerId], 'Mã xác nhận báo giá', `Mã xác nhận báo giá phiếu ${t.id} là ${code} (hiệu lực 10 phút). Chỉ đọc mã cho kỹ thuật viên khi bạn đồng ý toàn bộ báo giá.`, t.id);
    return { sentTo: db.users.find((u) => u.id === t.customerId)?.phone };
  }),

  confirmOnsite: (id, { code }) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    if (!t.onsiteCode || new Date(t.onsiteCode.expiresAt).getTime() < Date.now()) throw new ApiError('Mã đã hết hạn, vui lòng gửi lại mã.', 409);
    if (t.onsiteCode.code !== code.trim()) throw new ApiError('Mã xác nhận không đúng.');
    const q = t.quotes.find((x) => x.status === 'CHO_DUYET');
    const customer = db.users.find((u) => u.id === t.customerId);
    t.onsiteCode = null;
    applyQuoteDecision(db, t, q, { ...customer, name: `${customer.name} (xác nhận tại chỗ)` }, 'approve', [], '');
    return enrichTicket(db, t, user);
  }),

  updateWork: (id, { checklist }) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    requireWorking(t);
    t.checklist = checklist;
    t.version += 1;
    return enrichTicket(db, t, user);
  }, 120),

  addWorkPhotos: (id, { kind, photos }) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    requireWorking(t);
    const key = kind === 'before' ? 'photosBefore' : 'photosAfter';
    if (t[key].length + photos.length > 6) throw new ApiError('Mỗi loại ảnh tối đa 6 ảnh.');
    t[key] = [...t[key], ...photos];
    t.version += 1;
    return enrichTicket(db, t, user);
  }, 300),

  removeWorkPhoto: (id, { kind, index }) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    requireWorking(t);
    const key = kind === 'before' ? 'photosBefore' : 'photosAfter';
    t[key] = t[key].filter((_, i) => i !== index);
    return enrichTicket(db, t, user);
  }, 100),

  completeWork: (id) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    if (!canComplete(t)) throw new ApiError('Cần ít nhất 1 ảnh trước và 1 ảnh sau khi xử lý (BR-11).', 409);
    transition(db, t, STATUS.CHO_NGHIEM_THU, user, 'Kỹ thuật viên báo hoàn thành');
    return enrichTicket(db, t, user);
  }),

  confirmCash: (id) => respond((db) => {
    const user = requireRole(db, 'KTV');
    const t = findTicket(db, id);
    if (t.assignment?.techId !== techOfUser(db, user.id)?.id) throw new ApiError('Bạn không phụ trách phiếu này.', 403);
    if (t.status !== STATUS.CHO_THANH_TOAN || t.payment?.status !== 'CHO_THANH_TOAN') throw new ApiError('Phiếu không chờ thu tiền mặt.', 409);
    t.payment = { ...t.payment, method: 'TIEN_MAT', status: 'DA_THU', paidAt: nowIso(), confirmedBy: user.id, confirmedByName: user.name };
    complete(db, t, user, `Đã thu tiền mặt ${t.payment.amount.toLocaleString('vi-VN')}đ`);
    notify(db, dispatcherIds(db), 'Tiền mặt cần đối soát', `${user.name} đã thu ${t.payment.amount.toLocaleString('vi-VN')}đ phiếu ${t.id}.`, t.id);
    return enrichTicket(db, t, user);
  }),

  /* ---------- Điều phối (UC05, UC08, UC14, UC15) ---------- */
  listBoard: () => respond((db) => {
    requireRole(db, 'DPV', 'QTV');
    const recent = Date.now() - 2 * DAY;
    return db.tickets
      .filter((t) => !isClosed(t.status) || new Date(t.updatedAt).getTime() > recent)
      .map((t) => enrichTicket(db, t, null));
  }, 180),

  receiveTicket: (id, { categoryCode, urgency, version }) => respond((db) => {
    const user = requireRole(db, 'DPV');
    const t = findTicket(db, id);
    if (version !== undefined && version !== t.version) throw new ApiError('Phiếu vừa được người khác cập nhật. Vui lòng tải lại.', 409);
    const cat = db.categories.find((c) => c.code === categoryCode);
    if (!cat) throw new ApiError('Vui lòng chọn loại sự cố.');
    t.categoryCode = categoryCode;
    t.urgency = urgency || t.urgency;
    t.categoryConfirmed = true;
    t.estimatedMinutes = db.services.find((s) => s.id === cat.serviceId)?.durationMin || 60;
    transition(db, t, STATUS.DA_TIEP_NHAN, user, `Loại sự cố: ${cat.name}`);
    return enrichTicket(db, t, user);
  }),

  suggestTechnicians: (id, { appointmentAt }) => respond((db) => {
    requireRole(db, 'DPV');
    const t = findTicket(db, id);
    return rankTechnicians({ ticket: t, technicians: db.technicians, tickets: db.tickets, config: db.config, appointmentAt })
      .map((r) => ({ ...r, tech: { ...r.tech, name: db.users.find((u) => u.id === r.tech.userId)?.name } }));
  }, 200),

  assignTechnician: (id, { techId, appointmentAt, version }) => respond((db) => {
    const user = requireRole(db, 'DPV');
    const t = findTicket(db, id);
    // UC08 ngoại lệ 4a: chống hai điều phối viên phân công cùng lúc
    if (version !== undefined && version !== t.version) throw new ApiError('Phiếu vừa được người khác cập nhật. Vui lòng tải lại trước khi phân công.', 409);
    if (t.status !== STATUS.DA_TIEP_NHAN) throw new ApiError('Chỉ phân công phiếu ở trạng thái Đã tiếp nhận.', 409);
    const tech = db.technicians.find((x) => x.id === techId && x.active);
    if (!tech) throw new ApiError('Kỹ thuật viên không khả dụng.');
    const at = new Date(appointmentAt).getTime();
    if (Number.isNaN(at) || at < Date.now()) throw new ApiError('Giờ hẹn phải ở tương lai.');
    if (offDuty(tech.schedule, appointmentAt, t.estimatedMinutes)) throw new ApiError('Giờ hẹn nằm ngoài lịch làm việc của kỹ thuật viên này.', 409);
    if (hasConflict(tech.id, appointmentAt, t.estimatedMinutes, db.tickets, db.config, t.id)) throw new ApiError('Kỹ thuật viên bị trùng lịch ở khung giờ này (BR-04).', 409);
    const assignedAt = nowIso();
    t.assignment = { techId, appointmentAt, assignedAt, deadline: responseDeadline(assignedAt, db.config), result: null, respondedAt: null };
    const techName = db.users.find((u) => u.id === tech.userId)?.name;
    transition(db, t, STATUS.DA_PHAN_CONG, user, `Phân công ${techName}`);
    notify(db, [tech.userId], 'Việc mới được phân công', `Bạn được phân công phiếu ${t.id}. Vui lòng phản hồi trong ${db.config.techResponseMinutes} phút.`, t.id);
    return enrichTicket(db, t, user);
  }, 300),

  listPayments: () => respond((db) => {
    requireRole(db, 'DPV', 'QTV');
    const byPaidAt = (a, b) => (b.payment.paidAt || '').localeCompare(a.payment.paidAt || '');
    const pending = db.tickets.filter((t) => ['CHO_XAC_NHAN', 'DA_THU'].includes(t.payment?.status)).sort(byPaidAt);
    const done = db.tickets.filter((t) => ['DA_XAC_NHAN', 'DA_DOI_SOAT'].includes(t.payment?.status)).sort(byPaidAt).slice(0, 60);
    return [...pending, ...done].map((t) => enrichTicket(db, t, null));
  }, 160),

  confirmTransfer: (id) => respond((db) => {
    const user = requireRole(db, 'DPV');
    const t = findTicket(db, id);
    if (t.payment?.status !== 'CHO_XAC_NHAN') throw new ApiError('Khoản chuyển khoản này không chờ xác nhận.', 409);
    t.payment = { ...t.payment, status: 'DA_XAC_NHAN', confirmedBy: user.id, confirmedByName: user.name, confirmedAt: nowIso() };
    complete(db, t, user, 'Đã xác nhận chuyển khoản');
    return enrichTicket(db, t, user);
  }),

  reconcileCash: (id) => respond((db) => {
    const user = requireRole(db, 'DPV');
    const t = findTicket(db, id);
    if (t.payment?.status !== 'DA_THU') throw new ApiError('Khoản tiền mặt này không chờ đối soát.', 409);
    t.payment = { ...t.payment, status: 'DA_DOI_SOAT', reconciledBy: user.id, reconciledAt: nowIso() };
    audit(db, user, 'DOI_SOAT_TIEN_MAT', t.id);
    return enrichTicket(db, t, user);
  }),

  listWarrantyClaims: () => respond((db) => {
    requireRole(db, 'DPV', 'QTV');
    return db.warrantyClaims
      .map((c) => {
        const w = db.warranties.find((x) => x.id === c.warrantyId);
        return { ...c, warranty: w ? { ...w, ...warrantyStatus(w) } : null, customer: publicUser(db.users.find((u) => u.id === c.customerId)), device: w && db.devices.find((d) => d.id === w.deviceId) };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, 160),

  decideWarrantyClaim: (id, { valid, reason }) => respond((db) => {
    const user = requireRole(db, 'DPV');
    const c = db.warrantyClaims.find((x) => x.id === id);
    if (!c || c.status !== 'CHO_XU_LY') throw new ApiError('Yêu cầu không còn chờ xử lý.', 409);
    const w = db.warranties.find((x) => x.id === c.warrantyId);
    if (valid) {
      if (!warrantyStatus(w).valid) throw new ApiError('Bảo hành đã hết hạn, không thể chấp nhận (BR-07).', 409);
      const original = db.tickets.find((t) => t.id === w.ticketId);
      const customer = db.users.find((u) => u.id === c.customerId);
      const nt = createTicketRecord(db, {
        customerId: c.customerId, deviceId: w.deviceId, description: `[Bảo hành ${w.name}] ${c.description}`,
        address: original.address, ward: original.ward, contactPhone: customer.phone, slotStart: c.slotStart,
        categoryCode: original.categoryCode, actorName: user.name, isWarranty: true, warrantyOf: w.ticketId, note: `Bảo hành cho phiếu ${w.ticketId}`,
      });
      c.status = 'HOP_LE';
      c.newTicketId = nt.id;
      notify(db, [c.customerId], 'Yêu cầu bảo hành được chấp nhận', `Đã tạo phiếu bảo hành ${nt.id}, không tính phí.`, nt.id);
    } else {
      if (!reason?.trim()) throw new ApiError('Vui lòng ghi lý do từ chối.');
      c.status = 'TU_CHOI';
      c.reason = reason.trim();
      notify(db, [c.customerId], 'Yêu cầu bảo hành bị từ chối', `"${w.name}": ${c.reason}`);
    }
    c.decidedBy = user.name;
    c.decidedAt = nowIso();
    audit(db, user, 'XU_LY_BAO_HANH', c.id, valid ? 'Hợp lệ' : `Từ chối: ${c.reason}`);
    return c;
  }),

  /* ---------- Quản trị (UC18–UC23) ---------- */
  adminData: () => respond((db) => {
    requireRole(db, 'QTV');
    return {
      technicians: db.technicians.map((t) => {
        const u = db.users.find((x) => x.id === t.userId);
        const jobs = db.tickets.filter((x) => x.assignment?.techId === t.id);
        return { ...t, name: u?.name, email: u?.email, phone: u?.phone, done: jobs.filter((x) => x.status === STATUS.HOAN_TAT).length, activeJobs: jobs.filter((x) => BUSY_STATUSES.includes(x.status)).length };
      }),
      services: db.services,
      parts: db.parts,
      categories: db.categories,
      users: db.users.map(publicUser),
      config: db.config,
      allAreas: [...new Set([...AREAS, ...db.config.areas])],
      audit: db.audit.slice(-80).reverse(),
    };
  }, 160),

  saveService: (svc) => respond((db) => {
    const user = requireRole(db, 'QTV');
    if (!svc.name?.trim()) throw new ApiError('Vui lòng nhập tên dịch vụ.');
    if (!(svc.price >= 0) || !(svc.durationMin > 0) || !(svc.warrantyDays >= 0)) throw new ApiError('Giá, thời lượng và thời hạn bảo hành phải là số hợp lệ.');
    if (svc.id) {
      const cur = db.services.find((s) => s.id === svc.id);
      audit(db, user, 'SUA_BANG_GIA', svc.id, `${cur.price} → ${svc.price}`);
      Object.assign(cur, svc);
    } else {
      db.services.push({ ...svc, id: `dv-${Date.now()}`, active: true });
      audit(db, user, 'THEM_DICH_VU', svc.name);
    }
  }),

  savePart: (part) => respond((db) => {
    const user = requireRole(db, 'QTV');
    if (!part.name?.trim()) throw new ApiError('Vui lòng nhập tên linh kiện.');
    if (!(part.price >= 0) || !(part.stock >= 0) || !(part.warrantyDays >= 0)) throw new ApiError('Giá, tồn kho và bảo hành phải là số không âm.');
    if (part.id) Object.assign(db.parts.find((p) => p.id === part.id), part);
    else db.parts.push({ ...part, id: `lk-${Date.now()}`, active: true });
    audit(db, user, part.id ? 'SUA_LINH_KIEN' : 'THEM_LINH_KIEN', part.name);
  }),

  saveTechnician: (data) => respond((db) => {
    const user = requireRole(db, 'QTV');
    if (!data.skills?.length) throw new ApiError('Kỹ thuật viên cần ít nhất một kỹ năng.');
    if (!data.areas?.length) throw new ApiError('Kỹ thuật viên cần ít nhất một khu vực phụ trách.');
    const schedule = data.schedule ? { ...data.schedule, workDays: [...new Set(data.schedule.workDays)].sort((a, b) => a - b), daysOff: [...new Set(data.schedule.daysOff || [])].sort() } : null;
    const scheduleError = schedule && validateSchedule(schedule);
    if (scheduleError) throw new ApiError(scheduleError);
    if (data.id) {
      const t = db.technicians.find((x) => x.id === data.id);
      Object.assign(t, { skills: data.skills, areas: data.areas, active: data.active }, schedule && { schedule });
      const u = db.users.find((x) => x.id === t.userId);
      if (data.phone) u.phone = data.phone;
      if (data.name) u.name = data.name;
    } else {
      if (!data.name?.trim() || !/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(data.email || '')) throw new ApiError('Vui lòng nhập họ tên và email hợp lệ.');
      if (db.users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) throw new ApiError('Email đã tồn tại.', 409);
      const u = { id: `u-${Date.now()}`, name: data.name.trim(), email: data.email, phone: data.phone || '', password: 'doimatkhau123', roles: ['KTV'], locked: false, createdAt: nowIso(), consentAt: nowIso() };
      db.users.push(u);
      db.technicians.push({ id: `k-${Date.now()}`, userId: u.id, skills: data.skills, areas: data.areas, rating: 5, ratingCount: 0, active: true, schedule: schedule || { ...DEFAULT_SCHEDULE } });
    }
    audit(db, user, data.id ? 'SUA_KTV' : 'THEM_KTV', data.name);
  }),

  saveUserRoles: (userId, { roles, locked }) => respond((db) => {
    const admin = requireRole(db, 'QTV');
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new ApiError('Không tìm thấy tài khoản.', 404);
    if (u.id === admin.id && (!roles.includes('QTV') || locked)) throw new ApiError('Không thể tự gỡ quyền quản trị hoặc tự khóa tài khoản của mình.', 409);
    if (!roles.length) throw new ApiError('Tài khoản cần ít nhất một vai trò.');
    if (roles.includes('KTV') && !db.technicians.some((t) => t.userId === u.id)) {
      db.technicians.push({ id: `k-${Date.now()}`, userId: u.id, skills: ['KHAC'], areas: [db.config.areas[0]], rating: 5, ratingCount: 0, active: true, schedule: { ...DEFAULT_SCHEDULE } });
    }
    u.roles = roles;
    u.locked = Boolean(locked);
    audit(db, admin, 'PHAN_QUYEN', u.email, `${roles.join(', ')}${locked ? ' (khóa)' : ''}`);
  }),

  createInternalUser: ({ name, email, phone, roles }) => respond((db) => {
    const admin = requireRole(db, 'QTV');
    if (!name?.trim() || !/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email || '')) throw new ApiError('Vui lòng nhập họ tên và email hợp lệ.');
    if (!roles?.length) throw new ApiError('Chọn ít nhất một vai trò.');
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new ApiError('Email đã tồn tại.', 409);
    const u = { id: `u-${Date.now()}`, name: name.trim(), email, phone: phone || '', password: 'doimatkhau123', roles, locked: false, createdAt: nowIso(), consentAt: nowIso() };
    db.users.push(u);
    if (roles.includes('KTV')) db.technicians.push({ id: `k-${Date.now()}`, userId: u.id, skills: ['KHAC'], areas: [db.config.areas[0]], rating: 5, ratingCount: 0, active: true, schedule: { ...DEFAULT_SCHEDULE } });
    audit(db, admin, 'TAO_TAI_KHOAN', email, roles.join(', '));
    return publicUser(u);
  }),

  saveConfig: (cfg) => respond((db) => {
    const user = requireRole(db, 'QTV');
    const n = (v) => Number(v);
    if (!(n(cfg.surveyFee) >= 0) || !(n(cfg.freeCancelHours) >= 0) || !(n(cfg.techResponseMinutes) >= 1) || !(n(cfg.travelBufferMinutes) >= 0) || !(n(cfg.reviewWindowDays) >= 1)) {
      throw new ApiError('Các tham số phải là số hợp lệ.');
    }
    if (cfg.serviceHours.start >= cfg.serviceHours.end) throw new ApiError('Giờ bắt đầu phục vụ phải trước giờ kết thúc.');
    if (!cfg.areas.length) throw new ApiError('Cần ít nhất một khu vực phục vụ.');
    if (!/^\d{6}$/.test(cfg.bank.bin) || !/^\d{6,19}$/.test(cfg.bank.accountNumber)) throw new ApiError('Mã BIN gồm 6 chữ số, số tài khoản gồm 6–19 chữ số.');
    db.config = { ...db.config, ...cfg, surveyFee: n(cfg.surveyFee), freeCancelHours: n(cfg.freeCancelHours), techResponseMinutes: n(cfg.techResponseMinutes), travelBufferMinutes: n(cfg.travelBufferMinutes), reviewWindowDays: n(cfg.reviewWindowDays) };
    audit(db, user, 'CAU_HINH', 'tham số nghiệp vụ');
    return db.config;
  }),

  report: ({ days }) => respond((db) => {
    requireRole(db, 'QTV');
    const since = Date.now() - days * DAY;
    const prevSince = since - days * DAY;
    const inRange = (t, a, b) => { const x = new Date(t.createdAt).getTime(); return x >= a && x < b; };
    const cur = db.tickets.filter((t) => inRange(t, since, Infinity));
    const prev = db.tickets.filter((t) => inRange(t, prevSince, since));
    const revenueOf = (list) => list.filter((t) => t.status === STATUS.HOAN_TAT && t.payment).reduce((s, t) => s + t.payment.amount, 0);
    const doneOf = (list) => list.filter((t) => t.status === STATUS.HOAN_TAT);
    const avgHours = (list) => {
      const done = doneOf(list);
      if (!done.length) return 0;
      return done.reduce((s, t) => s + (new Date(t.completedAt) - new Date(t.createdAt)), 0) / done.length / 3600000;
    };
    const reviews = cur.filter((t) => t.review);
    const byDay = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = d.getTime() + DAY;
      byDay.push({ date: d.toISOString(), revenue: db.tickets.filter((t) => t.status === STATUS.HOAN_TAT && t.completedAt && new Date(t.completedAt).getTime() >= d.getTime() && new Date(t.completedAt).getTime() < next).reduce((s, t) => s + (t.payment?.amount || 0), 0) });
    }
    const byStatus = Object.keys(STATUS_LABEL).map((s) => ({ status: s, count: cur.filter((t) => t.status === s).length })).filter((x) => x.count);
    const byCategory = db.categories.map((c) => ({ name: c.name, count: cur.filter((t) => t.categoryCode === c.code).length })).filter((x) => x.count).sort((a, b) => b.count - a.count);
    const byTech = db.technicians.map((tech) => {
      const list = cur.filter((t) => t.assignment?.techId === tech.id);
      const rv = list.filter((t) => t.review);
      return { name: db.users.find((u) => u.id === tech.userId)?.name, done: doneOf(list).length, rating: rv.length ? rv.reduce((s, t) => s + t.review.stars, 0) / rv.length : null, revenue: revenueOf(list) };
    }).filter((x) => x.done || x.rating);
    return {
      revenue: revenueOf(cur), revenuePrev: revenueOf(prev),
      done: doneOf(cur).length, donePrev: doneOf(prev).length,
      avgHours: avgHours(cur), avgHoursPrev: avgHours(prev),
      rating: reviews.length ? reviews.reduce((s, t) => s + t.review.stars, 0) / reviews.length : null,
      reviewCount: reviews.length,
      cancelled: cur.filter((t) => t.status === STATUS.DA_HUY).length,
      total: cur.length,
      byDay, byStatus, byCategory, byTech,
    };
  }, 220),

  reportTickets: ({ days }) => respond((db) => {
    requireRole(db, 'QTV');
    const since = Date.now() - days * DAY;
    const nameOf = (userId) => db.users.find((u) => u.id === userId)?.name || '';
    return db.tickets
      .filter((t) => new Date(t.createdAt).getTime() >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        customer: nameOf(t.customerId),
        ward: t.ward,
        category: db.categories.find((c) => c.code === t.categoryCode)?.name || '',
        urgency: t.urgency,
        status: t.status,
        technician: t.assignment ? nameOf(db.technicians.find((k) => k.id === t.assignment.techId)?.userId) : '',
        appointmentAt: t.assignment?.appointmentAt || t.slotStart,
        completedAt: t.completedAt || null,
        amount: t.payment ? t.payment.amount : null,
        paymentMethod: t.payment?.method || null,
        paymentStatus: t.payment?.status || null,
        stars: t.review?.stars ?? null,
      }));
  }, 220),
};

function applyQuoteDecision(db, t, q, actor, decision, itemIds, reason) {
  q.decidedAt = nowIso();
  q.decidedBy = actor.name;
  if (decision === 'reject') {
    if (!reason?.trim()) throw new ApiError('Vui lòng cho biết lý do từ chối.');
    q.status = 'TU_CHOI';
    q.rejectReason = reason.trim();
    q.items.forEach((i) => { i.selected = false; });
    if (q.type === 'CHINH') {
      transition(db, t, STATUS.CHO_THANH_TOAN, actor, t.isWarranty ? 'Khách từ chối báo giá' : 'Khách từ chối báo giá, thu phí khảo sát');
      openPayment(db, t, actor);
    } else {
      transition(db, t, STATUS.DANG_THUC_HIEN, actor, 'Khách từ chối báo giá bổ sung, tiếp tục hạng mục đã duyệt');
    }
    return;
  }
  if (decision === 'partial') {
    const chosen = q.items.filter((i) => itemIds.includes(i.id)).map((i) => i.id);
    if (!chosen.length) throw new ApiError('Chọn ít nhất một hạng mục, hoặc chọn từ chối báo giá.');
    q.items.forEach((i) => { i.selected = chosen.includes(i.id); });
    q.status = q.items.every((i) => i.selected) ? 'DA_DUYET' : 'DUYET_MOT_PHAN';
  } else {
    q.items.forEach((i) => { i.selected = true; });
    q.status = 'DA_DUYET';
  }
  // Trừ tồn kho linh kiện đã được duyệt
  q.items.filter((i) => i.selected && i.kind === 'part').forEach((i) => {
    const p = db.parts.find((x) => x.id === i.refId);
    if (p) p.stock = Math.max(0, p.stock - i.qty);
  });
  transition(db, t, STATUS.DANG_THUC_HIEN, actor, q.status === 'DUYET_MOT_PHAN' ? 'Khách duyệt một phần báo giá' : 'Khách duyệt báo giá');
}
