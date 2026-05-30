"""First-run seed: 8 users + Master-of-Data routing + sample PDFs + initial scan.

Behaviour:
1. If `users` table is empty, insert the 8 fixed users from CONTRACT.md §10.1.
2. Load `master_of_data.yaml` and write the 4 MoD entries + their source paths.
3. Copy sample PDFs into ./data/ across three locations so the demo shows both
   direct-owner and Master-of-Data routing. We try to fetch from
   https://github.com/a-klumpp/GDPR-data-samples; if offline we synthesize tiny
   placeholder PDFs so the pipeline still has something to scan.
4. Trigger one synchronous full scan so the API has real findings on first request.
"""

from __future__ import annotations

import logging
import shutil
import urllib.error
import urllib.request
from pathlib import Path

import yaml
from sqlalchemy import select

from core.config import get_settings
from db.models import MasterOfData, MasterOfDataSource, Source, User
from db.session import SessionLocal

logger = logging.getLogger(__name__)

SEED_USERS = [
    {"id": "u_001", "name": "Sara Hoffmann",   "email": "sara.hoffmann@bosch.example",   "department": "Project Management",  "role": "employee", "is_master_of_data": False},
    {"id": "u_002", "name": "David Schmid",    "email": "david.schmid@bosch.example",    "department": "Engineering",          "role": "employee", "is_master_of_data": False},
    {"id": "u_003", "name": "Elena Fischer",   "email": "elena.fischer@bosch.example",   "department": "Digital Operations",   "role": "employee", "is_master_of_data": False},
    {"id": "u_004", "name": "Nina Beck",       "email": "nina.beck@bosch.example",       "department": "People & Culture",     "role": "employee", "is_master_of_data": False},
    {"id": "u_005", "name": "Jonas Keller",    "email": "jonas.keller@bosch.example",    "department": "IT Governance",        "role": "admin",    "is_master_of_data": False},
    {"id": "u_006", "name": "Markus Weber",    "email": "markus.weber@bosch.example",    "department": "HR",                   "role": "admin",    "is_master_of_data": True},
    {"id": "u_007", "name": "Anna Schmidt",    "email": "anna.schmidt@bosch.example",    "department": "Finance",              "role": "admin",    "is_master_of_data": True},
    {"id": "u_008", "name": "Tobias Becker",   "email": "tobias.becker@bosch.example",   "department": "IT",                   "role": "admin",    "is_master_of_data": True},
]

# Sample PDFs: filename -> destination subdirectory under DATA_ROOT.
# Spread across 3 locations to exercise both direct-owner and Master-of-Data routing.
SAMPLE_PDF_LAYOUT = [
    # Sara Hoffmann (direct owner)
    ("Expense_Report_Template.pdf",          "onedrive/sara.hoffmann"),
    ("Expense_Report_Example_A.pdf",         "onedrive/sara.hoffmann"),
    ("Expense_Report_Example_B.pdf",         "onedrive/sara.hoffmann"),
    ("Training_Evaluation_Template.pdf",     "onedrive/sara.hoffmann"),
    ("Training_Evaluation_Example_A.pdf",    "onedrive/sara.hoffmann"),
    # David Schmid (direct owner)
    ("IT_Access_Request_Template.pdf",       "onedrive/david.schmid"),
    ("IT_Access_Request_Example_A.pdf",      "onedrive/david.schmid"),
    ("IT_Access_Request_Example_B.pdf",      "onedrive/david.schmid"),
    ("Incident_Report_Template.pdf",         "onedrive/david.schmid"),
    ("Incident_Report_Example_A.pdf",        "onedrive/david.schmid"),
    # HR shared (Master of Data routing)
    ("Incident_Report_Example_B.pdf",        "shared/HR"),
    ("Supplier_Onboarding_Template.pdf",     "shared/HR"),
    ("Supplier_Onboarding_Example_A.pdf",    "shared/HR"),
    ("Supplier_Onboarding_Example_B.pdf",    "shared/HR"),
    ("Training_Evaluation_Example_B.pdf",    "shared/HR"),
]

# Best-effort upstream. If the network is unavailable, we fall back to placeholder PDFs.
GH_RAW_BASE = "https://raw.githubusercontent.com/a-klumpp/GDPR-data-samples/main"


