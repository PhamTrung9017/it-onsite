"""Lọc dữ liệu cá nhân (NFR-10) và phân loại sự cố theo từ khóa khi chưa cấu hình Gemini."""

import re

PATTERNS = {
    "CAI_HDH": ["windows", "win 10", "win 11", "win10", "win11", "hệ điều hành", "cài lại win", "cài win", "driver", "macos", "boot"],
    "PHAN_MEM": ["office", "word", "excel", "phần mềm", "autocad", "photoshop", "kế toán", "bản quyền", "zalo", "máy in"],
    "VIRUS": ["virus", "mã độc", "quảng cáo", "popup", "pop-up", "hack", "tống tiền", "ransomware", "trojan", "lạ tự cài"],
    "MANG": ["wifi", "wi-fi", "mạng", "internet", "router", "modem", "lan", "mất kết nối", "không vào được mạng"],
    "MAY_CHAM": ["chậm", "lag", "giật", "treo", "đơ", "nóng", "quạt kêu", "khởi động lâu", "full disk", "100% disk"],
    "NGUON": [
        "không lên nguồn",
        "không mở được",
        "không khởi động",
        "tắt đột ngột",
        "sập nguồn",
        "không lên hình",
        "màn hình đen",
        "sạc không vào",
    ],
    "DU_LIEU": ["mất dữ liệu", "khôi phục", "xóa nhầm", "ổ cứng hỏng", "không đọc được ổ", "format", "cứu dữ liệu", "usb không nhận"],
    "PHAN_CUNG": ["ssd", "ram", "nâng cấp", "ổ cứng", "bàn phím", "pin", "thay màn", "vệ sinh", "keo tản nhiệt", "bản lề"],
}

URGENT_WORDS = ["gấp", "khẩn", "ngay", "mai thi", "đi làm", "không lên nguồn", "mất dữ liệu", "tống tiền", "ransomware", "hack"]

URGENCY_LEVELS = ("THAP", "TRUNG_BINH", "CAO")


def redact_personal_data(text: str) -> str:
    """Bỏ email, số điện thoại, mật khẩu, số nhà trước khi gửi mô tả ra dịch vụ bên ngoài."""
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "[email]", text)
    text = re.sub(r"(\+?84|0)(\s?\d){9,10}", "[số điện thoại]", text)
    text = re.sub(r"(mật khẩu|mat khau|password|pass|mk)\s*[:=]?\s*\S+", r"\1 [đã ẩn]", text, flags=re.IGNORECASE)
    return re.sub(r"\b\d{1,4}/?\d*\s+(đường|duong)\b", r"[số nhà] \1", text, flags=re.IGNORECASE)


def classify_by_keywords(description: str) -> dict:
    text = description.lower()
    scores = sorted(
        ((code, sum(1 for w in words if w in text)) for code, words in PATTERNS.items()),
        key=lambda item: item[1],
        reverse=True,
    )
    best_code, best_hits = scores[0]
    if not best_hits:
        return {
            "categoryCode": "KHAC",
            "confidence": 0.35,
            "urgency": "TRUNG_BINH",
            "reason": "Không nhận ra từ khóa đặc trưng của loại sự cố nào.",
        }
    total = sum(hits for _, hits in scores)
    tie_penalty = 0.2 if scores[1][1] == best_hits else 0
    confidence = min(0.95, 0.45 + 0.15 * best_hits + 0.25 * best_hits / total - tie_penalty)
    urgent = any(w in text for w in URGENT_WORDS)
    if urgent:
        urgency = "CAO"
    elif best_code in ("MAY_CHAM", "PHAN_CUNG"):
        urgency = "THAP"
    else:
        urgency = "TRUNG_BINH"
    suffix = ", kèm yêu cầu xử lý gấp" if urgent else ""
    return {
        "categoryCode": best_code,
        "confidence": round(confidence, 2),
        "urgency": urgency,
        "reason": f"Mô tả có {best_hits} dấu hiệu khớp với loại sự cố này{suffix}.",
    }
