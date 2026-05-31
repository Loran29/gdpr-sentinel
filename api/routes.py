"""All HTTP routes from CONTRACT.md §5. No more, no less."""

from __future__ import annotations

import logging
import re as _re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Path, Query, Response, UploadFile, File as FastAPIFile
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from api.errors import (
    ConfirmationRequiredError,
    FileNotFoundAppError,
    FindingNotFoundError,
    InvalidActionError,
    ScanNotFoundError,
    UserNotFoundError,
)
from api.schemas import (
    AuditEntryOut,
    BatchActionRequest,
    BatchActionResult,
    DashboardStatsOut,
    EntityOut,
    FileSummaryOut,
    FindingActionRequest,
    FindingOut,
    GraphTestOut,
    HealthDetailOut,
    OwnerSummaryOut,
    RecentScanOut,
    RetentionFileOut,
    RetentionNotifyRequest,
    RetentionNotifyResult,
    RetentionSummaryOut,
    RetentionViewRow,
    ScanCompareOut,
    ScanDeltaResponse,
    ScanDiffFile,
    ScanOut,
    ScanProgress,
    ScanRunRequest,
    ScanRunResponse,
    StageTiming,
    UserOut,
)
from connectors.local_folder import LocalFolderConnector
from core.config import get_settings
from core.enums import OwnerType, ReviewStatus, ScanType, UserAction
from db.models import (
    Entity,
    File,
    Finding,
    MasterOfData,
    MasterOfDataSource,
    Scan,
    User,
)
from db.session import get_db
from scanner.pipeline import reserve_scan_id, rescan_file, run_delta_scan, run_full_scan

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Health + lookups
# ---------------------------------------------------------------------------


@router.get("/health", tags=["Health"])
def health() -> dict:
    return {"status": "ok"}


