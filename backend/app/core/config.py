from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# JWT secrets that must never be used outside local/test environments.
_WEAK_JWT_SECRETS = {
    "",
    "CHANGE_ME_LOCAL_ONLY",
    "CHANGE_ME_TO_A_LONG_RANDOM_SECRET",
}
_LOCAL_ENVS = {"local", "test"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AGENTPRO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "local"
    # Bind to loopback by default; container/server deployments pass 0.0.0.0 explicitly.
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins_raw: str = Field(
        default=(
            "http://127.0.0.1:5173,http://localhost:5173,"
            "http://127.0.0.1:5174,http://localhost:5174,tauri://localhost"
        ),
        alias="AGENTPRO_CORS_ORIGINS",
    )
    # None => derive from env (docs on for local/test, off otherwise). Set explicitly to override.
    docs_enabled: bool | None = None
    database_url: str = "sqlite+aiosqlite:///./agentpro_local.db"
    redis_url: str = "redis://127.0.0.1:6379/0"
    jwt_secret: str = "CHANGE_ME_LOCAL_ONLY"
    # Dedicated key for encrypting stored secrets (model API keys). Kept separate from
    # jwt_secret for key separation. Empty => fall back to jwt_secret (legacy behaviour).
    secret_enc_key: str = ""
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    # Login brute-force throttle: max failed attempts per (ip, identifier) within the window.
    login_max_failures: int = 5
    login_lock_seconds: int = 300
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

    @property
    def is_local(self) -> bool:
        return self.env in _LOCAL_ENVS

    @property
    def docs_effective(self) -> bool:
        """Whether API docs (/docs, /redoc, /openapi.json) should be served."""
        if self.docs_enabled is not None:
            return self.docs_enabled
        return self.is_local

    @model_validator(mode="after")
    def _enforce_secret_strength(self) -> "Settings":
        # Fail fast in non-local environments rather than silently signing JWTs with a known key.
        if not self.is_local and (
            self.jwt_secret in _WEAK_JWT_SECRETS or len(self.jwt_secret) < 32
        ):
            raise ValueError(
                "AGENTPRO_JWT_SECRET 未配置或强度不足：生产环境需提供 ≥32 字符的随机密钥"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
