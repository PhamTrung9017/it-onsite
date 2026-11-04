/**
 * Phường phục vụ (từ 01/07/2025) và các phường cũ hợp thành, theo Nghị quyết 1685/NQ-UBTVQH15
 * về sắp xếp đơn vị hành chính cấp xã của TP. Hồ Chí Minh. Giúp khách và kỹ thuật viên đối chiếu địa chỉ cũ.
 */
export const OLD_WARDS = {
  'Sài Gòn': { district: 'Quận 1', wards: ['Bến Nghé', 'Đa Kao', 'Nguyễn Thái Bình'] },
  'Bến Thành': { district: 'Quận 1', wards: ['Bến Thành', 'Phạm Ngũ Lão', 'Cầu Ông Lãnh', 'Nguyễn Thái Bình'] },
  'Tân Định': { district: 'Quận 1', wards: ['Tân Định', 'Đa Kao'] },
  'Cầu Ông Lãnh': { district: 'Quận 1', wards: ['Nguyễn Cư Trinh', 'Cầu Kho', 'Cô Giang', 'Cầu Ông Lãnh'] },
  'Bàn Cờ': { district: 'Quận 3', wards: ['1', '2', '3', '4', '5'] },
  'Xuân Hòa': { district: 'Quận 3', wards: ['Võ Thị Sáu', '4'] },
  'Nhiêu Lộc': { district: 'Quận 3', wards: ['9', '11', '12', '14'] },
  'Chợ Lớn': { district: 'Quận 5', wards: ['11', '12', '13', '14'] },
  'An Đông': { district: 'Quận 5', wards: ['5', '7', '9'] },
  'Chợ Quán': { district: 'Quận 5', wards: ['1', '2', '4'] },
  'Gia Định': { district: 'Quận Bình Thạnh', wards: ['1', '2', '7', '17'] },
  'Bình Thạnh': { district: 'Quận Bình Thạnh', wards: ['12', '14', '26'] },
  'Bình Lợi Trung': { district: 'Quận Bình Thạnh', wards: ['5', '11', '13'] },
  'Thạnh Mỹ Tây': { district: 'Quận Bình Thạnh', wards: ['19', '22', '25'] },
  'Bình Quới': { district: 'Quận Bình Thạnh', wards: ['27', '28'] },
};

/** Ví dụ "P. Võ Thị Sáu, P. 4, Quận 3"; phường ngoài danh sách thì trả chuỗi rỗng. */
export function oldWardText(ward) {
  const old = OLD_WARDS[ward];
  return old ? `${old.wards.map((w) => `P. ${w}`).join(', ')}, ${old.district}` : '';
}

/** Tên phường kèm quận cũ cho ô chọn phường, ví dụ "Bến Thành (Quận 1 cũ)". */
export function wardLabel(ward) {
  const old = OLD_WARDS[ward];
  return old ? `${ward} (${old.district} cũ)` : ward;
}
