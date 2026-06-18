from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet

from app.core.config import get_settings
from app.core.crypto import decrypt_secret, encrypt_secret


def _legacy_encrypt(secret: str, material: str) -> str:
    """Reproduce the pre-key-separation ciphertext (JWT-secret-derived key)."""
    key = urlsafe_b64encode(sha256(material.encode()).digest())
    return Fernet(key).encrypt(secret.encode()).decode()


def test_round_trip_without_dedicated_key(monkeypatch) -> None:
    monkeypatch.setenv("AGENTPRO_SECRET_ENC_KEY", "")
    monkeypatch.setenv("AGENTPRO_JWT_SECRET", "jwt-secret-for-crypto-test")
    get_settings.cache_clear()

    token = encrypt_secret("sk-123")
    assert decrypt_secret(token) == "sk-123"


def test_legacy_ciphertext_decrypts_after_key_separation(monkeypatch) -> None:
    jwt_secret = "jwt-secret-legacy"
    legacy = _legacy_encrypt("sk-legacy", jwt_secret)

    monkeypatch.setenv("AGENTPRO_JWT_SECRET", jwt_secret)
    monkeypatch.setenv("AGENTPRO_SECRET_ENC_KEY", "dedicated-enc-key-distinct")
    get_settings.cache_clear()

    # Old ciphertext still readable via the fallback key.
    assert decrypt_secret(legacy) == "sk-legacy"
    # New writes round-trip under the dedicated key.
    fresh = encrypt_secret("sk-new")
    assert decrypt_secret(fresh) == "sk-new"
