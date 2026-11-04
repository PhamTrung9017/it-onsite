"""Kiểm thử tải NFR-01: 50 người dùng đồng thời, 95% yêu cầu API nghiệp vụ phản hồi trong 1 giây (không tính gọi AI).

Chạy trên dữ liệu trình diễn (`python -m app.seed demo`), ví dụ:
    locust -f loadtest/locustfile.py --host http://localhost:8080 --headless -u 50 -r 10 -t 3m --csv ket-qua
"""

import random
from datetime import datetime, timedelta, timezone
from itertools import count

from locust import HttpUser, between, task

API = "/api/v1"
PASSWORD = "123456"
CUSTOMERS = ["khach@demo.vn", "binh.tran@demo.vn", "chau.le@demo.vn", "dung.vo@demo.vn", "bao.hoang@demo.vn"]
TECHNICIANS = ["ktv@demo.vn", "phuc.le@demo.vn", "huy.tran@demo.vn"]
VN = timezone(timedelta(hours=7))
sequence = count()


def next_account(accounts: list[str]) -> str:
    return accounts[next(sequence) % len(accounts)]


class Staff(HttpUser):
    abstract = True
    wait_time = between(1, 3)
    account = ""

    def on_start(self) -> None:
        response = self.client.post(f"{API}/auth/login", json={"identifier": self.account, "password": PASSWORD}, name="đăng nhập")
        self.client.headers["Authorization"] = f"Bearer {response.json()['accessToken']}"

    def get(self, path: str, name: str | None = None):
        return self.client.get(f"{API}{path}", name=name or path)


class Customer(Staff):
    weight = 6

    def on_start(self) -> None:
        self.account = next_account(CUSTOMERS)
        super().on_start()
        self.tickets = [t["id"] for t in self.get("/tickets/mine").json()]
        self.device_id = self.get("/me/devices").json()[0]["id"]

    @task(3)
    def my_tickets(self) -> None:
        self.get("/tickets/mine")

    @task(4)
    def ticket_detail(self) -> None:
        if self.tickets:
            self.get(f"/tickets/{random.choice(self.tickets)}", "/tickets/{id}")

    @task(2)
    def catalog(self) -> None:
        self.get("/catalog")

    @task(2)
    def notifications(self) -> None:
        self.get("/notifications")

    @task(1)
    def warranties(self) -> None:
        self.get("/warranties/mine")

    @task(1)
    def create_ticket(self) -> None:
        slot = (datetime.now(VN) + timedelta(days=2)).replace(hour=random.choice([9, 10, 14, 15, 16]), minute=0, second=0, microsecond=0)
        body = {
            "deviceId": self.device_id,
            "description": "Máy tính chạy chậm, hay treo khi mở nhiều chương trình.",
            "address": "120 Nguyễn Trãi",
            "ward": "Bến Thành",
            "slotStart": slot.isoformat(),
            "categoryCode": "MAY_CHAM",
            "acceptTerms": True,
            "acceptPrivacy": True,
        }
        response = self.client.post(f"{API}/tickets", json=body, name="/tickets (tạo phiếu)")
        if response.ok:
            self.tickets.append(response.json()["id"])


class Technician(Staff):
    weight = 2

    def on_start(self) -> None:
        self.account = next_account(TECHNICIANS)
        super().on_start()

    @task(3)
    def jobs(self) -> None:
        jobs = self.get("/tech/jobs").json()
        if jobs:
            self.get(f"/tickets/{random.choice(jobs)['id']}", "/tickets/{id}")

    @task(1)
    def profile(self) -> None:
        self.get("/tech/profile")

    @task(1)
    def parts(self) -> None:
        self.get("/parts")


class Dispatcher(Staff):
    weight = 1
    account = "dpv@demo.vn"

    @task(4)
    def board(self) -> None:
        board = self.get("/dispatch/board").json()
        waiting = [t for t in board if t["status"] == "DA_TIEP_NHAN"]
        if waiting:
            ticket = random.choice(waiting)
            at = ticket["slotStart"].replace("+", "%2B")
            self.get(f"/tickets/{ticket['id']}/technician-suggestions?appointmentAt={at}", "/tickets/{id}/technician-suggestions")

    @task(2)
    def payments(self) -> None:
        self.get("/payments")
        self.get("/deposits")

    @task(1)
    def claims(self) -> None:
        self.get("/warranty-claims")


class Admin(Staff):
    weight = 1
    account = "qtv@demo.vn"

    @task(2)
    def overview(self) -> None:
        self.get("/admin/overview")

    @task(1)
    def report(self) -> None:
        self.get("/admin/reports?days=30", "/admin/reports")

    @task(1)
    def export(self) -> None:
        self.get("/admin/reports/export?days=30", "/admin/reports/export")
