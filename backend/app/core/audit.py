from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog


async def record_audit(
    session: AsyncSession,
    *,
    user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Append an audit-log row to the session (committed by the caller's flow).

    Never put secrets in `payload` — it is persisted verbatim.
    """
    session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
        )
    )
