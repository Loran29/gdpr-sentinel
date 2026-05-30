"""Scan orchestrator. The eval harness, the API background task, and the
first-run seed all funnel into the same `run_full_scan` / `run_delta_scan`
entry points so behaviour is consistent.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from sqlalchemy import select

from connectors.base import Connector, FileMeta
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

    for idx, fm in enumerate(files):
        # Update current file before processing so a slow file shows progress.
        with session_scope() as s:
            scan_row = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
            if scan_row is not None:
                scan_row.progress_current_file = fm.name

        try:
            data = connector.read_file(fm.path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("read_file failed for %s: %s", fm.path, exc)
            continue

        sha = file_sha256(data)

        # Delta: skip files we've already processed AND whose contents are unchanged.
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

        finding = _scan_one_file(connector, fm, data, sha, scan_id, mod_routing)
        files_processed += 1
        if finding is not None:
            files_with_findings += 1
            findings_for_hash.append(finding)

        # Increment completed counter after each file finishes.
        with session_scope() as s:
            scan_row = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one_or_none()
            if scan_row is not None:
                scan_row.progress_files_completed += 1
                # Clear current_file on the last file.
                if idx == files_total - 1:
                    scan_row.progress_current_file = None

    duration = time.perf_counter() - t0
    completed = datetime.now(timezone.utc)
    result_hash = canonical_findings_hash(findings_for_hash)

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

    return scan_id


def _scan_one_file(
    connector: Connector,
    fm: FileMeta,
    data: bytes,
    sha: str,
    scan_id: str,
    mod_routing: list[tuple[str, str]],
) -> Optional[dict]:
    pages = extract_text(data)
    full_text = "\n".join(p.text for p in pages if p.text)

    presidio_entities = presidio_analyze(full_text)

    llm_result = classify(full_text, presidio_entities, filename_hint=fm.name)

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

    # No entities → no flagged finding.
    if not merged:
        _upsert_file_only(fm, sha, owner_user_id=connector.get_owner(fm.path))
        return None

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

    # Hash payload — must be stable across runs.
    # Only include entities from deterministic detectors (presidio/regex).
    # LLM additional_entities are probabilistic extras that vary across API calls
    # even at temperature=0 due to OpenRouter proxy non-determinism.
    deterministic_entities = [e for e in merged if e["detector"] != "llm"]
    return {
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
