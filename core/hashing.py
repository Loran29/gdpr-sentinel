"""Canonical hash of a scan's findings.

Two scans of the same input MUST produce the same `result_hash`. The eval harness
asserts this — it's the reproducibility proof.

Implementation: project each finding to a stable subset (excluding timestamps, DB
IDs, and review state), sort entities and findings deterministically, then SHA-256
the resulting JSON.
"""

import hashlib
import json
from typing import Any


def _normalize_entity(entity: dict) -> dict:
    return {
        "type": entity.get("type"),
        "value": entity.get("value"),
        "detector": entity.get("detector"),
        # context intentionally excluded — LLM-generated context strings vary
        # between calls even at temperature=0. type+value+detector is the stable
        # identity of an entity across runs.
    }


def _normalize_finding(finding: dict) -> dict:
    entities = sorted(
        (_normalize_entity(e) for e in finding.get("entities", [])),
        key=lambda e: (e["type"] or "", e["value"] or ""),
    )
    return {
        "file_path": finding.get("file_path"),
        "file_sha256": finding.get("file_sha256"),
        "document_type": finding.get("document_type"),
        "sensitivity_level": finding.get("sensitivity_level"),
        "owner_type": finding.get("owner_type"),
        "owner_user_id": finding.get("owner_user_id"),
        "master_of_data_id": finding.get("master_of_data_id"),
        "entities": entities,
    }


def canonical_findings_hash(findings: list[dict[str, Any]]) -> str:
    """Return a deterministic SHA-256 over the findings list."""
    normalized = sorted(
        (_normalize_finding(f) for f in findings),
        key=lambda f: (f["file_path"] or "", f["document_type"] or ""),
    )
    payload = json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def file_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
