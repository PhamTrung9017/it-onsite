"""Tốc độ: số lượt truy vấn mỗi trang danh sách không tăng theo số phiếu, phản hồi lớn được nén."""

import pytest
from sqlalchemy import event

from app.db import engine


@pytest.fixture
def queries():
    count = {"n": 0}

    def on_query(*_):
        count["n"] += 1

    event.listen(engine, "before_cursor_execute", on_query)
    yield count
    event.remove(engine, "before_cursor_execute", on_query)


@pytest.mark.parametrize(
    ("who", "path", "limit"),
    [
        ("qtv", "/admin/reports?days=30", 20),
        ("qtv", "/admin/reports?days=90", 20),
        ("dpv", "/dispatch/board", 20),
        ("dpv", "/payments", 20),
        ("dpv", "/deposits", 20),
        ("khach", "/tickets/mine", 20),
    ],
)
def test_list_pages_use_few_queries(request, queries, who, path, limit):
    api = request.getfixturevalue(who)
    queries["n"] = 0
    api.ok("get", path)
    assert queries["n"] <= limit, f"{path}: {queries['n']} truy vấn"


def test_large_responses_are_compressed(dpv):
    response = dpv.client.get("/api/v1/payments", headers={**dpv.headers, "Accept-Encoding": "gzip"})
    assert response.status_code == 200 and response.headers.get("content-encoding") == "gzip"
