/** Phân loại sự cố theo từ khóa (UC05). */

const PATTERNS = [
  { code: 'CAI_HDH', words: ['windows', 'win 10', 'win 11', 'win10', 'win11', 'hệ điều hành', 'cài lại win', 'cài win', 'driver', 'macos', 'boot'] },
  { code: 'PHAN_MEM', words: ['office', 'word', 'excel', 'phần mềm', 'autocad', 'photoshop', 'kế toán', 'bản quyền', 'zalo', 'máy in'] },
  { code: 'VIRUS', words: ['virus', 'mã độc', 'quảng cáo', 'popup', 'pop-up', 'hack', 'tống tiền', 'ransomware', 'trojan', 'lạ tự cài'] },
  { code: 'MANG', words: ['wifi', 'wi-fi', 'mạng', 'internet', 'router', 'modem', 'lan', 'mất kết nối', 'không vào được mạng'] },
  { code: 'MAY_CHAM', words: ['chậm', 'lag', 'giật', 'treo', 'đơ', 'nóng', 'quạt kêu', 'khởi động lâu', 'full disk', '100% disk'] },
  { code: 'NGUON', words: ['không lên nguồn', 'không mở được', 'không khởi động', 'tắt đột ngột', 'sập nguồn', 'không lên hình', 'màn hình đen', 'sạc không vào'] },
  { code: 'DU_LIEU', words: ['mất dữ liệu', 'khôi phục', 'xóa nhầm', 'ổ cứng hỏng', 'không đọc được ổ', 'format', 'cứu dữ liệu', 'usb không nhận'] },
  { code: 'PHAN_CUNG', words: ['ssd', 'ram', 'nâng cấp', 'ổ cứng', 'bàn phím', 'pin', 'thay màn', 'vệ sinh', 'keo tản nhiệt', 'bản lề'] },
];

const URGENT_WORDS = ['gấp', 'khẩn', 'ngay', 'mai thi', 'đi làm', 'không lên nguồn', 'mất dữ liệu', 'tống tiền', 'ransomware', 'hack'];

/** NFR-10: loại bỏ số điện thoại, email, mật khẩu, số nhà trước khi gửi mô tả ra dịch vụ bên ngoài. */
export function redactPersonalData(text) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(\+?84|0)(\s?\d){9,10}/g, '[số điện thoại]')
    .replace(/(mật khẩu|mat khau|password|pass|mk)\s*[:=]?\s*\S+/gi, '$1 [đã ẩn]')
    .replace(/\b\d{1,4}\/?\d*\s+(đường|duong)\b/gi, '[số nhà] $2');
}

export function classifyIssue(description) {
  const text = description.toLowerCase();
  const scores = PATTERNS.map((p) => ({ code: p.code, hits: p.words.filter((w) => text.includes(w)).length }))
    .sort((a, b) => b.hits - a.hits);
  const best = scores[0];
  const totalHits = scores.reduce((s, x) => s + x.hits, 0);
  if (!best.hits) {
    return { categoryCode: 'KHAC', confidence: 0.35, urgency: 'TRUNG_BINH', reason: 'Không nhận ra từ khóa đặc trưng của loại sự cố nào.' };
  }
  const share = best.hits / totalHits;
  const confidence = Math.min(0.95, 0.45 + 0.15 * best.hits + 0.25 * share - (scores[1].hits === best.hits ? 0.2 : 0));
  const urgent = URGENT_WORDS.some((w) => text.includes(w));
  const urgency = urgent ? 'CAO' : best.code === 'MAY_CHAM' || best.code === 'PHAN_CUNG' ? 'THAP' : 'TRUNG_BINH';
  return {
    categoryCode: best.code,
    confidence: Math.round(confidence * 100) / 100,
    urgency,
    reason: `Mô tả có ${best.hits} dấu hiệu khớp với loại sự cố này${urgent ? ', kèm yêu cầu xử lý gấp' : ''}.`,
  };
}

export const URGENCY_LABEL = { THAP: 'Thấp', TRUNG_BINH: 'Trung bình', CAO: 'Cao' };
