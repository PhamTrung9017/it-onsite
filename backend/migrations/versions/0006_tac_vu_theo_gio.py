"""Đánh dấu tác vụ theo giờ (nhắc lịch kỹ thuật viên, tổng kết cuối ngày)

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-13 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "job_runs",
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("period", sa.String(length=120), nullable=False),
        sa.Column("ran_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("name", "period"),
    )


def downgrade() -> None:
    op.drop_table("job_runs")
