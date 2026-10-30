"""Nạp dữ liệu ban đầu.

python -m app.seed catalog                       tham số nghiệp vụ, loại sự cố, bảng giá, linh kiện
python -m app.seed admin --email ... --name ...  tạo tài khoản quản trị viên đầu tiên
python -m app.seed demo                          xóa toàn bộ dữ liệu, nạp dữ liệu trình diễn
"""

import argparse
import getpass
import random
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.db import Base, SessionLocal
from app.domain.areas import WARDS
from app.domain.rules import BusinessConfig
from app.domain.status import Status
from app.models import (
    Assignment,
    Category,
    DailyCounter,
    Device,
    Notification,
    Part,
    Payment,
    Photo,
    Quote,
    QuoteItem,
    Review,
    Service,
    Setting,
    Technician,
    Ticket,
    TicketHistory,
    User,
    Warranty,
)
from app.services.common import utcnow
from app.services.media import media_root

MIN = timedelta(minutes=1)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
SAMPLE_PHOTO = "/media/mau.svg"

DEFAULT_CONFIG = BusinessConfig(
    survey_fee=50000,
    free_cancel_hours=2,
    tech_response_minutes=15,
    travel_buffer_minutes=30,
    review_window_days=7,
    ai_confidence_threshold=0.6,
    service_start="08:00",
    service_end="20:00",
    areas=WARDS,
    bank_name="Ngân hàng mẫu",
    bank_bin="970423",
    bank_account_number="0123456789",
    bank_account_name="CAI WIN DAO",
)

SERVICES = {
    "win": ("Cài đặt Windows và driver đầy đủ", "CAI_HDH", 250000, 90, 7),
    "office": ("Cài đặt phần mềm văn phòng", "PHAN_MEM", 100000, 45, 7),
    "virus": ("Diệt virus và làm sạch hệ thống", "VIRUS", 150000, 60, 30),
    "mang": ("Khắc phục sự cố mạng, Wi-Fi", "MANG", 150000, 60, 7),
    "toiuu": ("Tối ưu máy chạy chậm", "MAY_CHAM", 150000, 60, 14),
    "vesinh": ("Vệ sinh và tra keo tản nhiệt laptop", "MAY_CHAM", 180000, 60, 30),
    "nguon": ("Kiểm tra, sửa lỗi không lên nguồn", "NGUON", 200000, 90, 30),
    "dulieu": ("Khôi phục dữ liệu ổ cứng, USB", "DU_LIEU", 400000, 120, 0),
    "lapdat": ("Công lắp đặt, nâng cấp linh kiện", "PHAN_CUNG", 120000, 45, 30),
    "kiemtra": ("Kiểm tra tổng quát", "KHAC", 100000, 60, 0),
}

CATEGORIES = [
    ("CAI_HDH", "Cài đặt hệ điều hành", "win"),
    ("PHAN_MEM", "Phần mềm văn phòng, ứng dụng", "office"),
    ("VIRUS", "Virus và mã độc", "virus"),
    ("MANG", "Mạng và Wi-Fi", "mang"),
    ("MAY_CHAM", "Máy chậm, nóng, treo", "toiuu"),
    ("NGUON", "Không lên nguồn, không lên hình", "nguon"),
    ("DU_LIEU", "Khôi phục dữ liệu", "dulieu"),
    ("PHAN_CUNG", "Nâng cấp, thay thế phần cứng", "lapdat"),
    ("KHAC", "Khác", "kiemtra"),
]

PARTS = {
    "ssd512": ("SSD NVMe 512GB", 850000, 6, 365),
    "ssd1t": ("SSD NVMe 1TB", 1450000, 3, 365),
    "ram8": ("RAM DDR4 8GB", 550000, 8, 365),
    "keo": ("Keo tản nhiệt cao cấp", 80000, 20, 0),
    "pin": ("Pin laptop thay thế", 900000, 2, 180),
    "nguon": ("Bộ nguồn PC 450W", 650000, 4, 365),
    "router": ("Router Wi-Fi 6", 750000, 1, 365),
}

DEMO_PASSWORD = "123456"

