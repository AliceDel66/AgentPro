from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet

from app.core.config import get_settings


def get_secret_fernet() -> Fernet:
    settings = get_settings()
    key = urlsafe_b64encode(sha256(settings.jwt_secret.encode()).digest())
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return get_secret_fernet().encrypt(secret.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    return get_secret_fernet().decrypt(ciphertext.encode()).decode()
