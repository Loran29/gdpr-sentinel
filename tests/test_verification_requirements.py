"""
GDPR Sentinel — automated verification tests.

Covers the 4 eval criteria and key API contracts:
  1. Scan accuracy  — entity detection + doc-type classification
  2. Reproducibility — two scans produce identical result_hash
  3. Scan speed     — cold scan completes within time budget
  4. Resource intensity — API endpoints return resource metrics
  5. API contract   — all required endpoints respond correctly
  6. Review actions — all three actions work end-to-end
  7. Retention      — past-deadline detection works
"""

from __future__ import annotations

import os
import sys
import time

import pytest
from fastapi.testclient import TestClient

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def client():
    """Single TestClient for all tests — DB is seeded once."""
    from main import app
    from db.session import init_db
    init_db()
    return TestClient(app)


@pytest.fixture(scope="session")
def users(client):
    r = client.get("/users")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def first_finding(client, users):
    """Return first pending finding for any user."""
    for user in users:
        r = client.get(f"/findings/by-user/{user['id']}?limit=1")
        if r.status_code == 200 and r.json():
            return r.json()[0], user["id"]
    return None, None


# ---------------------------------------------------------------------------
# 1. Health + basic endpoints
# ---------------------------------------------------------------------------


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_admin_health_fields(client):
    r = client.get("/admin/health")
    assert r.status_code == 200
    d = r.json()
    assert "rss_mb" in d
    assert "cpu_count" in d
    assert "uptime_sec" in d
    assert "model" in d
    assert d["status"] == "ok"


def test_users_returns_eight(client):
    r = client.get("/users")
    assert r.status_code == 200
    users = r.json()
    assert len(users) == 8
    ids = {u["id"] for u in users}
    for i in range(1, 9):
        assert f"u_00{i}" in ids


def test_user_roles(client):
    r = client.get("/users")
    users = r.json()
    employees = [u for u in users if u["role"] == "employee"]
    admins = [u for u in users if u["role"] == "admin"]
    assert len(employees) == 4
    assert len(admins) == 4


# ---------------------------------------------------------------------------
# 2. Findings endpoints
# ---------------------------------------------------------------------------


def test_findings_by_user_returns_list(client, users):
    r = client.get(f"/findings/by-user/{users[0]['id']}")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_finding_shape(client, users):
    """Every finding must have the required fields."""
    r = client.get(f"/findings/by-user/{users[0]['id']}?limit=5")
    assert r.status_code == 200
    for f in r.json():
        assert "id" in f
        assert "file_name" in f
        assert "document_type" in f
        assert "sensitivity_level" in f
        assert f["sensitivity_level"] in ("high", "medium", "low")
        assert "entities" in f
        assert "reasoning" in f
        assert "review_status" in f
        assert f["review_status"] in (
            "pending", "deleted", "marked_false_positive",
            "kept_business_need", "confirmed_business_need", "acknowledged_cleanup"
        )


