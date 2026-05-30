"""Pydantic v2 schemas. Field names mirror CONTRACT.md §4 verbatim — snake_case.

Frontend imports types generated from these models via datamodel-code-generator.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from core.enums import (
    DOCUMENT_TYPES,
    ENTITY_TYPES,
    OWNER_TYPES,
    REVIEW_STATUSES,
    SCAN_STATUSES,
    SCAN_TYPES,
    SENSITIVITY_LEVELS,
)


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------


class EntityOut(_Base):
    type: str = Field(..., description="One of ENTITY_TYPES")
    value: str
    context: str = ""
    detector: str = "presidio"
    confidence: float = 0.0


class FindingOut(_Base):
    id: str
    scan_id: str
    file_id: str
    file_name: str
    file_path: str
    file_size_bytes: int
    file_sha256: str
    document_type: str
    sensitivity_level: str
    entities: list[EntityOut]
    reasoning: str
    retention_recommendation: str
    owner_user_id: Optional[str] = None
    owner_name: Optional[str] = None
    owner_type: str
    master_of_data_id: Optional[str] = None
    scan_timestamp: datetime
    review_status: str
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None


class UserOut(_Base):
    id: str
    name: str
    email: str
    department: str
    role: Literal["employee", "admin"]
    is_master_of_data: bool


class FileOut(_Base):
    id: str
    name: str
    path: str
    size_bytes: int
    sha256: str
    mime_type: str
    source_id: Optional[str] = None
    owner_user_id: Optional[str] = None
    last_modified: Optional[datetime] = None
    last_scanned_at: Optional[datetime] = None
    has_findings: bool


class MasterOfDataOut(_Base):
    id: str
    user_id: str
    user_name: str
    assigned_sources: list[str]
    description: str


class ScanProgress(BaseModel):
    files_total: int
    files_completed: int
    current_file: Optional[str] = None
    percent: int
    elapsed_sec: float
    estimated_remaining_sec: Optional[float] = None


class ScanOut(_Base):
    id: str
    source_id: Optional[str] = None
    scan_type: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_sec: float
    files_processed: int
    files_skipped: int
    files_with_findings: int
    total_findings: int
    result_hash: str
    progress: Optional[ScanProgress] = None


class RecentScanOut(_Base):
    id: str
    completed_at: Optional[datetime] = None
    duration_sec: float
    files_processed: int
    findings_count: int


class DashboardStatsOut(_Base):
    total_files_scanned: int
    total_size_bytes: int
    files_with_findings: int
    total_findings: int
    scan_speed_files_per_sec: float
    avg_file_scan_ms: float
    precision_pct: float
    recall_pct: float
    f1_score: float
    last_scan_at: Optional[datetime] = None
    last_scan_duration_sec: float
    findings_by_document_type: dict[str, int]
    findings_by_sensitivity: dict[str, int]
    recent_scans: list[RecentScanOut]


class OwnerSummaryOut(_Base):
    user_id: str
    name: str
    type: Literal["direct", "master_of_data"]
    assigned_sources: list[str]
    files_assigned: int
    pending_reviews: int
    completed_reviews: int


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class ScanRunRequest(BaseModel):
    source_path: str = "/data"


class ScanRunResponse(BaseModel):
    scan_id: str
    status: str = "running"


class ScanDeltaResponse(BaseModel):
    scan_id: str
    status: str = "running"
    files_to_process: int


class FindingActionRequest(BaseModel):
    action: Literal["delete", "mark_false_positive", "keep_business_need"]
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Error envelope
# ---------------------------------------------------------------------------


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
