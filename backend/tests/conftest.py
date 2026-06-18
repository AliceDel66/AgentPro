from collections.abc import AsyncGenerator, Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.ratelimit import get_login_rate_limiter
from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app


@pytest.fixture(autouse=True)
def _hermetic_settings(monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Keep tests offline: never read the real .env SMTP/DB/secret.

    Without this, get_settings() loads backend/.env and the email-code endpoint
    connects to the production SMTP server (sending real mail and suppressing the
    debugCode the tests rely on).
    """
    monkeypatch.setenv("AGENTPRO_ENV", "test")
    monkeypatch.setenv("AGENTPRO_SMTP_HOST", "")
    monkeypatch.setenv("AGENTPRO_SMTP_USER", "")
    monkeypatch.setenv("AGENTPRO_SMTP_PASSWORD", "")
    monkeypatch.setenv("AGENTPRO_JWT_SECRET", "test-secret-not-for-production")
    get_settings.cache_clear()
    # The login throttle is a process-global singleton; clear it so counts don't leak between tests.
    get_login_rate_limiter().clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def api_client() -> AsyncGenerator[AsyncClient]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_db_session() -> AsyncGenerator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app = create_app()
    app.state.db_session_factory = session_factory
    app.dependency_overrides[get_db_session] = override_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        yield client

    await engine.dispose()
