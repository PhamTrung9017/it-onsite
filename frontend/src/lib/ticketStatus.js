/**
 * Trạng thái phiếu yêu cầu và các chuyển trạng thái hợp lệ (SRS mục 3.3).
 */
export const STATUS = {
  MOI: 'MOI',
  DA_TIEP_NHAN: 'DA_TIEP_NHAN',
  DA_PHAN_CONG: 'DA_PHAN_CONG',
  KTV_DA_NHAN: 'KTV_DA_NHAN',
  DANG_KHAO_SAT: 'DANG_KHAO_SAT',
  CHO_DUYET_BAO_GIA: 'CHO_DUYET_BAO_GIA',
  DANG_THUC_HIEN: 'DANG_THUC_HIEN',
  CHO_NGHIEM_THU: 'CHO_NGHIEM_THU',
  CHO_THANH_TOAN: 'CHO_THANH_TOAN',
  HOAN_TAT: 'HOAN_TAT',
  DA_HUY: 'DA_HUY',
};

export const STATUS_LABEL = {
  MOI: 'Mới tạo',
  DA_TIEP_NHAN: 'Đã tiếp nhận',
  DA_PHAN_CONG: 'Đã phân công',
  KTV_DA_NHAN: 'KTV đã nhận',
  DANG_KHAO_SAT: 'Đang khảo sát',
  CHO_DUYET_BAO_GIA: 'Chờ duyệt báo giá',
  DANG_THUC_HIEN: 'Đang thực hiện',
  CHO_NGHIEM_THU: 'Chờ nghiệm thu',
  CHO_THANH_TOAN: 'Chờ thanh toán',
  HOAN_TAT: 'Hoàn tất',
  DA_HUY: 'Đã hủy',
};

/** Thứ tự các bước trên dòng thời gian của phiếu (luồng chính). */
export const MAIN_FLOW = [
  STATUS.MOI,
  STATUS.DA_TIEP_NHAN,
  STATUS.DA_PHAN_CONG,
  STATUS.KTV_DA_NHAN,
  STATUS.DANG_KHAO_SAT,
  STATUS.CHO_DUYET_BAO_GIA,
  STATUS.DANG_THUC_HIEN,
  STATUS.CHO_NGHIEM_THU,
  STATUS.CHO_THANH_TOAN,
  STATUS.HOAN_TAT,
];

/** Nhóm màu hiển thị cho từng trạng thái. */
export const STATUS_TONE = {
  MOI: 'info',
  DA_TIEP_NHAN: 'info',
  DA_PHAN_CONG: 'primary',
  KTV_DA_NHAN: 'primary',
  DANG_KHAO_SAT: 'warning',
  CHO_DUYET_BAO_GIA: 'warning',
  DANG_THUC_HIEN: 'primary',
  CHO_NGHIEM_THU: 'warning',
  CHO_THANH_TOAN: 'warning',
  HOAN_TAT: 'success',
  DA_HUY: 'muted',
};

export const TRANSITIONS = {
  MOI: [STATUS.DA_TIEP_NHAN, STATUS.DA_HUY],
  DA_TIEP_NHAN: [STATUS.DA_PHAN_CONG, STATUS.DA_HUY],
  DA_PHAN_CONG: [STATUS.KTV_DA_NHAN, STATUS.DA_TIEP_NHAN, STATUS.DA_HUY],
  KTV_DA_NHAN: [STATUS.DANG_KHAO_SAT, STATUS.DA_HUY],
  DANG_KHAO_SAT: [STATUS.CHO_DUYET_BAO_GIA],
  CHO_DUYET_BAO_GIA: [STATUS.DANG_THUC_HIEN, STATUS.CHO_THANH_TOAN],
  DANG_THUC_HIEN: [STATUS.CHO_DUYET_BAO_GIA, STATUS.CHO_NGHIEM_THU],
  CHO_NGHIEM_THU: [STATUS.DANG_THUC_HIEN, STATUS.CHO_THANH_TOAN],
  CHO_THANH_TOAN: [STATUS.HOAN_TAT],
  HOAN_TAT: [],
  DA_HUY: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** Các trạng thái còn được hủy hoặc đổi lịch (trước khi KTV check-in, BR-03). */
export const CANCELLABLE = [STATUS.MOI, STATUS.DA_TIEP_NHAN, STATUS.DA_PHAN_CONG, STATUS.KTV_DA_NHAN];

/** Các trạng thái KTV đang giữ lịch (dùng kiểm tra trùng lịch, BR-04). */
export const BUSY_STATUSES = [
  STATUS.DA_PHAN_CONG,
  STATUS.KTV_DA_NHAN,
  STATUS.DANG_KHAO_SAT,
  STATUS.CHO_DUYET_BAO_GIA,
  STATUS.DANG_THUC_HIEN,
  STATUS.CHO_NGHIEM_THU,
];

export const isClosed = (status) => status === STATUS.HOAN_TAT || status === STATUS.DA_HUY;
