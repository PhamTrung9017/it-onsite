/**
 * Tạo chuỗi VietQR (chuẩn EMVCo, chuyển khoản nhanh 24/7 đến tài khoản).
 * Cấu trúc TLV: 2 ký tự mã trường, 2 ký tự độ dài, giá trị.
 */
function tlv(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

/** CRC-16/CCITT-FALSE: đa thức 0x1021, giá trị khởi tạo 0xFFFF. */
export function crc16(input) {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Nội dung chuyển khoản chỉ gồm chữ không dấu, số và khoảng trắng để mọi ngân hàng đọc được. */
export function sanitizeContent(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .slice(0, 25);
}

export function buildVietQR({ bin, accountNumber, amount, content }) {
  const beneficiary = tlv('00', bin) + tlv('01', accountNumber);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  let payload = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704');
  if (amount) payload += tlv('54', String(Math.round(amount)));
  payload += tlv('58', 'VN');
  if (content) payload += tlv('62', tlv('08', sanitizeContent(content)));
  payload += '6304';
  return payload + crc16(payload);
}
