"""SQLAlchemy 2.x ORM models. snake_case columns; field names match CONTRACT.md §4."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    department: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # employee | admin
    is_master_of_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class MasterOfData(Base):
    __tablename__ = "masters_of_data"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")

    sources: Mapped[list["MasterOfDataSource"]] = relationship(
        back_populates="master_of_data",
        cascade="all, delete-orphan",
    )


class MasterOfDataSource(Base):
    __tablename__ = "master_of_data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mod_id: Mapped[str] = mapped_column(ForeignKey("masters_of_data.id"), nullable=False)
    source_path: Mapped[str] = mapped_column(String, nullable=False)

    master_of_data: Mapped[MasterOfData] = relationship(back_populates="sources")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)  # local_folder | graph
    root_path: Mapped[str] = mapped_column(String, nullable=False)


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[Optional[str]] = mapped_column(ForeignKey("sources.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256: Mapped[str] = mapped_column(String, nullable=False, default="")
    mime_type: Mapped[str] = mapped_column(String, nullable=False, default="application/pdf")
    owner_user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    last_modified: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    has_findings: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_id: Mapped[Optional[str]] = mapped_column(ForeignKey("sources.id"), nullable=True)
    scan_type: Mapped[str] = mapped_column(String, nullable=False)  # full | delta
    status: Mapped[str] = mapped_column(String, nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    files_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_with_findings: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_findings: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result_hash: Mapped[str] = mapped_column(String, nullable=False, default="")
    progress_files_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_files_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_current_file: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stage_timings_ms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id"), nullable=False, index=True)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id"), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String, nullable=False)
    sensitivity_level: Mapped[str] = mapped_column(String, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False, default="")
    retention_recommendation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    owner_user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    master_of_data_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("masters_of_data.id"), nullable=True, index=True
    )
    owner_type: Mapped[str] = mapped_column(String, nullable=False)  # direct | master_of_data
    scan_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    review_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    reviewed_by_user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    entities: Mapped[list["Entity"]] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
    )


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)
    context: Mapped[str] = mapped_column(String, nullable=False, default="")
    detector: Mapped[str] = mapped_column(String, nullable=False, default="presidio")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    finding: Mapped[Finding] = relationship(back_populates="entities")
