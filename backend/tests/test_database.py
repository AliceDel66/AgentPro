from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import models  # noqa: F401
from app.db.base import Base


def test_metadata_contains_core_tables() -> None:
    expected = {
        "users",
        "email_verification_codes",
        "refresh_tokens",
        "model_provider_configs",
        "requirements",
        "conversation_messages",
        "requirement_decisions",
        "agent_specs",
        "agent_graph_runs",
        "dev_jobs",
        "dev_job_events",
        "dev_job_artifacts",
        "review_reports",
        "review_findings",
        "audit_logs",
    }

    assert expected.issubset(set(Base.metadata.tables.keys()))


async def test_metadata_can_create_all_tables() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        table_names = await connection.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )

    await engine.dispose()
    assert "users" in table_names
    assert "agent_specs" in table_names
    assert "review_findings" in table_names
