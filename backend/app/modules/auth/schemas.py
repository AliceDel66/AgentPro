from pydantic import BaseModel, EmailStr, Field


class EmailCodeRequest(BaseModel):
    email: EmailStr
    purpose: str = "register"


class EmailCodeResponse(BaseModel):
    sent: bool
    cooldownSeconds: int
    debugCode: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=16)


class LogoutRequest(BaseModel):
    refreshToken: str = Field(min_length=16)


class AuthUser(BaseModel):
    id: str
    name: str
    email: EmailStr
    emailVerified: bool


class AuthSession(BaseModel):
    user: AuthUser
    accessToken: str
    refreshToken: str
    tokenType: str = "bearer"
    expiresIn: int


class LogoutResponse(BaseModel):
    loggedOut: bool


class PasswordResetConfirmRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8)


class PasswordResetResponse(BaseModel):
    reset: bool
