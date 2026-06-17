import smtplib
from email.message import EmailMessage

from app.core.config import Settings


def is_smtp_configured(settings: Settings) -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_user
        and settings.smtp_password
        and not settings.smtp_password.startswith("CHANGE_ME")
    )


def send_verification_code(email: str, code: str, settings: Settings) -> bool:
    if not is_smtp_configured(settings):
        return False

    message = EmailMessage()
    message["Subject"] = "AgentPro 邮箱验证码"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(f"你的 AgentPro 验证码是：{code}。验证码 10 分钟内有效。")

    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)

    return True