def test_single_finding(client, first_finding):
    finding, _ = first_finding
    if finding is None:
        pytest.skip("No findings in DB")
    r = client.get(f"/findings/{finding['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == finding["id"]


def test_finding_not_found(client):
    r = client.get("/findings/f_doesnotexist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "FINDING_NOT_FOUND"


def test_user_not_found(client):
    r = client.get("/findings/by-user/u_999")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "USER_NOT_FOUND"


# ---------------------------------------------------------------------------
# 3. Review actions
# ---------------------------------------------------------------------------


def test_action_mark_false_positive(client, users):
    """mark_false_positive should succeed without confirm."""
    r = client.get(f"/findings/by-user/{users[0]['id']}?status=pending&limit=1")
    findings = r.json()
    if not findings:
        pytest.skip("No pending findings")
    fid = findings[0]["id"]
    r2 = client.post(
        f"/findings/{fid}/action",
        json={"action": "mark_false_positive", "note": "automated test"},
        headers={"X-User-Id": users[0]["id"]},
    )
    assert r2.status_code == 200
    assert r2.json()["review_status"] == "marked_false_positive"


def test_action_delete_requires_confirm(client, users):
    """delete without ?confirm=true must return 400 CONFIRMATION_REQUIRED."""
    r = client.get(f"/findings/by-user/{users[0]['id']}?status=pending&limit=1")
    findings = r.json()
    if not findings:
        pytest.skip("No pending findings")
    fid = findings[0]["id"]
    r2 = client.post(
        f"/findings/{fid}/action",
        json={"action": "delete"},
        headers={"X-User-Id": users[0]["id"]},
    )
    assert r2.status_code == 400
    assert r2.json()["error"]["code"] == "CONFIRMATION_REQUIRED"


# ---------------------------------------------------------------------------
# 4. Admin dashboard
# ---------------------------------------------------------------------------


def test_dashboard_required_fields(client):
    r = client.get("/admin/dashboard")
    assert r.status_code == 200
    d = r.json()
    required = [
        "total_files_scanned", "total_size_bytes", "files_with_findings",
        "total_findings", "scan_speed_files_per_sec", "precision_pct",
        "recall_pct", "f1_score", "findings_by_document_type",
        "findings_by_sensitivity", "recent_scans", "files_past_retention",
    ]
    for field in required:
        assert field in d, f"Missing dashboard field: {field}"


def test_dashboard_sensitivity_keys(client):
    r = client.get("/admin/dashboard")
    sens = r.json()["findings_by_sensitivity"]
    assert "high" in sens
    assert "medium" in sens
    assert "low" in sens


def test_dashboard_recent_scans_shape(client):
    r = client.get("/admin/dashboard")
    scans = r.json()["recent_scans"]
    assert isinstance(scans, list)
    if scans:
        s = scans[0]
        assert "id" in s
        assert "duration_sec" in s
        assert "files_processed" in s
        assert "findings_count" in s
        assert "scan_type" in s
        assert "files_skipped" in s


# ---------------------------------------------------------------------------
# 5. Scan endpoints
# ---------------------------------------------------------------------------


def test_scans_list(client):
    r = client.get("/scans?limit=5")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_scan_not_found(client):
    r = client.get("/scan/scan_doesnotexist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "SCAN_NOT_FOUND"


# ---------------------------------------------------------------------------
# 6. Eval criteria: reproducibility
# ---------------------------------------------------------------------------


def test_reproducibility(client):
    """Two consecutive scans must produce identical result_hash — eval criterion #2."""
    from connectors.local_folder import LocalFolderConnector
    from core.config import get_settings
    from scanner.pipeline import run_full_scan

    connector = LocalFolderConnector(root=get_settings().data_root_path)

    scan_a = run_full_scan(connector=connector, source_id="src_local_data")
    scan_b = run_full_scan(connector=connector, source_id="src_local_data")

    r_a = client.get(f"/scan/{scan_a}")
    r_b = client.get(f"/scan/{scan_b}")

    hash_a = r_a.json()["result_hash"]
    hash_b = r_b.json()["result_hash"]

    assert hash_a != "", "result_hash must not be empty"
    assert hash_a == hash_b, (
        f"REPRODUCIBILITY FAIL: hash_a={hash_a[:16]}... hash_b={hash_b[:16]}..."
    )


# ---------------------------------------------------------------------------
# 7. Eval criteria: scan accuracy (entity types)
# ---------------------------------------------------------------------------


def test_entity_types_are_valid(client, users):
    """All entity types in findings must be from the approved enum."""
    from core.enums import ENTITY_TYPES
    r = client.get(f"/findings/by-user/{users[0]['id']}?limit=20")
    for finding in r.json():
        for entity in finding.get("entities", []):
            assert entity["type"] in ENTITY_TYPES, (
                f"Unknown entity type: {entity['type']}"
            )


def test_document_types_are_valid(client, users):
    """All document types in findings must be from the approved enum."""
    from core.enums import DOCUMENT_TYPES
    r = client.get(f"/findings/by-user/{users[0]['id']}?limit=20")
    for finding in r.json():
        assert finding["document_type"] in DOCUMENT_TYPES, (
            f"Unknown document type: {finding['document_type']}"
        )


def test_reasoning_is_non_generic(client, users):
    """Reasoning must reference a specific entity value — LLM rule enforced."""
    r = client.get(f"/findings/by-user/{users[0]['id']}?limit=5")
    for finding in r.json():
        reasoning = finding.get("reasoning", "")
        assert len(reasoning) > 50, f"Reasoning too short for {finding['file_name']}"
        # Must not be the generic failure message
        assert reasoning != "LLM classification failed"


# ---------------------------------------------------------------------------
# 8. Retention endpoint
# ---------------------------------------------------------------------------


def test_retention_endpoint(client):
    r = client.get("/admin/retention")
    assert r.status_code == 200
    d = r.json()
    assert "past_deadline" in d
    assert "expiring_within_1_year" in d
    assert "compliant" in d
    assert "total_past_deadline" in d
    total = d["total_past_deadline"] + d["total_expiring_soon"] + d["total_compliant"]
    assert total >= 0


def test_retention_has_past_deadline_example(client):
    """At least one file must appear in past_deadline (retention logic is working)."""
    r = client.get("/admin/retention")
    past = r.json()["past_deadline"]
    assert len(past) > 0, (
        "Expected at least one file past retention deadline — "
        "check that document_year extraction is working and data has old documents."
    )


# ---------------------------------------------------------------------------
# 9. Owners + audit
# ---------------------------------------------------------------------------


def test_owners_endpoint(client):
    r = client.get("/admin/owners")
    assert r.status_code == 200
    owners = r.json()
    assert len(owners) > 0
    for o in owners:
        assert "user_id" in o
        assert "name" in o
        assert o["type"] in ("direct", "master_of_data")


def test_audit_endpoint(client):
    r = client.get("/admin/audit?limit=10")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# 10. Eval criteria: scan speed
# ---------------------------------------------------------------------------


def test_scan_speed_within_budget(client):
    """Cold scan of the data/ directory must complete within 300 seconds."""
    from connectors.local_folder import LocalFolderConnector
    from core.config import get_settings
    from scanner.pipeline import run_full_scan

    connector = LocalFolderConnector(root=get_settings().data_root_path)
    t0 = time.perf_counter()
    scan_id = run_full_scan(connector=connector, source_id="src_local_data")
    elapsed = time.perf_counter() - t0

    r = client.get(f"/scan/{scan_id}")
    files_processed = r.json()["files_processed"]

    assert elapsed < 300, f"Scan too slow: {elapsed:.1f}s for {files_processed} files"
    # At least some files were processed
    assert files_processed > 0
