"""add runner lease token hash

Revision ID: 20260623_0003
Revises: 20260618_0002
Create Date: 2026-06-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260623_0003"
down_revision: str | None = "20260618_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dev_jobs", sa.Column("lease_token_hash", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("dev_jobs", "lease_token_hash")
