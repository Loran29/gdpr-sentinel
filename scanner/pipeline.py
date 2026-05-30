"""Scan orchestrator. The eval harness, the API background task, and the
first-run seed all funnel into the same `run_full_scan` / `run_delta_scan`
entry points so behaviour is consistent.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import sqlalchemy
import yaml
from sqlalchemy import select

from connectors.base import Connector, FileMeta
from connectors.local_folder import LocalFolderConnector
from core.config import get_settings
from core.enums import OwnerType, ScanStatus, ScanType
from core.hashing import canonical_findings_hash, file_sha256
from db.models import Entity, File, Finding, MasterOfDataSource, Scan
from db.session import session_scope
from scanner.extractor import extract_text
from scanner.llm_classifier import classify
from scanner.presidio_scanner import analyze as presidio_analyze

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Contextual entity filtering — reduces false positives before DB write and hash
# ---------------------------------------------------------------------------

DEPARTMENT_BLOCKLIST = {
    "Project Management", "Engineering", "Finance", "Digital Operations",
    "People & Culture", "IT Governance", "HR", "IT", "Procurement",
    "Operations", "Legal", "Compliance", "Marketing", "Sales",
    "Research", "Development", "Quality", "Security", "Accounting",
    "Administration", "Management", "Support", "Services",
}

# Entity types that are noise under GDPR when surfaced alone — detected and
# logged internally but excluded from Findings and eval scoring.
SUPPRESSED_TYPES = {"DATE", "JOB_TITLE", "LOCATION", "POSTAL_CODE", "OTHER"}


def _filter_entities(entities: list, text: str, document_type: str) -> list:
    """Drop noisy entities using context and co-occurrence rules."""
    # Pre-compute whether any PERSON_NAME survived to this point.
    has_person = any(e["type"] == "PERSON_NAME" for e in entities)

    kept = []
    for ent in entities:
        # Suppress types that are not GDPR-relevant when surfaced alone.
        if ent["type"] in SUPPRESSED_TYPES:
            continue

        val = ent["value"]

        # Drop multiline spans — Presidio sometimes spans across newlines producing
        # compound values like "Elena Fischer\nDepartment". Never a real entity value.
        if "\n" in val:
            continue

        # PERSON_NAME rules.
        if ent["type"] == "PERSON_NAME":
            # Must contain at least one space — real names are first + last.
            # Single-word hits are almost always German nouns (Montag, Tür, Tel).
            if " " not in val:
                continue
            # No name is longer than 5 words (catches phrase extractions like
            # "Zahlungen von meinem Konto" or "Rue de la Paix").
            if len(val.split()) > 5:
                continue
            # Must not be a known department name.
            if val.strip() in DEPARTMENT_BLOCKLIST:
                continue
            # Must start with an uppercase letter.
            if not val[0].isupper():
                continue

        # ORGANIZATION_NAME rules.
        if ent["type"] == "ORGANIZATION_NAME":
            # Short all-caps abbreviations (EU, VAT, IBAN, HRB) are not orgs.
            if len(val) <= 4 and val.upper() == val:
                continue
            # Paragraph-length extractions are not org names.
            if len(val) > 80:
                continue
            # Only meaningful in supplier_onboarding.
            if document_type != "supplier_onboarding":
                continue

        # FINANCIAL_AMOUNT only personal data in financial document types.
        if ent["type"] == "FINANCIAL_AMOUNT" and document_type not in (
            "expense_report", "supplier_onboarding", "financial_authorization"
        ):
            continue

        # DEPARTMENT is only meaningful when a person is identified in the same doc.
        if ent["type"] == "DEPARTMENT" and not has_person:
            continue

        kept.append(ent)
    return kept


# ---------------------------------------------------------------------------
# Public entrypoints
# ---------------------------------------------------------------------------


def run_full_scan(
    connector: Connector,
    source_id: Optional[str] = None,
    scan_id: Optional[str] = None,
) -> str:
    return _run_scan(
        connector,
        source_id=source_id,
        scan_type=ScanType.FULL.value,
        scan_id=scan_id,
    )


def run_delta_scan(
    connector: Connector,
    source_id: Optional[str] = None,
    scan_id: Optional[str] = None,
) -> str:
    return _run_scan(
        connector,
        source_id=source_id,
        scan_type=ScanType.DELTA.value,
        scan_id=scan_id,
    )


def rescan_file(file_id: str) -> Optional[str]:
    """Re-run the pipeline for a single file by its DB file_id.

    Returns the finding_id of the new finding, or None if no entities were found.
    Replaces the previous finding for this file (dedup logic in _scan_one_file).
    """
    from db.models import File as FileModel

    with session_scope() as s:
        file_row = s.execute(select(FileModel).where(FileModel.id == file_id)).scalar_one_or_none()
        if file_row is None:
            return None
        file_path = file_row.path

    connector = LocalFolderConnector(root=get_settings().data_root_path)
    try:
        data = connector.read_file(file_path)
    except Exception as exc:
        logger.warning("rescan_file: read failed for %s: %s", file_path, exc)
        return None

    sha = file_sha256(data)
    mod_routing = _load_mod_routing()

    # Use a synthetic scan_id for single-file rescans.
    scan_id = f"rescan_{uuid.uuid4().hex[:8]}"
    with session_scope() as s:
        s.add(
            Scan(
                id=scan_id,
                source_id="src_local_data",
                scan_type=ScanType.FULL.value,
                status=ScanStatus.COMPLETED.value,
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
                duration_sec=0.0,
                files_processed=1,
                result_hash="",
            )
        )

    from connectors.base import FileMeta
    import mimetypes
    from pathlib import Path as _Path
    p = _Path(file_path) if not file_path.startswith("/data/") else connector._resolve(file_path)
    stat = p.stat() if p.exists() else None
    fm = FileMeta(
        path=file_path,
        name=_Path(file_path).name,
        size_bytes=stat.st_size if stat else 0,
        last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc) if stat else datetime.now(timezone.utc),
        mime_type=mimetypes.guess_type(_Path(file_path).name)[0] or "application/pdf",
    )

    result = _scan_one_file(connector, fm, data, sha, scan_id, mod_routing)
    return result.get("file_path") if result and "file_path" in result else None


def reserve_scan_id(scan_type: str, source_id: Optional[str] = None) -> str:
    """Synchronously create a Scan row in `running` state and return its id.

    The route uses this so the response carries a scan_id the frontend can poll
    immediately, rather than a placeholder that never resolves.
    """
    started = datetime.now(timezone.utc)
    scan_id = f"scan_{started.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"
    with session_scope() as s:
        s.add(
            Scan(
                id=scan_id,
                source_id=source_id,
                scan_type=scan_type,
                status=ScanStatus.RUNNING.value,
                started_at=started,
            )
        )
    return scan_id


# ---------------------------------------------------------------------------
# Implementation
# ---------------------------------------------------------------------------


def _run_scan(
    connector: Connector,
    source_id: Optional[str],
    scan_type: str,
    scan_id: Optional[str] = None,
) -> str:
    started = datetime.now(timezone.utc)
    if scan_id is None:
        scan_id = f"scan_{started.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"
        with session_scope() as s:
            s.add(
                Scan(
                    id=scan_id,
                    source_id=source_id,
                    scan_type=scan_type,
                    status=ScanStatus.RUNNING.value,
                    started_at=started,
                )
            )
    else:
        # Caller already reserved the row; just confirm it exists and refresh
        # started_at to "now" (the reserved row may be a few ms older).
        with session_scope() as s:
            existing = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
            if existing is None:
                s.add(
                    Scan(
                        id=scan_id,
                        source_id=source_id,
                        scan_type=scan_type,
                        status=ScanStatus.RUNNING.value,
                        started_at=started,
                    )
                )

    t0 = time.perf_counter()

    files = connector.list_files()
    files_total = len(files)
    files_processed = 0
    files_skipped = 0
    files_with_findings = 0
    findings_for_hash: list[dict] = []

    mod_routing = _load_mod_routing()

    # Set total file count upfront so the progress endpoint has something to show.
    with session_scope() as s:
        scan_row = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
        if scan_row is not None:
            scan_row.progress_files_total = files_total

    # Pre-read and hash files; resolve delta skips before launching threads.
    work_items: list[tuple[FileMeta, bytes, str]] = []
    for fm in files:
        try:
            data = connector.read_file(fm.path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("read_file failed for %s: %s", fm.path, exc)
            continue

        sha = file_sha256(data)

        if scan_type == ScanType.DELTA.value:
            with session_scope() as s:
                existing = s.execute(select(File).where(File.path == fm.path)).scalar_one_or_none()
                if (
                    existing is not None
                    and existing.sha256 == sha
                    and existing.last_scanned_at is not None
                ):
                    files_skipped += 1
                    with session_scope() as s2:
                        scan_row = s2.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
                        if scan_row is not None:
                            scan_row.progress_files_completed += 1
                    continue

        work_items.append((fm, data, sha))

    # Update the progress total to reflect only the files we'll actually scan.
    with session_scope() as s:
        scan_row = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
        if scan_row is not None:
            scan_row.progress_files_total = files_skipped + len(work_items)

    progress_lock = threading.Lock()

    def _process(item: tuple[FileMeta, bytes, str]) -> Optional[dict]:
        fm, data, sha = item
        with progress_lock:
            with session_scope() as s:
                scan_row = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
                if scan_row is not None:
                    scan_row.progress_current_file = fm.name

        result = _scan_one_file(connector, fm, data, sha, scan_id, mod_routing)

        with progress_lock:
            with session_scope() as s:
                scan_row = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
                if scan_row is not None:
                    scan_row.progress_files_completed += 1

        return result

    agg_timings = {"extract_ms": 0.0, "presidio_ms": 0.0, "llm_ms": 0.0, "db_ms": 0.0}

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_process, item): item for item in work_items}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                logger.warning("File scan task raised: %s", exc)
                result = None
            files_processed += 1
            if result is not None:
                t = result.get("_timings", {})
                for k in agg_timings:
                    agg_timings[k] += t.get(k, 0.0)
                # A result with only _timings means no finding (entities all filtered).
                if "file_path" in result:
                    files_with_findings += 1
                    findings_for_hash.append({k: v for k, v in result.items() if k != "_timings"})

    duration = time.perf_counter() - t0
    completed = datetime.now(timezone.utc)
    result_hash = canonical_findings_hash(findings_for_hash)

    import json as _json
    with session_scope() as s:
        scan = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one()
        scan.status = ScanStatus.COMPLETED.value
        scan.completed_at = completed
        scan.duration_sec = round(duration, 3)
        scan.files_processed = files_processed
        scan.files_skipped = files_skipped
        scan.files_with_findings = files_with_findings
        scan.total_findings = len(findings_for_hash)
        scan.result_hash = result_hash
        scan.stage_timings_ms = _json.dumps({k: round(v) for k, v in agg_timings.items()})

    return scan_id


def _scan_one_file(
    connector: Connector,
    fm: FileMeta,
    data: bytes,
    sha: str,
    scan_id: str,
    mod_routing: list[tuple[str, str]],
) -> Optional[dict]:
    t_extract = time.perf_counter()
    pages = extract_text(data)
    full_text = "\n".join(p.text for p in pages if p.text)
    extract_ms = (time.perf_counter() - t_extract) * 1000

    t_presidio = time.perf_counter()
    presidio_entities = presidio_analyze(full_text)
    presidio_ms = (time.perf_counter() - t_presidio) * 1000

    t_llm = time.perf_counter()
    llm_result = classify(full_text, presidio_entities, filename_hint=fm.name)
    llm_ms = (time.perf_counter() - t_llm) * 1000

    # Merge LLM-discovered entities with Presidio results, dedup by (type, value).
    merged: list[dict] = [
        {
            "type": e.type,
            "value": e.value,
            "context": e.context,
            "detector": e.detector,
            "confidence": e.confidence,
        }
        for e in presidio_entities
    ]
    seen = {(e["type"], e["value"].casefold()) for e in merged}
    for ae in llm_result.get("additional_entities", []) or []:
        key = (ae["type"], str(ae["value"]).casefold())
        if key in seen:
            continue
        seen.add(key)
        merged.append(
            {
                "type": ae["type"],
                "value": ae["value"],
                "context": ae.get("context", ""),
                "detector": "llm",
                "confidence": 0.85,
            }
        )

    # Apply contextual filters to reduce false positives.
    merged = _filter_entities(merged, full_text, llm_result["document_type"])

    # No entities → no flagged finding.
    if not merged:
        t_db = time.perf_counter()
        _upsert_file_only(fm, sha, owner_user_id=connector.get_owner(fm.path))
        db_ms = (time.perf_counter() - t_db) * 1000
        return {"_timings": {"extract_ms": extract_ms, "presidio_ms": presidio_ms, "llm_ms": llm_ms, "db_ms": db_ms}}

    # Owner attribution.
    direct_owner = connector.get_owner(fm.path)
    if direct_owner:
        owner_user_id = direct_owner
        owner_type = OwnerType.DIRECT.value
        master_of_data_id: Optional[str] = None
    else:
        owner_user_id = None
        master_of_data_id = _route_to_mod(fm.path, mod_routing)
        owner_type = OwnerType.MASTER_OF_DATA.value

    finding_id = f"f_{uuid.uuid4().hex[:8]}"
    scan_timestamp = datetime.now(timezone.utc)

    t_db = time.perf_counter()
    with session_scope() as s:
        # Ensure File row exists.
        file_row = s.execute(select(File).where(File.path == fm.path)).scalar_one_or_none()
        if file_row is None:
            file_row = File(
                id=f"file_{uuid.uuid4().hex[:8]}",
                source_id="src_local_data",
                name=fm.name,
                path=fm.path,
                size_bytes=fm.size_bytes,
                sha256=sha,
                mime_type=fm.mime_type,
                owner_user_id=owner_user_id,
                last_modified=fm.last_modified.replace(tzinfo=None) if fm.last_modified else None,
                last_scanned_at=scan_timestamp.replace(tzinfo=None),
                has_findings=True,
            )
            s.add(file_row)
        else:
            file_row.size_bytes = fm.size_bytes
            file_row.sha256 = sha
            file_row.owner_user_id = owner_user_id
            file_row.last_modified = (
                fm.last_modified.replace(tzinfo=None) if fm.last_modified else None
            )
            file_row.last_scanned_at = scan_timestamp.replace(tzinfo=None)
            file_row.has_findings = True

        # Upsert finding: one canonical finding per file — latest scan wins.
        # Delete all previous findings for this file before inserting the new one
        # so /findings/by-user never returns duplicates across scan runs.
        existing_findings = s.execute(
            select(Finding).where(Finding.file_id == file_row.id)
        ).scalars().all()
        for ef in existing_findings:
            s.execute(sqlalchemy.delete(Entity).where(Entity.finding_id == ef.id))
            s.delete(ef)
        s.flush()

        finding = Finding(
            id=finding_id,
            scan_id=scan_id,
            file_id=file_row.id,
            document_type=llm_result["document_type"],
            sensitivity_level=llm_result["sensitivity_level"],
            reasoning=llm_result["reasoning"],
            retention_recommendation=llm_result["retention_recommendation"],
            owner_user_id=owner_user_id,
            master_of_data_id=master_of_data_id,
            owner_type=owner_type,
            scan_timestamp=scan_timestamp.replace(tzinfo=None),
        )
        s.add(finding)
        s.flush()
        for e in merged:
            s.add(
                Entity(
                    finding_id=finding.id,
                    type=e["type"],
                    value=e["value"],
                    context=e["context"],
                    detector=e["detector"],
                    confidence=float(e["confidence"]),
                )
            )
    db_ms = (time.perf_counter() - t_db) * 1000

    # Hash payload — must be stable across runs.
    # Only include entities from deterministic detectors (presidio/regex).
    # LLM additional_entities are probabilistic extras that vary across API calls
    # even at temperature=0 due to OpenRouter proxy non-determinism.
    deterministic_entities = [e for e in merged if e["detector"] != "llm"]
    return {
        "_timings": {"extract_ms": extract_ms, "presidio_ms": presidio_ms, "llm_ms": llm_ms, "db_ms": db_ms},
        "file_path": fm.path,
        "file_sha256": sha,
        "document_type": llm_result["document_type"],
        "sensitivity_level": llm_result["sensitivity_level"],
        "owner_type": owner_type,
        "owner_user_id": owner_user_id,
        "master_of_data_id": master_of_data_id,
        "entities": deterministic_entities,
    }


def _upsert_file_only(fm: FileMeta, sha: str, owner_user_id: Optional[str]) -> None:
    """Record a File row even when nothing flagged — needed for delta-scan logic
    (so we don't re-scan unchanged unflagged files next time)."""
    with session_scope() as s:
        existing = s.execute(select(File).where(File.path == fm.path)).scalar_one_or_none()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if existing is None:
            s.add(
                File(
                    id=f"file_{uuid.uuid4().hex[:8]}",
                    source_id="src_local_data",
                    name=fm.name,
                    path=fm.path,
                    size_bytes=fm.size_bytes,
                    sha256=sha,
                    mime_type=fm.mime_type,
                    owner_user_id=owner_user_id,
                    last_modified=fm.last_modified.replace(tzinfo=None) if fm.last_modified else None,
                    last_scanned_at=now,
                    has_findings=False,
                )
            )
        else:
            existing.size_bytes = fm.size_bytes
            existing.sha256 = sha
            existing.owner_user_id = owner_user_id
            existing.last_scanned_at = now


# ---------------------------------------------------------------------------
# Master-of-Data routing
# ---------------------------------------------------------------------------


def _load_mod_routing() -> list[tuple[str, str]]:
    """Return [(source_pattern, mod_id), ...] in the order they appear in YAML.
    The catch-all (`**`) is moved to the end."""
    cfg_path = Path(get_settings().master_of_data_config).resolve()
    routing: list[tuple[str, str]] = []
    if not cfg_path.exists():
        return [("**", "mod_default")]

    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    catch_all: list[tuple[str, str]] = []
    for mod in cfg.get("masters_of_data", []):
        for src in mod.get("sources", []):
            if src == "**":
                catch_all.append((src, mod["id"]))
            else:
                routing.append((src, mod["id"]))
    routing.extend(catch_all)
    return routing


def _route_to_mod(path: str, routing: list[tuple[str, str]]) -> str:
    normalized = path.replace("\\", "/")
    for pattern, mod_id in routing:
        if pattern == "**":
            return mod_id
        if pattern in normalized:
            return mod_id
    return "mod_default"
