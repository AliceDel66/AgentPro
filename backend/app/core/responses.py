from pydantic import BaseModel


class ApiResult[T](BaseModel):
    ok: bool
    data: T
    message: str | None = None


def ok[T](data: T, message: str | None = None) -> ApiResult[T]:
    return ApiResult(ok=True, data=data, message=message)
