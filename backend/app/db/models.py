from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)

    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    model_configs: Mapped[list[ModelProviderConfig]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    requirements: Mapped[list[Requirement]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    purpose: Mapped[str] = mapped_column(String(32), default="register", nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    __table_args__ = (Index("ix_email_verification_email_purpose", "email", "purpose"),)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class ModelProviderConfig(TimestampMixin, Base):
    __tablename__ = "model_provider_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    default_model: Mapped[str] = mapped_column(String(128), nullable=False)
    api_key_ciphertext: Mapped[str | None] = mapped_column(Text)
    secret_saved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped[User] = relationship(back_populates="model_configs")

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_model_config_user_provider"),
    )


class Requirement(TimestampMixin, Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True, nullable=False)
    maturity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    route: Mapped[str | None] = mapped_column(String(64))
    summary: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="requirements")
    messages: Mapped[list[ConversationMessage]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )
    decisions: Mapped[list[RequirementDecision]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )
    specs: Mapped[list[AgentSpec]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    requirement_id: Mapped[str] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    requirement: Mapped[Requirement] = relationship(back_populates="messages")


class RequirementDecision(Base):
    __tablename__ = "requirement_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    requirement_id: Mapped[str] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    decision_key: Mapped[str] = mapped_column(String(128), nullable=False)
    decision_value: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    confirmed_by_user: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    requirement: Mapped[Requirement] = relationship(back_populates="decisions")

    __table_args__ = (
        UniqueConstraint("requirement_id", "decision_key", name="uq_requirement_decision_key"),
    )


class AgentSpec(TimestampMixin, Base):
    __tablename__ = "agent_specs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    requirement_id: Mapped[str] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    body: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True, nullable=False)

    requirement: Mapped[Requirement] = relationship(back_populates="specs")


class AgentGraphRun(TimestampMixin, Base):
    __tablename__ = "agent_graph_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    requirement_id: Mapped[str | None] = mapped_column(
        ForeignKey("requirements.id", ondelete="SET NULL"), index=True
    )
    graph_name: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True, nullable=False)
    current_node: Mapped[str | None] = mapped_column(String(80))
    state_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)


class DevJob(TimestampMixin, Base):
    __tablename__ = "dev_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    requirement_id: Mapped[str | None] = mapped_column(
        ForeignKey("requirements.id", ondelete="SET NULL"), index=True
    )
    spec_id: Mapped[str | None] = mapped_column(
        ForeignKey("agent_specs.id", ondelete="SET NULL"), index=True
    )
    source_review_id: Mapped[str | None] = mapped_column(
        ForeignKey("review_reports.id", ondelete="SET NULL"), index=True
    )
    strategy: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True, nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lease_owner: Mapped[str | None] = mapped_column(String(120))
    lease_token_hash: Mapped[str | None] = mapped_column(String(255))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    events: Mapped[list[DevJobEvent]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    artifacts: Mapped[list[DevJobArtifact]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class DevJobEvent(Base):
    __tablename__ = "dev_job_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("dev_jobs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    level: Mapped[str] = mapped_column(String(24), default="info", nullable=False)
    phase: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    job: Mapped[DevJob] = relationship(back_populates="events")


class DevJobArtifact(Base):
    __tablename__ = "dev_job_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("dev_jobs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engine: Mapped[str] = mapped_column(String(48), nullable=False)
    kind: Mapped[str] = mapped_column(String(48), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    uri: Mapped[str | None] = mapped_column(String(512))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    job: Mapped[DevJob] = relationship(back_populates="artifacts")


class ReviewReport(TimestampMixin, Base):
    __tablename__ = "review_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[str | None] = mapped_column(
        ForeignKey("dev_jobs.id", ondelete="SET NULL"), index=True
    )
    spec_id: Mapped[str | None] = mapped_column(
        ForeignKey("agent_specs.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    recommended_engine: Mapped[str | None] = mapped_column(String(48))
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    hallucination_risk: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stability_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    performance_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)

    findings: Mapped[list[ReviewFinding]] = relationship(
        back_populates="review", cascade="all, delete-orphan"
    )


class ReviewFinding(Base):
    __tablename__ = "review_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    review_id: Mapped[str] = mapped_column(
        ForeignKey("review_reports.id", ondelete="CASCADE"), index=True, nullable=False
    )
    severity: Mapped[str] = mapped_column(String(24), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    review: Mapped[ReviewReport] = relationship(back_populates="findings")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(80))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
