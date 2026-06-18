from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet, MultiFernet

from app.core.config import get_settings


def _fernet_from(material: str) -> Fernet:
    return Fernet(urlsafe_b64encode(sha256(material.encode()).digest()))


def get_secret_fernet() -> MultiFernet:
    """Build the secret cipher with key separation + lazy rotation.

    Encryption always uses the first key. Decryption tries every key, so when a
    dedicated AGENTPRO_SECRET_ENC_KEY is introduced, ciphertext previously encrypted
    with the JWT-secret-derived key still decrypts (re-encrypted on next save).
    """
    settings = get_settings()
    materials: list[str] = []
    if settings.secret_enc_key:
        materials.append(settings.secret_enc_key)
    # Legacy / fallback: data encrypted before key separation used the JWT secret.
    if settings.jwt_secret not in materials:
        materials.append(settings.jwt_secret)
    return MultiFernet([_fernet_from(material) for material in materials])


def encrypt_secret(secret: str) -> str:
    return get_secret_fernet().encrypt(secret.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    return get_secret_fernet().decrypt(ciphertext.encode()).decode()
