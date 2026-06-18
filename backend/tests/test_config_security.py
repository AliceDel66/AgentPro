import pytest

from app.core.config import Settings


def test_production_rejects_weak_jwt_secret() -> None:
    with pytest.raises(ValueError):
        Settings(env="production", jwt_secret="CHANGE_ME_LOCAL_ONLY")


def test_production_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValueError):
        Settings(env="production", jwt_secret="too-short")


def test_production_accepts_strong_jwt_secret_and_docs_off_by_default() -> None:
    settings = Settings(env="production", jwt_secret="x" * 40)
    assert settings.docs_effective is False


def test_local_allows_default_secret_and_docs_on() -> None:
    settings = Settings(env="local", jwt_secret="CHANGE_ME_LOCAL_ONLY")
    assert settings.docs_effective is True


def test_docs_can_be_explicitly_enabled_in_production() -> None:
    settings = Settings(env="production", jwt_secret="x" * 40, docs_enabled=True)
    assert settings.docs_effective is True
