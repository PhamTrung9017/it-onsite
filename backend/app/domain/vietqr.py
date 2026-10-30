"""Chuỗi VietQR theo chuẩn EMVCo, chuyển khoản nhanh 24/7 đến tài khoản."""

import re
import unicodedata


def _tlv(field_id: str, value: str) -> str:
    return f"{field_id}{len(value):02d}{value}"


def crc16(data: str) -> str:
    """CRC-16/CCITT-FALSE: đa thức 0x1021, giá trị khởi tạo 0xFFFF."""
    crc = 0xFFFF
    for byte in data.encode("ascii"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else crc << 1
            crc &= 0xFFFF
    return f"{crc:04X}"


def sanitize_content(text: str) -> str:
    """Nội dung chuyển khoản chỉ gồm chữ không dấu, số và khoảng trắng."""
    plain = unicodedata.normalize("NFD", text)
    plain = "".join(ch for ch in plain if unicodedata.category(ch) != "Mn")
    plain = plain.replace("đ", "d").replace("Đ", "D")
    return re.sub(r"[^A-Za-z0-9 ]", "", plain)[:25]


def build_vietqr(bin_code: str, account_number: str, amount: int | None, content: str | None) -> str:
    beneficiary = _tlv("00", bin_code) + _tlv("01", account_number)
    merchant = _tlv("00", "A000000727") + _tlv("01", beneficiary) + _tlv("02", "QRIBFTTA")
    payload = _tlv("00", "01") + _tlv("01", "12" if amount else "11") + _tlv("38", merchant) + _tlv("53", "704")
    if amount:
        payload += _tlv("54", str(round(amount)))
    payload += _tlv("58", "VN")
    if content:
        payload += _tlv("62", _tlv("08", sanitize_content(content)))
    payload += "6304"
    return payload + crc16(payload)