@router.get("/admin/health", response_model=HealthDetailOut, tags=["Admin"])
def health_detail(db: Session = Depends(get_db)) -> HealthDetailOut:
    """Live resource intensity metrics — CPU, RAM, uptime, cache, DB counts."""
    import sys
    import time
    from pathlib import Path

    import psutil

    from main import _SERVER_START

    proc = psutil.Process()
    rss_mb = proc.memory_info().rss / 1024 ** 2
    cpu_count = psutil.cpu_count(logical=False) or 1

    cache_entries = len(list(Path(".llm_cache").glob("*.json"))) if Path(".llm_cache").exists() else 0

    from db.models import File, Finding, Scan
    db_findings = db.execute(select(func.count()).select_from(Finding)).scalar_one()
    db_files    = db.execute(select(func.count()).select_from(File)).scalar_one()
    db_scans    = db.execute(select(func.count()).select_from(Scan)).scalar_one()

    import time as _time

    # Pull files_skipped from latest completed scan for the ResourceHealth fields.
    last_scan = db.execute(
        select(Scan).where(Scan.status == "completed").order_by(desc(Scan.completed_at)).limit(1)
    ).scalar_one_or_none()
    files_skipped = last_scan.files_skipped if last_scan else 0
    llm_calls_skipped = last_scan.files_skipped if last_scan else 0

    return HealthDetailOut(
        status="ok",
        uptime_sec=round(time.perf_counter() - _SERVER_START, 1),
        rss_mb=round(rss_mb, 1),
        cpu_count=cpu_count,
        python_version=sys.version.split()[0],
        model=get_settings().openrouter_model,
        llm_cache_entries=cache_entries,
        db_findings=int(db_findings),
        db_files=int(db_files),
        db_scans=int(db_scans),
        cpu_load_pct=round(psutil.cpu_percent(interval=0.1), 1),
        memory_peak_mb=round(rss_mb, 1),
        files_skipped=int(files_skipped),
        text_extraction_avoided=int(files_skipped),
        llm_calls_skipped_in_delta_scan=int(llm_calls_skipped),
        checked_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/users", response_model=list[UserOut], tags=["Users"])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    rows = db.execute(select(User).order_by(User.id)).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


# ---------------------------------------------------------------------------
# Scans
# ---------------------------------------------------------------------------


def _connector_for(_source_path: str) -> LocalFolderConnector:
    """Single source for now; `source_path` is captured for future routing."""
    return LocalFolderConnector(root=get_settings().data_root_path)


@router.post("/scan/run", response_model=ScanRunResponse, tags=["Scans"])
def scan_run(
    body: ScanRunRequest,
    background: BackgroundTasks,
) -> ScanRunResponse:
    connector = _connector_for(body.source_path)

    scan_id = reserve_scan_id(scan_type=ScanType.FULL.value, source_id="src_local_data")

    def _bg() -> None:
        try:
            run_full_scan(connector=connector, source_id="src_local_data", scan_id=scan_id)
        except Exception:  # noqa: BLE001
            logger.exception("Background full scan failed")

    background.add_task(_bg)
    return ScanRunResponse(scan_id=scan_id, status="running")


@router.post("/scan/delta", response_model=ScanDeltaResponse, tags=["Scans"])
def scan_delta(
    body: ScanRunRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ScanDeltaResponse:
    connector = _connector_for(body.source_path)

    # Quick estimate of how many files will actually run through the pipeline.
    files_to_process = 0
    files_meta = connector.list_files()
    if files_meta:
        existing_paths = {row.path: row for row in db.execute(select(File)).scalars().all()}
        for fm in files_meta:
            existing = existing_paths.get(fm.path)
            if existing is None or existing.last_scanned_at is None:
                files_to_process += 1
                continue
            try:
                # Cheap re-read just for the estimate — small data set, fine here.
                data = connector.read_file(fm.path)
                from core.hashing import file_sha256

                if file_sha256(data) != existing.sha256:
                    files_to_process += 1
            except Exception:  # noqa: BLE001
                files_to_process += 1

    placeholder = reserve_scan_id(scan_type=ScanType.DELTA.value, source_id="src_local_data")

    def _bg() -> None:
        try:
            run_delta_scan(connector=connector, source_id="src_local_data", scan_id=placeholder)
        except Exception:  # noqa: BLE001
            logger.exception("Background delta scan failed")

    background.add_task(_bg)
    return ScanDeltaResponse(
        scan_id=placeholder,
        status="running",
        files_to_process=files_to_process,
    )


@router.get("/scan/{scan_id}", response_model=ScanOut, tags=["Scans"])
def get_scan(scan_id: str = Path(...), db: Session = Depends(get_db)) -> ScanOut:
    row = db.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
    if row is None:
        raise ScanNotFoundError(f"No scan with id '{scan_id}' exists", {"scan_id": scan_id})

    progress: Optional[ScanProgress] = None
    if row.status == "running":
        total = row.progress_files_total or 0
        completed = row.progress_files_completed or 0
        elapsed = (datetime.now(timezone.utc).replace(tzinfo=None) - row.started_at).total_seconds()
        est_remaining: Optional[float] = None
        if completed > 0 and total > completed:
            est_remaining = round((elapsed / completed) * (total - completed), 1)
        progress = ScanProgress(
            files_total=total,
            files_completed=completed,
            current_file=row.progress_current_file,
            percent=int(100 * completed / total) if total > 0 else 0,
            elapsed_sec=round(elapsed, 1),
            estimated_remaining_sec=est_remaining,
        )

    out = ScanOut.model_validate(row)
    out.progress = progress
    return out


@router.get("/scans", response_model=list[ScanOut], tags=["Scans"])
def list_scans(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[ScanOut]:
    rows = (
        db.execute(
            select(Scan).order_by(desc(Scan.started_at)).limit(limit).offset(offset)
        )
        .scalars()
        .all()
    )
    return [ScanOut.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------


def _build_finding_out(db: Session, f: Finding) -> FindingOut:
    file_row = db.execute(select(File).where(File.id == f.file_id)).scalar_one_or_none()
    if file_row is None:
        # Should not happen — FK enforces it — but be defensive.
        raise FileNotFoundAppError(f"Missing file row for finding {f.id}", {"finding_id": f.id})

    owner_name: Optional[str] = None
    if f.owner_user_id:
        u = db.execute(select(User).where(User.id == f.owner_user_id)).scalar_one_or_none()
        if u is not None:
            owner_name = u.name
    elif f.master_of_data_id:
        mod = db.execute(
            select(MasterOfData).where(MasterOfData.id == f.master_of_data_id)
        ).scalar_one_or_none()
        if mod is not None:
            mod_user = db.execute(select(User).where(User.id == mod.user_id)).scalar_one_or_none()
            if mod_user is not None:
                owner_name = mod_user.name

    entities = [EntityOut.model_validate(e) for e in f.entities]
    confidence = round(
        sum(e.confidence for e in entities) / len(entities) if entities else 0.0, 3
    )

    return FindingOut(
        id=f.id,
        scan_id=f.scan_id,
        file_id=f.file_id,
        file_name=file_row.name,
        file_path=file_row.path,
        file_size_bytes=file_row.size_bytes,
        file_sha256=file_row.sha256,
        document_type=f.document_type,
        sensitivity_level=f.sensitivity_level,
        confidence=confidence,
        entities=entities,
        reasoning=f.reasoning,
        retention_recommendation=f.retention_recommendation,
        owner_user_id=f.owner_user_id,
        owner_name=owner_name,
        owner_type=f.owner_type,
        master_of_data_id=f.master_of_data_id,
        scan_timestamp=f.scan_timestamp,
        review_status=f.review_status,
        reviewed_by_user_id=f.reviewed_by_user_id,
        reviewed_at=f.reviewed_at,
        review_note=f.review_note,
    )


@router.get("/findings/by-user/{user_id}", response_model=list[FindingOut], tags=["Findings"])
def findings_by_user(
    user_id: str = Path(...),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[FindingOut]:
    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None:
        raise UserNotFoundError(f"No user with id '{user_id}' exists", {"user_id": user_id})

    # Direct ownership.
    stmt = select(Finding).where(Finding.owner_user_id == user_id)
    if status:
        stmt = stmt.where(Finding.review_status == status)
    direct = db.execute(stmt).scalars().all()

    # Master-of-Data ownership: any finding routed to a MoD whose user_id is this user.
    mod_ids = (
        db.execute(select(MasterOfData.id).where(MasterOfData.user_id == user_id))
        .scalars()
        .all()
    )
    mod_findings: list[Finding] = []
    if mod_ids:
        mod_stmt = select(Finding).where(Finding.master_of_data_id.in_(mod_ids))
        if status:
            mod_stmt = mod_stmt.where(Finding.review_status == status)
        mod_findings = db.execute(mod_stmt).scalars().all()

    seen: set[str] = set()
    combined: list[Finding] = []
    for f in list(direct) + list(mod_findings):
        if f.id in seen:
            continue
        seen.add(f.id)
        combined.append(f)

    return [_build_finding_out(db, f) for f in combined[offset: offset + limit]]


@router.get("/findings/export", tags=["Findings"])
def findings_export(
    format: str = Query(default="csv", description="csv or json"),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Export all findings as CSV or JSON for compliance reporting."""
    import csv as csv_mod
    import io as _io
    import json as _json

    stmt = select(Finding, File).join(File, File.id == Finding.file_id)
    if status:
        stmt = stmt.where(Finding.review_status == status)
    stmt = stmt.order_by(desc(Finding.scan_timestamp))
    rows = db.execute(stmt).all()

    if format == "json":
        out = []
        for f, fl in rows:
            out.append({
                "finding_id": f.id, "file_name": fl.name, "file_path": fl.path,
                "document_type": f.document_type, "sensitivity_level": f.sensitivity_level,
                "review_status": f.review_status, "owner_user_id": f.owner_user_id,
                "master_of_data_id": f.master_of_data_id,
                "scan_timestamp": f.scan_timestamp.isoformat(),
                "reasoning": f.reasoning, "retention_recommendation": f.retention_recommendation,
            })
        return StreamingResponse(
            iter([_json.dumps(out, indent=2, ensure_ascii=False).encode("utf-8")]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=findings_export.json"},
        )

    buf = _io.StringIO()
    writer = csv_mod.writer(buf)
    writer.writerow([
        "finding_id", "file_name", "file_path", "document_type",
        "sensitivity_level", "review_status", "owner_user_id",
        "scan_timestamp", "reasoning", "retention_recommendation",
    ])
    for f, fl in rows:
        writer.writerow([
            f.id, fl.name, fl.path, f.document_type, f.sensitivity_level,
            f.review_status, f.owner_user_id or f.master_of_data_id,
            f.scan_timestamp.isoformat(), f.reasoning, f.retention_recommendation,
        ])
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=findings_export.csv"},
    )


@router.get("/findings/{finding_id}", response_model=FindingOut, tags=["Findings"])
def get_finding(finding_id: str = Path(...), db: Session = Depends(get_db)) -> FindingOut:
    f = db.execute(select(Finding).where(Finding.id == finding_id)).scalar_one_or_none()
    if f is None:
        raise FindingNotFoundError(
            f"No finding with id '{finding_id}' exists", {"finding_id": finding_id}
        )
    return _build_finding_out(db, f)


@router.post("/findings/{finding_id}/action", response_model=FindingOut, tags=["Findings"])
def finding_action(
    body: FindingActionRequest,
    finding_id: str = Path(...),
    confirm: Optional[bool] = Query(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> FindingOut:
    f = db.execute(select(Finding).where(Finding.id == finding_id)).scalar_one_or_none()
    if f is None:
        raise FindingNotFoundError(
            f"No finding with id '{finding_id}' exists", {"finding_id": finding_id}
        )

    if body.action == UserAction.DELETE.value:
        if not confirm:
            file_row = db.execute(select(File).where(File.id == f.file_id)).scalar_one_or_none()
            raise ConfirmationRequiredError(
                "Delete action requires ?confirm=true",
                {"file_path": file_row.path if file_row else None},
            )
        # Try to unlink the physical file; treat missing file as idempotent.
        file_row = db.execute(select(File).where(File.id == f.file_id)).scalar_one_or_none()
        if file_row is not None:
            connector = LocalFolderConnector(root=get_settings().data_root_path)
            physical = connector._resolve(file_row.path)
            try:
                physical.unlink(missing_ok=True)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Could not delete file %s: %s", physical, exc)
            file_row.has_findings = False
        f.review_status = ReviewStatus.DELETED.value

    elif body.action == UserAction.MARK_FALSE_POSITIVE.value:
        f.review_status = ReviewStatus.MARKED_FALSE_POSITIVE.value

    elif body.action == UserAction.KEEP_BUSINESS_NEED.value:
        f.review_status = ReviewStatus.KEPT_BUSINESS_NEED.value

    else:
        raise InvalidActionError(f"Unknown action '{body.action}'", {"action": body.action})

    if x_user_id:
        user = db.execute(select(User).where(User.id == x_user_id)).scalar_one_or_none()
        if user is not None:
            f.reviewed_by_user_id = user.id

    f.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    f.review_note = body.note
    db.commit()
    db.refresh(f)
    return _build_finding_out(db, f)


@router.post("/files/{file_id}/rescan", tags=["Files"])
def file_rescan(file_id: str = Path(...), db: Session = Depends(get_db)) -> dict:
    file_row = db.execute(select(File).where(File.id == file_id)).scalar_one_or_none()
    if file_row is None:
        raise FileNotFoundAppError(f"No file with id '{file_id}' exists", {"file_id": file_id})
    result = rescan_file(file_id)
    return {"file_id": file_id, "rescanned": True, "has_findings": result is not None}


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------


@router.get("/admin/dashboard", response_model=DashboardStatsOut, tags=["Admin"])
def admin_dashboard(db: Session = Depends(get_db)) -> DashboardStatsOut:
    total_files = db.execute(select(func.count()).select_from(File)).scalar_one()
    total_size = db.execute(select(func.coalesce(func.sum(File.size_bytes), 0))).scalar_one()
    files_with_findings = (
        db.execute(select(func.count()).select_from(File).where(File.has_findings.is_(True)))
        .scalar_one()
    )
    total_findings = db.execute(select(func.count()).select_from(Finding)).scalar_one()

    # Most recent completed scan drives speed/duration KPIs.
    last_scan = (
        db.execute(
            select(Scan).where(Scan.status == "completed").order_by(desc(Scan.completed_at)).limit(1)
        )
        .scalar_one_or_none()
    )

    last_scan_at = last_scan.completed_at if last_scan else None
    last_duration = float(last_scan.duration_sec) if last_scan else 0.0
    files_processed_last = last_scan.files_processed if last_scan else 0
    speed = (files_processed_last / last_duration) if last_duration > 0 else 0.0
    avg_ms = (last_duration * 1000.0 / files_processed_last) if files_processed_last > 0 else 0.0

    # Findings breakdown.
    by_doc: dict[str, int] = {}
    for doc_type, count in db.execute(
        select(Finding.document_type, func.count()).group_by(Finding.document_type)
    ).all():
        by_doc[doc_type] = count

    # Ensure every enum value is present so the frontend chart never breaks.
    from core.enums import DOCUMENT_TYPES, SENSITIVITY_LEVELS

    for dt in DOCUMENT_TYPES:
        by_doc.setdefault(dt, 0)

    by_sens: dict[str, int] = {}
    for level, count in db.execute(
        select(Finding.sensitivity_level, func.count()).group_by(Finding.sensitivity_level)
    ).all():
        by_sens[level] = count
    for sl in SENSITIVITY_LEVELS:
        by_sens.setdefault(sl, 0)

    # Recent scans for the dashboard table.
    recent_rows = (
        db.execute(select(Scan).order_by(desc(Scan.started_at)).limit(10)).scalars().all()
    )
    recent: list[RecentScanOut] = []
    for r in recent_rows:
        recent.append(
            RecentScanOut(
                id=r.id,
                completed_at=r.completed_at,
                duration_sec=float(r.duration_sec),
                files_processed=r.files_processed,
                files_skipped=r.files_skipped,
                findings_count=r.total_findings,
                scan_type=r.scan_type,
            )
        )

    # Precision/recall/F1: read from latest eval results if present, else 0.
    precision_pct, recall_pct, f1 = _read_latest_eval_metrics()

    # Per-stage timing breakdown from the last completed scan.
    timing_breakdown = StageTiming()
    if last_scan and last_scan.stage_timings_ms:
        try:
            import json as _json
            raw = _json.loads(last_scan.stage_timings_ms)
            timing_breakdown = StageTiming(
                extract_ms=float(raw.get("extract_ms", 0)),
                presidio_ms=float(raw.get("presidio_ms", 0)),
                llm_ms=float(raw.get("llm_ms", 0)),
                db_ms=float(raw.get("db_ms", 0)),
            )
        except Exception:  # noqa: BLE001
            pass

    # Files past their GDPR retention period — one query using a CASE expression.
    RETENTION_YEARS = {
        "expense_report": 10,
        "supplier_onboarding": 10,
        "financial_authorization": 10,
        "incident_report": 5,
        "it_access_request": 5,
        "medical_record": 3,
        "internal_memo": 3,
        "training_evaluation": 2,
    }
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    retention_rows = db.execute(
        select(Finding.document_type, Finding.scan_timestamp)
        .where(
            Finding.review_status == "pending",
            Finding.document_type.in_(list(RETENTION_YEARS.keys())),
        )
    ).all()
    files_past_retention = sum(
        1
        for doc_type, scan_ts in retention_rows
        if scan_ts < now - timedelta(days=365 * RETENTION_YEARS[doc_type])
    )

    return DashboardStatsOut(
        total_files_scanned=int(total_files or 0),
        total_size_bytes=int(total_size or 0),
        files_with_findings=int(files_with_findings or 0),
        total_findings=int(total_findings or 0),
        scan_speed_files_per_sec=round(speed, 3),
        avg_file_scan_ms=round(avg_ms, 1),
        precision_pct=precision_pct,
        recall_pct=recall_pct,
        f1_score=f1,
        last_scan_at=last_scan_at,
        last_scan_duration_sec=last_duration,
        findings_by_document_type=by_doc,
        findings_by_sensitivity=by_sens,
        recent_scans=recent,
        last_scan_timing_breakdown=timing_breakdown,
        files_past_retention=files_past_retention,
    )


def _read_latest_eval_metrics() -> tuple[float, float, float]:
    import json
    from pathlib import Path

    results_dir = Path("eval/results")
    if not results_dir.exists():
        return 0.0, 0.0, 0.0
    candidates = sorted(results_dir.glob("run_*.json"))
    if not candidates:
        return 0.0, 0.0, 0.0
    try:
        data = json.loads(candidates[-1].read_text(encoding="utf-8"))
        overall = data.get("overall", {})
        return (
            float(overall.get("precision_pct", 0.0)),
            float(overall.get("recall_pct", 0.0)),
            float(overall.get("f1_score", 0.0)),
        )
    except Exception:  # noqa: BLE001
        return 0.0, 0.0, 0.0


# ---------------------------------------------------------------------------
# Owners table
# ---------------------------------------------------------------------------


@router.get("/admin/retention", response_model=RetentionSummaryOut, tags=["Admin"])
def admin_retention(db: Session = Depends(get_db)) -> RetentionSummaryOut:
    """Group all pending findings by retention status.

    Retention periods by document type (years after scan_timestamp):
      expense_report / supplier_onboarding / financial_authorization: 10
      incident_report / it_access_request: 5
      medical_record / internal_memo: 3
      training_evaluation: 2
    """
    RETENTION_YEARS_MAP = {
        "expense_report": 10,
        "supplier_onboarding": 10,
        "financial_authorization": 10,
        "incident_report": 5,
        "it_access_request": 5,
        "medical_record": 3,
        "internal_memo": 3,
        "training_evaluation": 2,
    }

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    one_year_from_now = now.replace(year=now.year + 1)

    # One finding per file: pick the latest finding id per file_id in SQL,
    # then join back to get full Finding + File data.
    latest_finding_ids = (
        select(func.max(Finding.id).label("id"))
        .where(Finding.review_status == "pending")
        .group_by(Finding.file_id)
        .subquery()
    )
    unique = db.execute(
        select(Finding, File)
        .join(File, File.id == Finding.file_id)
        .where(Finding.id.in_(select(latest_finding_ids.c.id)))
        .order_by(Finding.scan_timestamp.desc())
    ).all()

    # Bulk-fetch all users and MoD→user mappings needed for owner_name resolution.
    owner_user_ids = {f.owner_user_id for f, _ in unique if f.owner_user_id}
    mod_ids_needed = {f.master_of_data_id for f, _ in unique if f.master_of_data_id}

    users_by_id: dict[str, str] = {}
    if owner_user_ids:
        for u in db.execute(select(User).where(User.id.in_(owner_user_ids))).scalars().all():
            users_by_id[u.id] = u.name

    mod_user_id_map: dict[str, str] = {}
    if mod_ids_needed:
        for mod in db.execute(
            select(MasterOfData).where(MasterOfData.id.in_(mod_ids_needed))
        ).scalars().all():
            mod_user_id_map[mod.id] = mod.user_id
        mod_user_ids = set(mod_user_id_map.values())
        for u in db.execute(select(User).where(User.id.in_(mod_user_ids))).scalars().all():
            users_by_id[u.id] = u.name

    past: list[RetentionFileOut] = []
    expiring: list[RetentionFileOut] = []
    compliant: list[RetentionFileOut] = []

    for f, fl in unique:
        years = RETENTION_YEARS_MAP.get(f.document_type, 3)
        # Use document_year if extracted; fall back to scan_timestamp year.
        # This ensures Old_Expense_2018.pdf shows deadline 2028, not 2036.
        base_year = f.document_year if f.document_year else f.scan_timestamp.year
        try:
            deadline = f.scan_timestamp.replace(year=base_year + years)
        except ValueError:
            deadline = f.scan_timestamp.replace(year=f.scan_timestamp.year + years)

        owner_name: Optional[str] = None
        if f.owner_user_id:
            owner_name = users_by_id.get(f.owner_user_id)
        elif f.master_of_data_id:
            mod_user_id = mod_user_id_map.get(f.master_of_data_id)
            if mod_user_id:
                owner_name = users_by_id.get(mod_user_id)

        days_overdue = int((now - deadline).days) if deadline < now else None

        item = RetentionFileOut(
            file_id=fl.id,
            file_name=fl.name,
            file_path=fl.path,
            document_type=f.document_type,
            sensitivity_level=f.sensitivity_level,
            scan_timestamp=f.scan_timestamp,
            retention_years=years,
            deadline_date=deadline,
            days_overdue=days_overdue,
            owner_user_id=f.owner_user_id,
            owner_name=owner_name,
            review_status=f.review_status,
        )

        if deadline < now:
            past.append(item)
        elif deadline < one_year_from_now:
            expiring.append(item)
        else:
            compliant.append(item)

    # Sort past_deadline by most overdue first.
    past.sort(key=lambda x: x.days_overdue or 0, reverse=True)

    # Build frontend-compatible rows (grouped by document_type + retention_recommendation).
    from collections import defaultdict as _dd
    row_map: dict[str, dict] = _dd(lambda: {"findings_count": 0, "retention_recommendation": ""})
    for item in past + expiring + compliant:
        key = item.document_type
        row_map[key]["document_type"] = item.document_type
        row_map[key]["retention_recommendation"] = item.document_type.replace("_", " ").title() + " retention applies"
        row_map[key]["findings_count"] += 1
    rows = [RetentionViewRow(**v) for v in row_map.values()]

    return RetentionSummaryOut(
        generated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        total_findings=len(past) + len(expiring) + len(compliant),
        rows=rows,
        past_deadline=past,
        expiring_within_1_year=expiring,
        compliant=compliant,
        total_past_deadline=len(past),
        total_expiring_soon=len(expiring),
        total_compliant=len(compliant),
    )


@router.get("/admin/owners", response_model=list[OwnerSummaryOut], tags=["Admin"])
def admin_owners(db: Session = Depends(get_db)) -> list[OwnerSummaryOut]:
    out: list[OwnerSummaryOut] = []

    # Direct owners — read patterns from YAML (single source of truth) so we
    # don't have to maintain a parallel mapping.
    import yaml

    cfg_path = get_settings().master_of_data_config
    cfg: dict = {}
    try:
        from pathlib import Path

        p = Path(cfg_path).resolve()
        if p.exists():
            cfg = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001
        cfg = {}

    direct_patterns: dict[str, list[str]] = {}
    for entry in cfg.get("direct_owner_patterns", []) or []:
        direct_patterns.setdefault(entry["user_id"], []).append(entry["pattern"])

    direct_user_ids = list(direct_patterns.keys())

    # Bulk-fetch all direct owners in one query.
    direct_users: dict[str, User] = {}
    if direct_user_ids:
        for u in db.execute(select(User).where(User.id.in_(direct_user_ids))).scalars().all():
            direct_users[u.id] = u

    # Bulk-fetch file counts for all direct owners in one query.
    direct_file_counts: dict[str, int] = {uid: 0 for uid in direct_user_ids}
    for uid, cnt in db.execute(
        select(File.owner_user_id, func.count())
        .where(File.owner_user_id.in_(direct_user_ids))
        .group_by(File.owner_user_id)
    ).all():
        direct_file_counts[uid] = int(cnt)

    # Bulk-fetch finding status counts for all direct owners in one query.
    direct_finding_counts: dict[str, dict[str, int]] = {uid: {"pending": 0, "completed": 0} for uid in direct_user_ids}
    for uid, status, cnt in db.execute(
        select(Finding.owner_user_id, Finding.review_status, func.count())
        .where(Finding.owner_user_id.in_(direct_user_ids))
        .group_by(Finding.owner_user_id, Finding.review_status)
    ).all():
        bucket = "pending" if status == "pending" else "completed"
        direct_finding_counts[uid][bucket] = direct_finding_counts[uid].get(bucket, 0) + int(cnt)

    for user_id, sources in direct_patterns.items():
        user = direct_users.get(user_id)
        if user is None:
            continue
        counts = direct_finding_counts[user_id]
        out.append(
            OwnerSummaryOut(
                user_id=user.id,
                name=user.name,
                type=OwnerType.DIRECT.value,
                assigned_sources=sources,
                files_assigned=direct_file_counts[user_id],
                pending_reviews=counts["pending"],
                completed_reviews=counts["completed"],
            )
        )

    # Master-of-Data owners.
    mods = db.execute(select(MasterOfData)).scalars().all()
    mod_ids = [mod.id for mod in mods]

    # Bulk-fetch all MoD users in one query.
    mod_user_ids = list({mod.user_id for mod in mods})
    mod_users: dict[str, User] = {}
    if mod_user_ids:
        for u in db.execute(select(User).where(User.id.in_(mod_user_ids))).scalars().all():
            mod_users[u.id] = u

    # Bulk-fetch all MoD sources in one query.
    mod_sources: dict[str, list[str]] = {mod.id: [] for mod in mods}
    if mod_ids:
        for row in db.execute(
            select(MasterOfDataSource).where(MasterOfDataSource.mod_id.in_(mod_ids))
        ).scalars().all():
            mod_sources[row.mod_id].append(row.source_path)

    # Bulk-fetch finding counts for all MoDs in one query.
    mod_finding_counts: dict[str, dict[str, int]] = {mid: {"pending": 0, "completed": 0} for mid in mod_ids}
    if mod_ids:
        for mid, status, cnt in db.execute(
            select(Finding.master_of_data_id, Finding.review_status, func.count())
            .where(Finding.master_of_data_id.in_(mod_ids))
            .group_by(Finding.master_of_data_id, Finding.review_status)
        ).all():
            bucket = "pending" if status == "pending" else "completed"
            mod_finding_counts[mid][bucket] = mod_finding_counts[mid].get(bucket, 0) + int(cnt)

    # Bulk-fetch file counts per MoD (findings table, not files table, since MoD
    # ownership is tracked on Finding.master_of_data_id).
    mod_file_counts: dict[str, int] = {mid: 0 for mid in mod_ids}
    if mod_ids:
        for mid, cnt in db.execute(
            select(Finding.master_of_data_id, func.count())
            .where(Finding.master_of_data_id.in_(mod_ids))
            .group_by(Finding.master_of_data_id)
        ).all():
            mod_file_counts[mid] = int(cnt)

    for mod in mods:
        user = mod_users.get(mod.user_id)
        if user is None:
            continue
        counts = mod_finding_counts[mod.id]
        out.append(
            OwnerSummaryOut(
                user_id=user.id,
                name=user.name,
                type=OwnerType.MASTER_OF_DATA.value,
                assigned_sources=mod_sources[mod.id],
                files_assigned=mod_file_counts[mod.id],
                pending_reviews=counts["pending"],
                completed_reviews=counts["completed"],
            )
        )

    return out


# ---------------------------------------------------------------------------
# File preview — raw PDF stream for the user-view review sheet's <embed>.
# ---------------------------------------------------------------------------


@router.get("/files/{file_id}/preview", tags=["Files"])
def file_preview(file_id: str = Path(...), db: Session = Depends(get_db)) -> Response:
    file_row = db.execute(select(File).where(File.id == file_id)).scalar_one_or_none()
    if file_row is None:
        raise FileNotFoundAppError(
            f"No file with id '{file_id}' exists", {"file_id": file_id}
        )

    connector = LocalFolderConnector(root=get_settings().data_root_path)
    try:
        data = connector.read_file(file_row.path)
    except Exception as exc:  # noqa: BLE001
        raise FileNotFoundAppError(
            f"File '{file_row.name}' is not readable from disk: {exc}",
            {"file_id": file_id, "path": file_row.path},
        )

    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{file_row.name}"'},
    )


# ---------------------------------------------------------------------------
# Upload & scan
# ---------------------------------------------------------------------------


@router.post("/upload/scan", tags=["Files"])
async def upload_and_scan(
    files: list[UploadFile] = FastAPIFile(...),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> dict:
    """Accept one or more PDF uploads, save to data/uploads/, scan immediately."""
    import uuid as _uuid
    from pathlib import Path as _Path
    import threading

    upload_dir = _Path(get_settings().data_root_path) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for upload in files:
        if not (upload.filename or "").lower().endswith(".pdf"):
            continue
        safe_name = _re.sub(r"[^\w\-.]", "_", upload.filename or "upload.pdf")
        dest = upload_dir / safe_name
        dest.write_bytes(await upload.read())
        saved_paths.append(str(dest))

    if not saved_paths:
        return {"error": "No valid PDF files received"}

    from scanner.pipeline import reserve_scan_id, run_full_scan as _run_full_scan

    scan_id = reserve_scan_id("full", source_id="src_upload")

    def _bg():
        connector = LocalFolderConnector(root=str(upload_dir))
        _run_full_scan(connector, source_id="src_upload", scan_id=scan_id)

    threading.Thread(target=_bg, daemon=True).start()
    return {"scan_id": scan_id, "status": "running", "files_queued": len(saved_paths)}


# ---------------------------------------------------------------------------
# #2 — Findings export
# ---------------------------------------------------------------------------


@router.get("/findings/export", tags=["Findings"])
def findings_export(
    format: str = Query(default="csv", description="csv or json"),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Export all findings as CSV or JSON for compliance reporting."""
    import csv as csv_mod
    import io as _io
    import json as _json

    stmt = select(Finding, File).join(File, File.id == Finding.file_id)
    if status:
        stmt = stmt.where(Finding.review_status == status)
    stmt = stmt.order_by(desc(Finding.scan_timestamp))
    rows = db.execute(stmt).all()

    if format == "json":
        out = []
        for f, fl in rows:
            out.append({
                "finding_id": f.id, "file_name": fl.name, "file_path": fl.path,
                "document_type": f.document_type, "sensitivity_level": f.sensitivity_level,
                "review_status": f.review_status, "owner_user_id": f.owner_user_id,
                "master_of_data_id": f.master_of_data_id,
                "scan_timestamp": f.scan_timestamp.isoformat(),
                "reasoning": f.reasoning, "retention_recommendation": f.retention_recommendation,
            })
        return StreamingResponse(
            iter([_json.dumps(out, indent=2, ensure_ascii=False).encode("utf-8")]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=findings_export.json"},
        )

    buf = _io.StringIO()
    writer = csv_mod.writer(buf)
    writer.writerow([
        "finding_id", "file_name", "file_path", "document_type",
        "sensitivity_level", "review_status", "owner_user_id",
        "scan_timestamp", "reasoning", "retention_recommendation",
    ])
    for f, fl in rows:
        writer.writerow([
            f.id, fl.name, fl.path, f.document_type, f.sensitivity_level,
            f.review_status, f.owner_user_id or f.master_of_data_id,
            f.scan_timestamp.isoformat(), f.reasoning, f.retention_recommendation,
        ])
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=findings_export.csv"},
    )


# ---------------------------------------------------------------------------
# #3 — Scan compare
# ---------------------------------------------------------------------------


@router.get("/scans/compare", response_model=ScanCompareOut, tags=["Scans"])
def scans_compare(
    a: str = Query(..., description="Scan ID A (older)"),
    b: str = Query(..., description="Scan ID B (newer)"),
    db: Session = Depends(get_db),
) -> ScanCompareOut:
    for sid in (a, b):
        row = db.execute(select(Scan).where(Scan.id == sid)).scalar_one_or_none()
        if row is None:
            raise ScanNotFoundError(f"No scan '{sid}'", {"scan_id": sid})

    def _findings_map(scan_id: str) -> dict[str, dict]:
        rows = db.execute(
            select(Finding, File).join(File, File.id == Finding.file_id)
            .where(Finding.scan_id == scan_id)
        ).all()
        return {fl.path: {"finding": f, "file": fl} for f, fl in rows}

    map_a = _findings_map(a)
    map_b = _findings_map(b)
    all_paths = set(map_a) | set(map_b)

    added, removed, changed, unchanged = [], [], [], []
    for path in sorted(all_paths):
        fa = map_a.get(path)
        fb = map_b.get(path)
        file_name = (fb or fa)["file"].name  # type: ignore[index]

        if fa is None:
            added.append(ScanDiffFile(
                file_name=file_name, file_path=path, change="added",
                document_type_b=fb["finding"].document_type,
                sensitivity_b=fb["finding"].sensitivity_level,
            ))
        elif fb is None:
            removed.append(ScanDiffFile(
                file_name=file_name, file_path=path, change="removed",
                document_type_a=fa["finding"].document_type,
                sensitivity_a=fa["finding"].sensitivity_level,
            ))
        elif (fa["finding"].document_type != fb["finding"].document_type or
              fa["finding"].sensitivity_level != fb["finding"].sensitivity_level):
            changed.append(ScanDiffFile(
                file_name=file_name, file_path=path, change="changed",
                document_type_a=fa["finding"].document_type,
                document_type_b=fb["finding"].document_type,
                sensitivity_a=fa["finding"].sensitivity_level,
                sensitivity_b=fb["finding"].sensitivity_level,
            ))
        else:
            unchanged.append(ScanDiffFile(
                file_name=file_name, file_path=path, change="unchanged",
                document_type_a=fa["finding"].document_type,
                document_type_b=fb["finding"].document_type,
            ))

    return ScanCompareOut(
        scan_id_a=a, scan_id_b=b,
        added=added, removed=removed, changed=changed, unchanged=unchanged,
        total_added=len(added), total_removed=len(removed), total_changed=len(changed),
    )


# ---------------------------------------------------------------------------
# #7 — Audit log
# ---------------------------------------------------------------------------


@router.get("/admin/audit", response_model=list[AuditEntryOut], tags=["Admin"])
def admin_audit(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AuditEntryOut]:
    """Chronological log of all reviewer actions — GDPR Art. 5(2) accountability."""
    rows = db.execute(
        select(Finding, File)
        .join(File, File.id == Finding.file_id)
        .where(Finding.review_status != "pending")
        .order_by(desc(Finding.reviewed_at))
        .limit(limit).offset(offset)
    ).all()

    result = []
    for f, fl in rows:
        reviewer_name: Optional[str] = None
        if f.reviewed_by_user_id:
            u = db.execute(select(User).where(User.id == f.reviewed_by_user_id)).scalar_one_or_none()
            if u:
                reviewer_name = u.name
        result.append(AuditEntryOut(
            id=f"audit_{f.id}",
            timestamp=f.reviewed_at.isoformat() if f.reviewed_at else datetime.now(timezone.utc).isoformat(),
            finding_id=f.id,
            file_name=fl.name,
            user=reviewer_name or f.reviewed_by_user_id or "Unknown",
            action=f.review_status.replace("_", " ").title(),
            review_note=f.review_note or "",
            resulting_status=f.review_status,
            reviewed_by_user_id=f.reviewed_by_user_id,
        ))
    return result


# ---------------------------------------------------------------------------
# #8 — Batch action
# ---------------------------------------------------------------------------


@router.post("/findings/batch-action", response_model=BatchActionResult, tags=["Findings"])
def findings_batch_action(
    body: BatchActionRequest,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> BatchActionResult:
    """Apply one action to multiple findings at once."""
    processed, failed = 0, 0
    results = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for fid in body.finding_ids:
        f = db.execute(select(Finding).where(Finding.id == fid)).scalar_one_or_none()
        if f is None:
            failed += 1
            results.append({"finding_id": fid, "ok": False, "error": "not_found"})
            continue
        try:
            if body.action == "delete":
                file_row = db.execute(select(File).where(File.id == f.file_id)).scalar_one_or_none()
                if file_row:
                    connector = LocalFolderConnector(root=get_settings().data_root_path)
                    physical = connector._resolve(file_row.path)
                    physical.unlink(missing_ok=True)
                    file_row.has_findings = False
                f.review_status = ReviewStatus.DELETED.value
            elif body.action == "mark_false_positive":
                f.review_status = ReviewStatus.MARKED_FALSE_POSITIVE.value
            elif body.action == "keep_business_need":
                f.review_status = ReviewStatus.KEPT_BUSINESS_NEED.value
            if x_user_id:
                f.reviewed_by_user_id = x_user_id
            f.reviewed_at = now
            f.review_note = body.note
            processed += 1
            results.append({"finding_id": fid, "ok": True})
        except Exception as exc:  # noqa: BLE001
            failed += 1
            results.append({"finding_id": fid, "ok": False, "error": str(exc)})

    db.commit()
    return BatchActionResult(processed=processed, failed=failed, results=results)


# ---------------------------------------------------------------------------
# #9 — Graph connector test
# ---------------------------------------------------------------------------


@router.get("/connectors/graph/test", response_model=GraphTestOut, tags=["Admin"])
def graph_connector_test() -> GraphTestOut:
    """Show what a real Graph connector would connect to and what it needs."""
    return GraphTestOut(
        status="stub",
        message=(
            "GraphConnector is implemented as a stub. Swap in a real implementation "
            "by providing tenant_id, client_id, and client_secret. The Connector "
            "interface (list_files, read_file, get_owner) is already wired into the "
            "scan pipeline — no other changes needed."
        ),
        would_connect_to="https://graph.microsoft.com/v1.0/users/{userId}/drive/root/children",
        required_permissions=["Files.Read.All", "Sites.Read.All", "User.Read.All"],
        sdk_package="msgraph-sdk or msal + httpx",
    )


# ---------------------------------------------------------------------------
# #10 — File summary
# ---------------------------------------------------------------------------


@router.get("/files/{file_id}/summary", response_model=FileSummaryOut, tags=["Files"])
def file_summary(file_id: str = Path(...), db: Session = Depends(get_db)) -> FileSummaryOut:
    """Human-readable summary of a file's latest finding."""
    file_row = db.execute(select(File).where(File.id == file_id)).scalar_one_or_none()
    if file_row is None:
        raise FileNotFoundAppError(f"No file with id '{file_id}'", {"file_id": file_id})

    finding = db.execute(
        select(Finding).where(Finding.file_id == file_id)
        .order_by(desc(Finding.scan_timestamp)).limit(1)
    ).scalar_one_or_none()

    if finding is None:
        return FileSummaryOut(
            file_id=file_id, file_name=file_row.name,
            document_type="unknown", sensitivity_level="low",
            confidence=0.0, owner_name=None,
            summary="No findings for this file.",
            entities_summary="No personal data detected.",
            retention_recommendation="No recommendation available.",
        )

    entities = db.execute(select(Entity).where(Entity.finding_id == finding.id)).scalars().all()
    confidence = round(sum(e.confidence for e in entities) / len(entities) if entities else 0.0, 3)

    owner_name: Optional[str] = None
    if finding.owner_user_id:
        u = db.execute(select(User).where(User.id == finding.owner_user_id)).scalar_one_or_none()
        if u:
            owner_name = u.name

    entity_parts = list({f"{e.type}: {e.value}" for e in entities})[:8]
    entities_summary = "; ".join(entity_parts) if entity_parts else "No entities detected."

    sensitivity_label = {"high": "HIGH sensitivity", "medium": "MEDIUM sensitivity", "low": "LOW sensitivity"}
    summary = (
        f"{file_row.name} is a {finding.document_type.replace('_', ' ')} document "
        f"with {sensitivity_label.get(finding.sensitivity_level, 'unknown sensitivity')}. "
        f"{finding.reasoning[:200]}"
    )

    return FileSummaryOut(
        file_id=file_id, file_name=file_row.name,
        document_type=finding.document_type, sensitivity_level=finding.sensitivity_level,
        confidence=confidence, owner_name=owner_name,
        summary=summary, entities_summary=entities_summary,
        retention_recommendation=finding.retention_recommendation,
    )


# ---------------------------------------------------------------------------
# #11 — Retention notify stub
# ---------------------------------------------------------------------------


@router.post("/admin/retention/notify", response_model=RetentionNotifyResult, tags=["Admin"])
def retention_notify(
    body: RetentionNotifyRequest,
    db: Session = Depends(get_db),
) -> RetentionNotifyResult:
    """Notify owners of files past their retention deadline (dry-run by default).

    In production this would send email via SMTP or Teams webhook.
    Currently logs who would be notified and returns the list.
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)

    RETENTION_YEARS_MAP = {
        "expense_report": 10, "supplier_onboarding": 10, "financial_authorization": 10,
        "incident_report": 5, "it_access_request": 5,
        "medical_record": 3, "internal_memo": 3, "training_evaluation": 2,
    }
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    one_year = now.replace(year=now.year + 1)

    findings = db.execute(
        select(Finding, File).join(File, File.id == Finding.file_id)
        .where(Finding.review_status == "pending")
    ).all()

    seen: set[str] = set()
    notified = []
    for f, fl in findings:
        if fl.id in seen:
            continue
        seen.add(fl.id)
        years = RETENTION_YEARS_MAP.get(f.document_type, 3)
        base_year = f.document_year if f.document_year else f.scan_timestamp.year
        try:
            deadline = f.scan_timestamp.replace(year=base_year + years)
        except ValueError:
            deadline = f.scan_timestamp.replace(year=f.scan_timestamp.year + years)

        is_past = deadline < now
        is_expiring = not is_past and deadline < one_year
        if not is_past and not (body.include_expiring_soon and is_expiring):
            continue

        owner_email: Optional[str] = None
        owner_name: Optional[str] = None
        uid = f.owner_user_id
        if uid is None and f.master_of_data_id:
            mod = db.execute(select(MasterOfData).where(MasterOfData.id == f.master_of_data_id)).scalar_one_or_none()
            if mod:
                uid = mod.user_id
        if uid:
            u = db.execute(select(User).where(User.id == uid)).scalar_one_or_none()
            if u:
                owner_email = u.email
                owner_name = u.name

        entry = {
            "file_name": fl.name, "document_type": f.document_type,
            "deadline": deadline.isoformat(), "owner_name": owner_name,
            "owner_email": owner_email, "status": "past_deadline" if is_past else "expiring_soon",
        }
        notified.append(entry)
        if body.dry_run:
            _log.info("[DRY RUN] Would notify %s about %s (deadline %s)", owner_email, fl.name, deadline.date())
        else:
            _log.info("[NOTIFY] Sending notification to %s about %s", owner_email, fl.name)

    return RetentionNotifyResult(dry_run=body.dry_run, notified=notified, total=len(notified))