USERS = {
    "kh1": ("Nguyễn Văn Anh", "khach@demo.vn", "0909000001", ["KHACH"], "120 Nguyễn Trãi", "Bến Thành"),
    "kh2": ("Trần Thị Bình", "binh.tran@demo.vn", "0909000002", ["KHACH"], "45 Lê Văn Sỹ", "Nhiêu Lộc"),
    "kh3": ("Lê Minh Châu", "chau.le@demo.vn", "0909000003", ["KHACH"], "18 Phan Đăng Lưu", "Gia Định"),
    "kh4": ("Võ Thị Dung", "dung.vo@demo.vn", "0909000004", ["KHACH"], "77 Trần Hưng Đạo", "Chợ Quán"),
    "kh5": ("Hoàng Gia Bảo", "bao.hoang@demo.vn", "0909000005", ["KHACH"], "9 Xô Viết Nghệ Tĩnh", "Thạnh Mỹ Tây"),
    "ktv1": ("Nguyễn Văn An", "ktv@demo.vn", "0909000011", ["KTV"], "", ""),
    "ktv2": ("Lê Hoàng Phúc", "phuc.le@demo.vn", "0909000012", ["KTV"], "", ""),
    "ktv3": ("Trần Quang Huy", "huy.tran@demo.vn", "0909000013", ["KTV"], "", ""),
    "ktv4": ("Đỗ Thu Hà", "ha.do@demo.vn", "0909000014", ["KTV"], "", ""),
    "dpv1": ("Trần Thị Lan", "dpv@demo.vn", "0909000021", ["DPV"], "", ""),
    "qtv1": ("Hoàng Minh Quân", "qtv@demo.vn", "0909000031", ["QTV", "DPV"], "", ""),
}

TECHNICIANS = {
    "k1": (
        "ktv1",
        ["CAI_HDH", "PHAN_MEM", "VIRUS", "MAY_CHAM", "PHAN_CUNG"],
        ["Bến Thành", "Sài Gòn", "Tân Định", "Cầu Ông Lãnh", "Chợ Quán"],
        4.9,
        True,
    ),
    "k2": (
        "ktv2",
        ["NGUON", "PHAN_CUNG", "DU_LIEU", "MAY_CHAM"],
        ["Gia Định", "Bình Thạnh", "Bình Lợi Trung", "Thạnh Mỹ Tây", "Bình Quới"],
        4.7,
        True,
    ),
    "k3": ("ktv3", ["MANG", "VIRUS", "PHAN_MEM", "CAI_HDH"], ["Bàn Cờ", "Xuân Hòa", "Nhiêu Lộc", "Chợ Lớn", "An Đông"], 4.8, True),
    "k4": ("ktv4", ["CAI_HDH", "PHAN_MEM", "KHAC"], ["Chợ Lớn", "An Đông", "Chợ Quán"], 4.5, False),
}

SCHEDULES = {
    "k1": {"workDays": [1, 2, 3, 4, 5, 6], "start": "08:00", "end": "20:00", "daysOff": []},
    "k2": {"workDays": [1, 2, 3, 4, 5, 6, 7], "start": "08:00", "end": "20:00", "daysOff": []},
    "k3": {"workDays": [1, 2, 3, 4, 5], "start": "08:00", "end": "19:00", "daysOff": []},
    "k4": {"workDays": [1, 2, 3, 4, 5, 6], "start": "08:00", "end": "17:00", "daysOff": []},
}

DEVICES = {
    "tb1": ("kh1", "Laptop", "Dell", "Inspiron 15 3520"),
    "tb2": ("kh1", "PC", "Lắp ráp", "PC văn phòng i5", "Máy đặt ở phòng kế toán, tầng 2"),
    "tb3": ("kh2", "Laptop", "HP", "Pavilion 14"),
    "tb4": ("kh3", "Laptop", "Asus", "Vivobook 15"),
    "tb5": ("kh4", "Laptop", "Lenovo", "ThinkPad E14"),
    "tb6": ("kh5", "PC", "Lắp ráp", "PC gaming"),
}

SAMPLE_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect width="120" height="90" fill="#e8efed"/>'
    '<path d="M36 62l16-20 12 14 8-9 14 15z" fill="#9fb8b1"/><circle cx="80" cy="32" r="7" fill="#9fb8b1"/></svg>'
)


