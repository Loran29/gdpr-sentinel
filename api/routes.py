"""All HTTP routes from CONTRACT.md §5. No more, no less."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Path, Query, Response
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
    DashboardStatsOut,
    EntityOut,
    FindingActionRequest,
    FindingOut,
    OwnerSummaryOut,
    RecentScanOut,
    ScanDeltaResponse,
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
from scanner.pipeline import reserve_scan_id, run_delta_scan, run_full_scan

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Health + lookups
# ---------------------------------------------------------------------------


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    rows = db.execute(select(User).order_by(User.id)).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


# ---------------------------------------------------------------------------
# Scans
# ---------------------------------------------------------------------------


def _connector_for(_source_path: str) -> LocalFolderConnector:
    """Single source for now; `source_path` is captured for future routing."""
    return LocalFolderConnector(root=get_settings().data_root_path)


@router.post("/scan/run", response_model=ScanRunResponse)
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


@router.post("/scan/delta", response_model=ScanDeltaResponse)
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


@router.get("/scan/{scan_id}", response_model=ScanOut)
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


@router.get("/scans", response_model=list[ScanOut])
def list_scans(db: Session = Depends(get_db)) -> list[ScanOut]:
    rows = (
        db.execute(select(Scan).order_by(desc(Scan.started_at)).limit(10))
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


@router.get("/findings/by-user/{user_id}", response_model=list[FindingOut])
def findings_by_user(
    user_id: str = Path(...),
    status: Optional[str] = Query(default=None),
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

    return [_build_finding_out(db, f) for f in combined[:100]]


@router.get("/findings/{finding_id}", response_model=FindingOut)
def get_finding(finding_id: str = Path(...), db: Session = Depends(get_db)) -> FindingOut:
    f = db.execute(select(Finding).where(Finding.id == finding_id)).scalar_one_or_none()
    if f is None:
        raise FindingNotFoundError(
            f"No finding with id '{finding_id}' exists", {"finding_id": finding_id}
        )
    return _build_finding_out(db, f)


@router.post("/findings/{finding_id}/action", response_model=FindingOut)
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


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------


@router.get("/admin/dashboard", response_model=DashboardStatsOut)
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
                findings_count=r.total_findings,
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

    # Files past their GDPR retention period — keyed on document type.
    RETENTION_YEARS = {
        "expense_report": 10,
        "supplier_onboarding": 10,
        "incident_report": 5,
        "it_access_request": 5,
        "training_evaluation": 2,
    }
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    files_past_retention = 0
    for doc_type, years in RETENTION_YEARS.items():
        cutoff = now - timedelta(days=365 * years)
        count = (
            db.execute(
                select(func.count())
                .select_from(Finding)
                .where(
                    Finding.document_type == doc_type,
                    Finding.scan_timestamp < cutoff,
                    Finding.review_status == "pending",
                )
            ).scalar_one()
            or 0
        )
        files_past_retention += int(count)

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


@router.get("/admin/owners", response_model=list[OwnerSummaryOut])
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

    for user_id, sources in direct_patterns.items():
        user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
        if user is None:
            continue
        files_assigned = (
            db.execute(
                select(func.count()).select_from(File).where(File.owner_user_id == user_id)
            ).scalar_one()
            or 0
        )
        pending = (
            db.execute(
                select(func.count())
                .select_from(Finding)
                .where(
                    Finding.owner_user_id == user_id,
                    Finding.review_status == "pending",
                )
            ).scalar_one()
            or 0
        )
        completed = (
            db.execute(
                select(func.count())
                .select_from(Finding)
                .where(
                    Finding.owner_user_id == user_id,
                    Finding.review_status != "pending",
                )
            ).scalar_one()
            or 0
        )
        out.append(
            OwnerSummaryOut(
                user_id=user.id,
                name=user.name,
                type=OwnerType.DIRECT.value,
                assigned_sources=sources,
                files_assigned=int(files_assigned),
                pending_reviews=int(pending),
                completed_reviews=int(completed),
            )
        )

    # Master-of-Data owners.
    mods = db.execute(select(MasterOfData)).scalars().all()
    for mod in mods:
        user = db.execute(select(User).where(User.id == mod.user_id)).scalar_one_or_none()
        if user is None:
            continue
        sources = [
            row.source_path
            for row in db.execute(
                select(MasterOfDataSource).where(MasterOfDataSource.mod_id == mod.id)
            )
            .scalars()
            .all()
        ]
        files_assigned = (
            db.execute(
                select(func.count())
                .select_from(Finding)
                .where(Finding.master_of_data_id == mod.id)
            ).scalar_one()
            or 0
        )
        pending = (
            db.execute(
                select(func.count())
                .select_from(Finding)
                .where(
                    Finding.master_of_data_id == mod.id,
                    Finding.review_status == "pending",
                )
            ).scalar_one()
            or 0
        )
        completed = (
            db.execute(
                select(func.count())
                .select_from(Finding)
                .where(
                    Finding.master_of_data_id == mod.id,
                    Finding.review_status != "pending",
                )
            ).scalar_one()
            or 0
        )
        out.append(
            OwnerSummaryOut(
                user_id=user.id,
                name=user.name,
                type=OwnerType.MASTER_OF_DATA.value,
                assigned_sources=sources,
                files_assigned=int(files_assigned),
                pending_reviews=int(pending),
                completed_reviews=int(completed),
            )
        )

    return out


# ---------------------------------------------------------------------------
# File preview — raw PDF stream for the user-view review sheet's <embed>.
# ---------------------------------------------------------------------------


@router.get("/files/{file_id}/preview")
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
