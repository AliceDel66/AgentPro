from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.audit import record_audit
from app.db.base import Base
from app.db.models import AuditLog


async def test_record_audit_inserts_row() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with factory() as session:
        await record_audit(
            session,
            user_id=None,
            action="requirement.approve",
            resource_type="requirement",
            resource_id="req-1",
            payload={"status": "approved"},
        )
        await session.commit()

        rows = (await session.execute(select(AuditLog))).scalars().all()
        assert len(rows) == 1
        assert rows[0].action == "requirement.approve"
        assert rows[0].resource_id == "req-1"
        assert rows[0].payload == {"status": "approved"}

    await engine.dispose()