def load_catalog(db: Session) -> dict:
    """Nạp tham số, bảng giá, linh kiện nếu chưa có; trả về bảng tra mã ngắn sang bản ghi."""
    if db.get(Setting, 1) is None:
        db.add(Setting(id=1, data=DEFAULT_CONFIG.to_dict()))
    services = {s.name: s for s in db.scalars(select(Service))}
    service_by_key = {}
    for key, (name, category, price, duration, warranty) in SERVICES.items():
        if name not in services:
            services[name] = Service(name=name, category_code=category, price=price, duration_min=duration, warranty_days=warranty)
            db.add(services[name])
        service_by_key[key] = services[name]
    db.flush()
    for position, (code, name, service_key) in enumerate(CATEGORIES):
        if db.get(Category, code) is None:
            db.add(Category(code=code, name=name, service_id=service_by_key[service_key].id, position=position))
    parts = {p.name: p for p in db.scalars(select(Part))}
    part_by_key = {}
    for key, (name, price, stock, warranty) in PARTS.items():
        if name not in parts:
            parts[name] = Part(name=name, price=price, stock=stock, warranty_days=warranty)
            db.add(parts[name])
        part_by_key[key] = parts[name]
    db.flush()
    return {"services": service_by_key, "parts": part_by_key}


def create_admin(db: Session, email: str, name: str, password: str) -> None:
    now = utcnow()
    db.add(
        User(name=name, email=email, phone="", password_hash=hash_password(password), roles=["QTV", "DPV"], consent_at=now, created_at=now)
    )