def _placeholder_pdf_bytes(filename: str) -> bytes:
    """Minimal valid PDF that pdfplumber can parse, with synthetic content keyed
    on the filename so the stub classifier and ground truth still have something
    sensible to match."""
    # Synthesize realistic-looking text per document type so the LLM stub and
    # Presidio recognizers fire even without the real samples.
    name_l = filename.lower()
    if "expense" in name_l:
        body = (
            "Expense Report\n"
            "Employee: Sara Hoffmann (E-20491)\n"
            "Department: Project Management\n"
            "Date: 10 May 2026\n"
            "Category: Travel\n"
            "Amount: 128.40 EUR\n"
            "Description: Client meeting in Stuttgart.\n"
            "Manager: Philipp Neumann\n"
            "Decision: Approved\n"
        )
    elif "it_access" in name_l or "access_request" in name_l:
        body = (
            "IT Access Request\n"
            "Name: David Schmid\n"
            "Department: Engineering\n"
            "Manager: Petra Lang\n"
            "System: Document Management Portal\n"
            "Access Level: Read/Write\n"
            "Justification: Required for project delivery.\n"
            "Reviewer: Jonas Keller (IT Governance Lead)\n"
            "Approval: Granted\n"
            "Approver: Tobias Becker\n"
            "Date: 12 May 2026\n"
        )
    elif "incident" in name_l:
        body = (
            "Incident Report\n"
            "Date: 15 May 2026\n"
            "Location: Office Floor 3\n"
            "Type: Data Disclosure\n"
            "Description: An email containing customer data was sent to an external "
            "address by Elena Fischer.\n"
            "Root Cause: Misconfigured DLP rule.\n"
            "Corrective Action: Update DLP rules.\n"
            "Owner: Tobias Becker\n"
            "Deadline: 30 May 2026\n"
        )
    elif "supplier" in name_l:
        body = (
            "Supplier Onboarding\n"
            "Company: Nordic Components GmbH\n"
            "Address: Hauptstr. 12, 70173 Stuttgart\n"
            "Contact email: procurement@nordic-components.example\n"
            "Tax ID: DE123456789\n"
            "Certification: ISO 9001\n"
            "Risk Level: Medium\n"
            "Reviewer: Anna Schmidt\n"
            "Approval: Approved\n"
        )
    elif "training" in name_l:
        body = (
            "Training Evaluation\n"
            "Participant: Sara Hoffmann\n"
            "Course: Data Protection Fundamentals\n"
            "Date: 14 May 2026\n"
            "Ratings: 4/5\n"
            "Comments: Useful refresher on GDPR.\n"
            "Recommendation: Recommend to colleagues.\n"
        )
    else:
        body = "Document\nName: Unknown\nDate: 2026-05-30\n"

    # Build a minimal single-page PDF by hand. pdfplumber can extract text from
    # a properly structured stream; if that fails, the pipeline still receives
    # the body via a fallback path in the extractor.
    text_lines = body.split("\n")
    pdf_text_ops = "\n".join(
        [
            "BT",
            "/F1 11 Tf",
            "50 760 Td",
            "14 TL",
            *[f"({line.replace('(', '').replace(')', '')}) Tj T*" for line in text_lines],
            "ET",
        ]
    )
    stream = pdf_text_ops.encode("latin-1", errors="replace")

    # Assemble a tiny PDF. Cross-reference offsets are computed below.
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    objects: list[bytes] = []

    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    objects.append(
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    )
    contents_obj = (
        f"4 0 obj\n<< /Length {len(stream)} >>\nstream\n".encode("latin-1")
        + stream
        + b"\nendstream\nendobj\n"
    )
    objects.append(contents_obj)
    objects.append(
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    # Stitch and compute xref.
    pdf = bytearray(header)
    offsets = [0]
    for o in objects:
        offsets.append(len(pdf))
        pdf.extend(o)

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        pdf.extend(f"{off:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )

    return bytes(pdf)


def _try_download(filename: str, dest: Path) -> bool:
    """Attempt to fetch a sample PDF from upstream. Returns True on success."""
    url = f"{GH_RAW_BASE}/{filename}"
    try:
        with urllib.request.urlopen(url, timeout=4) as resp:
            data = resp.read()
            if data and data[:4] == b"%PDF":
                dest.write_bytes(data)
                return True
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.debug("Could not download %s: %s", filename, exc)
    return False


def _seed_sample_pdfs(data_root: Path) -> None:
    for filename, subdir in SAMPLE_PDF_LAYOUT:
        target_dir = data_root / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / filename
        if target.exists() and target.stat().st_size > 0:
            continue
        if not _try_download(filename, target):
            target.write_bytes(_placeholder_pdf_bytes(filename))


def _seed_users_and_mod(yaml_path: Path) -> None:
    with SessionLocal() as s:
        if s.execute(select(User).limit(1)).first() is not None:
            return

        for u in SEED_USERS:
            s.add(User(**u))

        # Default local-folder source.
        s.add(
            Source(
                id="src_local_data",
                name="Local data folder",
                type="local_folder",
                root_path=str(get_settings().data_root_path),
            )
        )

        if yaml_path.exists():
            cfg = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
            for mod in cfg.get("masters_of_data", []):
                s.add(
                    MasterOfData(
                        id=mod["id"],
                        user_id=mod["user_id"],
                        description=mod.get("description", ""),
                    )
                )
                for src in mod.get("sources", []):
                    s.add(MasterOfDataSource(mod_id=mod["id"], source_path=src))

        s.commit()


def _trigger_initial_scan() -> None:
    """Run one full scan synchronously so the API has findings on first request."""
    try:
        from connectors.local_folder import LocalFolderConnector
        from scanner.pipeline import run_full_scan

        connector = LocalFolderConnector(root=get_settings().data_root_path)
        run_full_scan(connector=connector, source_id="src_local_data")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Initial scan failed (non-fatal at boot): %s", exc)


def seed_if_empty() -> None:
    settings = get_settings()
    data_root = settings.data_root_path
    data_root.mkdir(parents=True, exist_ok=True)

    yaml_path = Path(settings.master_of_data_config).resolve()

    with SessionLocal() as s:
        already_seeded = s.execute(select(User).limit(1)).first() is not None

    if already_seeded:
        return

    _seed_users_and_mod(yaml_path)
    _seed_sample_pdfs(data_root)
    _trigger_initial_scan()
