"""Phí giữ lịch, bỏ phí đổi lịch sát giờ, email không bắt buộc

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-04 06:01:24.093793
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEPOSIT_STATUSES = ("CHO_THANH_TOAN", "CHO_XAC_NHAN", "DA_XAC_NHAN", "DA_TRU", "KHONG_HOAN", "CHO_HOAN", "DA_HOAN", "KHONG_PHAT_SINH")


def upgrade() -> None:
    op.create_table(
        "deposits",
        sa.Column("ticket_id", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by_name", sa.String(length=160), nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settled_by_name", sa.String(length=160), nullable=False),
        sa.CheckConstraint(f"status IN ({', '.join(repr(s) for s in DEPOSIT_STATUSES)})", name="ck_deposits_status"),
        sa.CheckConstraint("amount >= 0", name="ck_deposits_amount"),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("ticket_id"),
    )
    op.create_index(op.f("ix_deposits_status"), "deposits", ["status"], unique=False)
    op.drop_column("tickets", "late_reschedule_fee")
    op.alter_column("users", "email", existing_type=sa.String(length=160), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE users SET email = phone || '@khong-co-email.local' WHERE email IS NULL")
    op.alter_column("users", "email", existing_type=sa.String(length=160), nullable=False)
    op.add_column("tickets", sa.Column("late_reschedule_fee", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("tickets", "late_reschedule_fee", server_default=None)
    op.drop_index(op.f("ix_deposits_status"), table_name="deposits")
    op.drop_table("deposits")
