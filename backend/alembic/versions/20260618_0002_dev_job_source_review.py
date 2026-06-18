"""add source review to dev jobs

Revision ID: 20260618_0002
Revises: 20260617_0001
Create Date: 2026-06-18
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260618_0002"
down_revision: str | None = "20260617_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dev_jobs", sa.Column("source_review_id", sa.String(36), nullable=True))
    op.create_index(op.f("ix_dev_jobs_source_review_id"), "dev_jobs", ["source_review_id"])
    op.create_foreign_key(
        "fk_dev_jobs_source_review_id_review_reports",
        "dev_jobs",
        "review_reports",
        ["source_review_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_dev_jobs_source_review_id_review_reports",
        "dev_jobs",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_dev_jobs_source_review_id"), table_name="dev_jobs")
    op.drop_column("dev_jobs", "source_review_id")
