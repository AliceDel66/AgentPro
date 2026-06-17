from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AGENTPRO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins_raw: str = Field(
        default="http://127.0.0.1:5173,http://localhost:5173,tauri://localhost",
        alias="AGENTPRO_CORS_ORIGINS",
    )
    docs_enabled: bool = True
    database_url: str = "sqlite+aiosqlite:///./agentpro_local.db"
    redis_url: str = "redis://127.0.0.1:6379/0"
    jwt_secret: str = "CHANGE_ME_LOCAL_ONLY"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    email_code_expire_minutes: int = 10
    email_code_cooldown_seconds: int = 60
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "AgentPro <noreply@example.com>"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
