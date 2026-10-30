"""Trạng thái phiếu yêu cầu và các chuyển trạng thái hợp lệ (SRS mục 3.3)."""

from enum import StrEnum


class Status(StrEnum):
    MOI = "MOI"
    DA_TIEP_NHAN = "DA_TIEP_NHAN"
    DA_PHAN_CONG = "DA_PHAN_CONG"
    KTV_DA_NHAN = "KTV_DA_NHAN"
    DANG_KHAO_SAT = "DANG_KHAO_SAT"
    CHO_DUYET_BAO_GIA = "CHO_DUYET_BAO_GIA"
    DANG_THUC_HIEN = "DANG_THUC_HIEN"
    CHO_NGHIEM_THU = "CHO_NGHIEM_THU"
    CHO_THANH_TOAN = "CHO_THANH_TOAN"
    HOAN_TAT = "HOAN_TAT"
    DA_HUY = "DA_HUY"


STATUS_LABEL = {
    Status.MOI: "Mới tạo",
    Status.DA_TIEP_NHAN: "Đã tiếp nhận",
    Status.DA_PHAN_CONG: "Đã phân công",
    Status.KTV_DA_NHAN: "KTV đã nhận",
    Status.DANG_KHAO_SAT: "Đang khảo sát",
    Status.CHO_DUYET_BAO_GIA: "Chờ duyệt báo giá",
    Status.DANG_THUC_HIEN: "Đang thực hiện",
    Status.CHO_NGHIEM_THU: "Chờ nghiệm thu",
    Status.CHO_THANH_TOAN: "Chờ thanh toán",
    Status.HOAN_TAT: "Hoàn tất",
    Status.DA_HUY: "Đã hủy",
}

TRANSITIONS: dict[Status, set[Status]] = {
    Status.MOI: {Status.DA_TIEP_NHAN, Status.DA_HUY},
    Status.DA_TIEP_NHAN: {Status.DA_PHAN_CONG, Status.DA_HUY},
    Status.DA_PHAN_CONG: {Status.KTV_DA_NHAN, Status.DA_TIEP_NHAN, Status.DA_HUY},
    Status.KTV_DA_NHAN: {Status.DANG_KHAO_SAT, Status.DA_HUY},
    Status.DANG_KHAO_SAT: {Status.CHO_DUYET_BAO_GIA},
    Status.CHO_DUYET_BAO_GIA: {Status.DANG_THUC_HIEN, Status.CHO_THANH_TOAN},
    Status.DANG_THUC_HIEN: {Status.CHO_DUYET_BAO_GIA, Status.CHO_NGHIEM_THU},
    Status.CHO_NGHIEM_THU: {Status.DANG_THUC_HIEN, Status.CHO_THANH_TOAN},
    Status.CHO_THANH_TOAN: {Status.HOAN_TAT},
    Status.HOAN_TAT: set(),
    Status.DA_HUY: set(),
}

# Còn được hủy hoặc đổi lịch: trước khi KTV check-in (BR-03).
CANCELLABLE = {Status.MOI, Status.DA_TIEP_NHAN, Status.DA_PHAN_CONG, Status.KTV_DA_NHAN}

# KTV đang giữ lịch, dùng kiểm tra trùng lịch (BR-04).
BUSY_STATUSES = {
    Status.DA_PHAN_CONG,
    Status.KTV_DA_NHAN,
    Status.DANG_KHAO_SAT,
    Status.CHO_DUYET_BAO_GIA,
    Status.DANG_THUC_HIEN,
    Status.CHO_NGHIEM_THU,
}

CLOSED_STATUSES = {Status.HOAN_TAT, Status.DA_HUY}


def can_transition(current: str, target: str) -> bool:
    return Status(target) in TRANSITIONS[Status(current)]


def is_closed(status: str) -> bool:
    return Status(status) in CLOSED_STATUSES
