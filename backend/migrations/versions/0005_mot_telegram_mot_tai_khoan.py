"""Mỗi tài khoản Telegram chỉ liên kết với một tài khoản

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-12 21:20:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Một Telegram đang gắn với nhiều tài khoản: giữ tài khoản liên kết gần nhất (theo nhật ký), gỡ các tài khoản còn lại.
    op.execute(
        """
        UPDATE users SET telegram_chat_id = NULL
        WHERE telegram_chat_id IS NOT NULL AND id NOT IN (
            SELECT DISTINCT ON (u.telegram_chat_id) u.id
            FROM users u
            LEFT JOIN audit_logs a ON a.action = 'LIEN_KET_TELEGRAM' AND a.target = u.id::text
            WHERE u.telegram_chat_id IS NOT NULL
            ORDER BY u.telegram_chat_id, a.at DESC NULLS LAST, u.id DESC
        )
        """
    )
    op.create_unique_constraint("users_telegram_chat_id_key", "users", ["telegram_chat_id"])


def downgrade() -> None:
    op.drop_constraint("users_telegram_chat_id_key", "users", type_="unique")