class DemoBuilder:
    def __init__(self, db: Session, catalog: dict, now: datetime):
        self.db = db
        self.services = catalog["services"]
        self.parts = catalog["parts"]
        self.now = now
        self.tz = get_settings().tz
        self.counters: dict[str, int] = defaultdict(int)
        self.users: dict[str, User] = {}
        self.techs: dict[str, Technician] = {}
        self.devices: dict[str, Device] = {}

    def at(self, day_offset: int, hour: int, minute: int = 0) -> datetime:
        local = self.now.astimezone(self.tz)
        base = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return base + timedelta(days=day_offset)

    def people(self) -> None:
        password = hash_password(DEMO_PASSWORD)
        created = datetime(2026, 9, 1, 2, tzinfo=self.tz)
        for key, (name, email, phone, roles, address, ward) in USERS.items():
            user = User(
                name=name,
                email=email,
                phone=phone,
                password_hash=password,
                roles=roles,
                address=address,
                ward=ward,
                consent_at=created,
                created_at=created,
            )
            self.db.add(user)
            self.users[key] = user
        self.db.flush()
        for key, (user_key, skills, areas, rating, active) in TECHNICIANS.items():
            tech = Technician(
                user_id=self.users[user_key].id,
                skills=skills,
                areas=areas,
                rating=rating,
                rating_count=0,
                active=active,
                schedule=SCHEDULES[key],
            )
            self.db.add(tech)
            self.techs[key] = tech
        for key, (owner, kind, brand, model, *note) in DEVICES.items():
            device = Device(customer_id=self.users[owner].id, type=kind, brand=brand, model=model, note=note[0] if note else "")
            self.db.add(device)
            self.devices[key] = device
        self.db.flush()

    def ticket_id(self, created: datetime) -> str:
        day = created.astimezone(self.tz).strftime("%Y%m%d")
        self.counters[day] += 1
        return f"YC-{day}-{self.counters[day]:03d}"

    def category_service(self, code: str) -> Service:
        key = next(k for c, _, k in CATEGORIES if c == code)
        return self.services[key]

    def ticket(
        self,
        *,
        customer: str,
        device: str,
        category: str,
        status: Status,
        created: datetime,
        slot: datetime,
        description: str,
        urgency: str = "TRUNG_BINH",
        ai: dict | None = None,
        address: str | None = None,
        ward: str | None = None,
    ) -> Ticket:
        user = self.users[customer]
        t = Ticket(
            id=self.ticket_id(created),
            customer_id=user.id,
            device_id=self.devices[device].id,
            description=description,
            address=address or user.address,
            ward=ward or user.ward,
            contact_phone=user.phone,
            slot_start=slot,
            category_code=category,
            urgency=urgency,
            estimated_minutes=self.category_service(category).duration_min,
            ai_result=ai
            or {
                "categoryCode": category,
                "confidence": 0.86,
                "urgency": urgency,
                "reason": "Mô tả khớp với các dấu hiệu đặc trưng.",
                "state": "ok",
                "promptVersion": "v1",
                "ms": 820,
            },
            category_confirmed=status != Status.MOI,
            status=status,
            version=1,
            checklist=[],
            created_at=created,
            updated_at=created,
        )
        self.db.add(t)
        return t

    @staticmethod
    def history(t: Ticket, steps: list[tuple]) -> None:
        for status, at, by, *note in steps:
            t.history.append(TicketHistory(status=status, at=at, by_name=by, note=note[0] if note else ""))
        t.updated_at = steps[-1][1]

    def assign(
        self,
        t: Ticket,
        tech: str,
        appointment: datetime,
        assigned: datetime,
        result: str | None = "NHAN",
        responded: datetime | None = None,
        deadline: datetime | None = None,
    ) -> None:
        t.assignments.append(
            Assignment(
                tech_id=self.techs[tech].id,
                appointment_at=appointment,
                assigned_at=assigned,
                deadline=deadline or assigned + 15 * MIN,
                result=result,
                responded_at=responded,
            )
        )

    def item(self, kind: str, key: str, selected: bool = True) -> QuoteItem:
        source = self.services[key] if kind == "service" else self.parts[key]
        return QuoteItem(
            kind=kind,
            ref_id=source.id,
            name=source.name,
            qty=1,
            unit_price=source.price,
            warranty_days=source.warranty_days,
            selected=selected,
        )

    def quote(
        self,
        t: Ticket,
        tech: str,
        items: list[QuoteItem],
        status: str,
        created: datetime,
        decided: datetime | None,
        note: str = "",
        reject_reason: str = "",
    ) -> Quote:
        q = Quote(
            type="CHINH",
            status=status,
            note=note,
            created_at=created,
            created_by=self.techs[tech].id,
            decided_at=decided,
            reject_reason=reject_reason,
            items=items,
        )
        t.quotes.append(q)
        return q

    @staticmethod
    def photos(t: Ticket, *kinds: str) -> None:
        for kind in kinds:
            t.photos.append(Photo(kind=kind, url=SAMPLE_PHOTO))

    def issue_warranties(self, t: Ticket, items: list[QuoteItem], start: datetime) -> None:
        self.db.flush()
        for i in items:
            if i.selected and i.warranty_days > 0:
                self.db.add(
                    Warranty(
                        ticket_id=t.id,
                        quote_item_id=i.id,
                        device_id=t.device_id,
                        customer_id=t.customer_id,
                        name=i.name,
                        start_at=start,
                        end_at=start + timedelta(days=i.warranty_days),
                    )
                )

    def notify(self, user: str, title: str, body: str, ticket_id: str | None, at: datetime) -> None:
        self.db.add(Notification(user_id=self.users[user].id, title=title, body=body, ticket_id=ticket_id, read=False, created_at=at))

    def history_30_days(self) -> None:
        rng = random.Random(20261030)
        categories = ["CAI_HDH", "VIRUS", "MAY_CHAM", "PHAN_MEM", "MANG", "PHAN_CUNG", "NGUON", "CAI_HDH", "VIRUS", "MAY_CHAM"]
        customers = ["kh1", "kh2", "kh3", "kh4", "kh5"]
        device_of = {"kh1": "tb1", "kh2": "tb3", "kh3": "tb4", "kh4": "tb5", "kh5": "tb6"}
        techs = ["k1", "k2", "k3"]
        dispatcher = self.users["dpv1"].name
        for day in range(30, 1, -1):
            for _ in range(rng.randint(1, 3)):
                cust = rng.choice(customers)
                category = rng.choice(categories)
                tech = rng.choice(techs)
                tech_name = self.users[TECHNICIANS[tech][0]].name
                created = self.at(-day, rng.randint(8, 15), rng.choice([0, 15, 30, 45]))
                appointment = created + rng.randint(3, 22) * HOUR
                done = appointment + rng.randint(60, 179) * MIN
                cancelled = rng.random() < 0.08
                rejected = not cancelled and rng.random() < 0.1
                name = next(n for c, n, _ in CATEGORIES if c == category)
                customer_name = self.users[cust].name
                t = self.ticket(
                    customer=cust,
                    device=device_of[cust],
                    category=category,
                    status=Status.DA_HUY if cancelled else Status.HOAN_TAT,
                    created=created,
                    slot=appointment,
                    description=f"Yêu cầu {name.lower()}.",
                )
                if cancelled:
                    t.cancel = {
                        "by": self.users[cust].id,
                        "byName": customer_name,
                        "reason": "Đã tự xử lý được",
                        "fee": 0,
                        "at": (created + 2 * HOUR).isoformat(),
                    }
                    self.history(
                        t, [(Status.MOI, created, customer_name), (Status.DA_HUY, created + 2 * HOUR, customer_name, "Đã tự xử lý được")]
                    )
                    continue
                service_key = next(k for c, _, k in CATEGORIES if c == category)
                items = [self.item("service", service_key)]
                if category == "PHAN_CUNG":
                    items.append(self.item("part", rng.choice(["ssd512", "ram8"])))
                if category == "MAY_CHAM" and rng.random() < 0.5:
                    items.append(self.item("service", "vesinh"))
                self.assign(t, tech, appointment, created + 20 * MIN, "NHAN", created + 28 * MIN)
                t.check_in_at = appointment
                if rejected:
                    for i in items:
                        i.selected = False
                self.quote(
                    t,
                    tech,
                    items,
                    "TU_CHOI" if rejected else "DA_DUYET",
                    appointment + 20 * MIN,
                    appointment + 30 * MIN,
                    reject_reason="Chi phí cao hơn dự kiến" if rejected else "",
                )
                amount = DEFAULT_CONFIG.survey_fee if rejected else sum(i.unit_price for i in items)
                cash = rng.random() >= 0.55
                if not rejected:
                    self.photos(t, "before", "after")
                    t.acceptance = {"result": "DAT", "at": done.isoformat()}
                completed = done + 10 * MIN
                t.payment = Payment(
                    amount=amount,
                    method="TIEN_MAT" if cash else "CHUYEN_KHOAN",
                    status="DA_DOI_SOAT" if cash else "DA_XAC_NHAN",
                    paid_at=completed,
                    confirmed_by=self.users[TECHNICIANS[tech][0]].id if cash else self.users["dpv1"].id,
                    confirmed_by_name=tech_name if cash else dispatcher,
                    confirmed_at=completed,
                    reconciled_by=self.users["dpv1"].id if cash else None,
                    reconciled_at=completed + DAY if cash else None,
                )
                t.completed_at = completed
                steps = [
                    (Status.MOI, created, customer_name),
                    (Status.DA_TIEP_NHAN, created + 10 * MIN, dispatcher),
                    (Status.DA_PHAN_CONG, created + 20 * MIN, dispatcher),
                    (Status.KTV_DA_NHAN, created + 28 * MIN, tech_name),
                    (Status.DANG_KHAO_SAT, appointment, tech_name),
                    (Status.CHO_DUYET_BAO_GIA, appointment + 20 * MIN, tech_name),
                ]
                if rejected:
                    steps.append((Status.CHO_THANH_TOAN, appointment + 30 * MIN, customer_name, "Khách từ chối báo giá, thu phí khảo sát"))
                else:
                    steps += [
                        (Status.DANG_THUC_HIEN, appointment + 30 * MIN, customer_name),
                        (Status.CHO_NGHIEM_THU, done - 10 * MIN, tech_name),
                        (Status.CHO_THANH_TOAN, done, customer_name),
                    ]
                steps.append((Status.HOAN_TAT, completed, tech_name if cash else dispatcher))
                self.history(t, steps)
                if not rejected and rng.random() < 0.75:
                    stars = 3 if rng.random() < 0.12 else 4 if rng.random() < 0.3 else 5
                    comment = "Kỹ thuật viên đến đúng giờ, làm nhanh, giải thích rõ." if stars == 5 else "Ổn, nhưng phải chờ hơi lâu."
                    t.review = Review(stars=stars, comment=comment, at=done + 2 * HOUR)
                if not rejected:
                    self.issue_warranties(t, items, completed)

    def live_tickets(self) -> None:
        now = self.now
        lan = self.users["dpv1"].name
        an = self.users["ktv1"].name

        created, appointment, done = self.at(-3, 9), self.at(-2, 9), self.at(-2, 11, 15)
        t = self.ticket(
            customer="kh1",
            device="tb1",
            category="MAY_CHAM",
            status=Status.HOAN_TAT,
            created=created,
            slot=appointment,
            description="Laptop chạy rất chậm, quạt kêu to và nóng khi mở nhiều tab trình duyệt.",
        )
        items = [self.item("service", "vesinh"), self.item("part", "ssd512"), self.item("service", "lapdat")]
        self.assign(t, "k1", appointment, created + 15 * MIN, "NHAN", created + 20 * MIN)
        t.check_in_at = appointment
        self.quote(
            t, "k1", items, "DA_DUYET", appointment + 25 * MIN, appointment + 35 * MIN, "Ổ HDD cũ đã chậm, đề xuất thay SSD và vệ sinh máy."
        )
        t.checklist = [
            {"text": "Sao lưu dữ liệu", "done": True},
            {"text": "Lắp SSD và chuyển hệ điều hành", "done": True},
            {"text": "Vệ sinh, tra keo tản nhiệt", "done": True},
        ]
        self.photos(t, "before", "after")
        t.acceptance = {"result": "DAT", "at": done.isoformat()}
        t.payment = Payment(
            amount=sum(i.unit_price for i in items),
            method="CHUYEN_KHOAN",
            status="DA_XAC_NHAN",
            paid_at=done + 5 * MIN,
            confirmed_by=self.users["dpv1"].id,
            confirmed_by_name=lan,
            confirmed_at=done + 10 * MIN,
        )
        t.completed_at = done + 10 * MIN
        self.history(
            t,
            [
                (Status.MOI, created, self.users["kh1"].name),
                (Status.DA_TIEP_NHAN, created + 8 * MIN, lan),
                (Status.DA_PHAN_CONG, created + 15 * MIN, lan),
                (Status.KTV_DA_NHAN, created + 20 * MIN, an),
                (Status.DANG_KHAO_SAT, appointment, an),
                (Status.CHO_DUYET_BAO_GIA, appointment + 25 * MIN, an),
                (Status.DANG_THUC_HIEN, appointment + 35 * MIN, self.users["kh1"].name),
                (Status.CHO_NGHIEM_THU, done - 5 * MIN, an),
                (Status.CHO_THANH_TOAN, done, self.users["kh1"].name),
                (Status.HOAN_TAT, done + 10 * MIN, lan, "Đã xác nhận chuyển khoản"),
            ],
        )
        self.issue_warranties(t, items, done + 10 * MIN)

        created, appointment = min(self.at(0, 7, 30), now - 2 * HOUR), now - 40 * MIN
        t = self.ticket(
            customer="kh1",
            device="tb2",
            category="NGUON",
            urgency="CAO",
            status=Status.CHO_DUYET_BAO_GIA,
            created=created,
            slot=appointment,
            description="PC bật lên quạt quay nhưng không lên hình, cần dùng gấp để làm việc.",
        )
        self.assign(t, "k1", appointment, created + 10 * MIN, "NHAN", created + 14 * MIN)
        t.check_in_at = appointment + 2 * MIN
        self.quote(
            t,
            "k1",
            [self.item("service", "nguon"), self.item("part", "nguon"), self.item("service", "toiuu")],
            "CHO_DUYET",
            now - 8 * MIN,
            None,
            "Bộ nguồn cũ đã phù, không cấp đủ điện cho card màn hình.",
        )
        self.photos(t, "before")
        self.history(
            t,
            [
                (Status.MOI, created, self.users["kh1"].name),
                (Status.DA_TIEP_NHAN, created + 5 * MIN, lan),
                (Status.DA_PHAN_CONG, created + 10 * MIN, lan),
                (Status.KTV_DA_NHAN, created + 14 * MIN, an),
                (Status.DANG_KHAO_SAT, appointment + 2 * MIN, an),
                (Status.CHO_DUYET_BAO_GIA, now - 8 * MIN, an),
            ],
        )
        self.notify("kh1", "Có báo giá mới", f"Kỹ thuật viên đã gửi báo giá cho phiếu {t.id}. Vui lòng xem và duyệt.", t.id, now - 8 * MIN)

        created = now - 25 * MIN
        t = self.ticket(
            customer="kh1",
            device="tb1",
            category="PHAN_MEM",
            status=Status.MOI,
            created=created,
            slot=self.at(1, 14),
            description="Cần cài Office và phần mềm kế toán MISA cho máy mới.",
            ai={
                "categoryCode": "PHAN_MEM",
                "confidence": 0.82,
                "urgency": "TRUNG_BINH",
                "reason": "Mô tả có 3 dấu hiệu khớp với loại sự cố này.",
                "state": "ok",
                "promptVersion": "v1",
                "ms": 740,
            },
        )
        self.history(t, [(Status.MOI, created, self.users["kh1"].name)])

        created = now - 12 * MIN
        t = self.ticket(
            customer="kh3",
            device="tb4",
            category="KHAC",
            status=Status.MOI,
            created=created,
            slot=self.at(1, 9, 30),
            description="Máy hay tự tắt khi đang dùng, không rõ lỗi gì.",
            ai={
                "categoryCode": "KHAC",
                "confidence": 0.41,
                "urgency": "TRUNG_BINH",
                "reason": "Không nhận ra từ khóa đặc trưng của loại sự cố nào.",
                "state": "low_confidence",
                "promptVersion": "v1",
                "ms": 910,
            },
        )
        self.history(t, [(Status.MOI, created, self.users["kh3"].name)])

        created = now - 50 * MIN
        slot = self.at(0, 16) if self.at(0, 16) > now + 3 * HOUR else self.at(1, 10)
        t = self.ticket(
            customer="kh2",
            device="tb3",
            category="VIRUS",
            urgency="CAO",
            status=Status.DA_TIEP_NHAN,
            created=created,
            slot=slot,
            description="Máy hiện thông báo đòi tiền chuộc, file Word không mở được. Cần xử lý gấp.",
        )
        self.history(t, [(Status.MOI, created, self.users["kh2"].name), (Status.DA_TIEP_NHAN, created + 6 * MIN, lan)])

        created = now - 30 * MIN
        slot = self.at(0, 15, 30) if self.at(0, 15, 30) > now + 2 * HOUR else self.at(1, 15, 30)
        t = self.ticket(
            customer="kh4",
            device="tb5",
            category="CAI_HDH",
            status=Status.DA_PHAN_CONG,
            created=created,
            slot=slot,
            description="Muốn cài lại Windows 11 sạch, giữ lại dữ liệu ổ D.",
        )
        self.assign(t, "k1", slot, now - 4 * MIN, None, None, now + 11 * MIN)
        self.history(
            t,
            [
                (Status.MOI, created, self.users["kh4"].name),
                (Status.DA_TIEP_NHAN, created + 10 * MIN, lan),
                (Status.DA_PHAN_CONG, now - 4 * MIN, lan, f"Phân công {an}"),
            ],
        )
        self.notify(
            "ktv1",
            "Việc mới được phân công",
            f"Bạn được phân công phiếu {t.id}. Vui lòng nhận hoặc từ chối trong 15 phút.",
            t.id,
            now - 4 * MIN,
        )

        created = self.at(-1, 20)
        slot = self.at(0, 17) if self.at(0, 17) > now + HOUR else self.at(1, 8, 30)
        t = self.ticket(
            customer="kh5",
            device="tb6",
            category="MANG",
            status=Status.KTV_DA_NHAN,
            created=created,
            slot=slot,
            description="Wifi trong nhà chập chờn, phòng ngủ không bắt được sóng.",
        )
        self.assign(t, "k1", slot, created + 30 * MIN, "NHAN", created + 35 * MIN)
        self.history(
            t,
            [
                (Status.MOI, created, self.users["kh5"].name),
                (Status.DA_TIEP_NHAN, created + 20 * MIN, lan),
                (Status.DA_PHAN_CONG, created + 30 * MIN, lan),
                (Status.KTV_DA_NHAN, created + 35 * MIN, an),
            ],
        )

        phuc = self.users["ktv2"].name
        created = min(self.at(0, 7), now - 3 * HOUR)
        appointment = now - 70 * MIN
        t = self.ticket(
            customer="kh3",
            device="tb4",
            category="DU_LIEU",
            status=Status.DANG_THUC_HIEN,
            created=created,
            slot=appointment,
            description="USB chứa tài liệu luận văn không đọc được, cần lấy lại dữ liệu.",
        )
        self.assign(t, "k2", appointment, created + 10 * MIN, "NHAN", created + 12 * MIN)
        t.check_in_at = appointment
        self.quote(t, "k2", [self.item("service", "dulieu")], "DA_DUYET", appointment + 15 * MIN, appointment + 20 * MIN)
        self.photos(t, "before")
        self.history(
            t,
            [
                (Status.MOI, created, self.users["kh3"].name),
                (Status.DA_TIEP_NHAN, created + 5 * MIN, lan),
                (Status.DA_PHAN_CONG, created + 10 * MIN, lan),
                (Status.KTV_DA_NHAN, created + 12 * MIN, phuc),
                (Status.DANG_KHAO_SAT, appointment, phuc),
                (Status.CHO_DUYET_BAO_GIA, appointment + 15 * MIN, phuc),
                (Status.DANG_THUC_HIEN, appointment + 20 * MIN, self.users["kh3"].name),
            ],
        )

        huy = self.users["ktv3"].name
        created, appointment, done = self.at(-1, 9), self.at(-1, 14), self.at(-1, 15, 20)
        t = self.ticket(
            customer="kh2",
            device="tb3",
            category="CAI_HDH",
            status=Status.CHO_THANH_TOAN,
            created=created,
            slot=appointment,
            description="Cài lại Windows và driver sau khi thay ổ cứng.",
        )
        items = [self.item("service", "win"), self.item("service", "office")]
        self.assign(t, "k3", appointment, created + 10 * MIN, "NHAN", created + 12 * MIN)
        t.check_in_at = appointment
        self.quote(t, "k3", items, "DA_DUYET", appointment + 10 * MIN, appointment + 15 * MIN)
        self.photos(t, "before", "after")
        t.acceptance = {"result": "DAT", "at": done.isoformat()}
        t.payment = Payment(amount=sum(i.unit_price for i in items), method="CHUYEN_KHOAN", status="CHO_XAC_NHAN", paid_at=done + 6 * MIN)
        self.history(
            t,
            [
                (Status.MOI, created, self.users["kh2"].name),
                (Status.DA_TIEP_NHAN, created + 5 * MIN, lan),
                (Status.DA_PHAN_CONG, created + 10 * MIN, lan),
                (Status.KTV_DA_NHAN, created + 12 * MIN, huy),
                (Status.DANG_KHAO_SAT, appointment, huy),
                (Status.CHO_DUYET_BAO_GIA, appointment + 10 * MIN, huy),
                (Status.DANG_THUC_HIEN, appointment + 15 * MIN, self.users["kh2"].name),
                (Status.CHO_NGHIEM_THU, done - 5 * MIN, huy),
                (Status.CHO_THANH_TOAN, done, self.users["kh2"].name),
            ],
        )
        self.notify("dpv1", "Phiếu mới cần tiếp nhận", "Có 2 phiếu mới đang chờ tiếp nhận trên bảng điều phối.", None, now - 12 * MIN)

    def finish(self) -> None:
        self.db.flush()
        for tech in self.techs.values():
            stars = self.db.scalars(
                select(Review.stars)
                .join(Ticket, Ticket.id == Review.ticket_id)
                .join(Assignment, Assignment.ticket_id == Ticket.id)
                .where(Assignment.tech_id == tech.id)
            ).all()
            if stars:
                tech.rating = round(sum(stars) / len(stars), 1)
                tech.rating_count = len(stars)
        for day, value in self.counters.items():
            self.db.add(DailyCounter(day=day, value=value))


def reset_database(db: Session) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


def load_demo(db: Session) -> None:
    reset_database(db)
    catalog = load_catalog(db)
    (media_root() / "mau.svg").write_text(SAMPLE_SVG, encoding="utf-8")
    builder = DemoBuilder(db, catalog, utcnow())
    builder.people()
    builder.history_30_days()
    builder.live_tickets()
    builder.finish()


def main() -> None:
    parser = argparse.ArgumentParser(description="Nạp dữ liệu cho IT OnSite")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    sub.add_parser("demo")
    admin = sub.add_parser("admin")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", required=True)
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.command == "catalog":
            load_catalog(db)
        elif args.command == "demo":
            load_demo(db)
        else:
            load_catalog(db)
            create_admin(db, args.email, args.name, getpass.getpass("Mật khẩu: "))
        db.commit()
    print("Đã nạp dữ liệu.")


if __name__ == "__main__":
    main()
