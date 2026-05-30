# CONTRACT.md — GDPR Sentinel

> The single source of truth for the data shapes that flow between the scan engine, the database, the REST API, and both frontends. **Read this before writing any code.** If you change a field name here, ping the team. If you change a field name *without* updating this file, you will break someone else's work at hour 18.

## 1. Project context

- **Challenge:** TechOn 2026 Challenge 03 — GDPR Data Discovery (Bosch)
- **Goal:** AI-assisted prototype that identifies, classifies, and routes GDPR-relevant data across corporate sources, with human-in-the-loop review.
- **Sample data:** https://github.com/a-klumpp/GDPR-data-samples — 15 PDFs across 5 document types (template + Example A + Example B for each).
- **Evaluation criteria** (verbatim from the brief): scan accuracy, reproducibility, scan speed, resource intensity.

## 2. The 5 document types

Derived directly from the GitHub samples. The `document_type` enum is fixed at these five values plus `unknown`.

| `document_type` | Page 1 fields | Page 2 (Review) fields | Primary PII present |
|---|---|---|---|
| `expense_report` | Employee (Name + ID), Department, Date, Category, Amount, Description | Manager, Decision, Date | Person names, employee ID, department, financial amount |
| `it_access_request` | Name, Department, Manager, System, Access Level, Justification | Reviewer, Comments, Approval, Approver, Signature, Date | Person names (≥3), department, job role, system identifier |
| `incident_report` | Date, Location, Type, Description | Root Cause, Corrective Action, Owner, Deadline | Location, date, free-text PII inside descriptions |
| `supplier_onboarding` | Company, Address, Contact email, Tax ID, Certification, Risk Level | Reviewer, Comments, Approval, Notes | Company name, postal address, contact email, German VAT ID |
| `training_evaluation` | Participant, Course, Date, Ratings | Comments, Recommendation | Person name, free-text comments |

**Edge case:** `supplier_onboarding` is mostly B2B data, but address + contact email may still be personal data under GDPR Art. 4(1) if the contact is a named individual. Treat as `medium` sensitivity by default, escalate to `high` if a personal name appears in the contact field.

## 3. Entity types (the `entities` array)

These are the PII types your Presidio recognizers and LLM should emit. **Use exactly these strings** — the frontend renders badges keyed on them.

| `type` | Example value from samples | Detection method |
|---|---|---|
| `PERSON_NAME` | `Sara Hoffmann`, `Jonas Keller` | Presidio NER (German + English models) |
| `EMPLOYEE_ID` | `E-20491`, `E-31705` | Custom regex: `^E-\d{5}$` |
| `DEPARTMENT` | `Project Management`, `Digital Operations` | LLM extraction (no reliable regex) |
| `JOB_TITLE` | `IT Governance Lead`, `Team Lead` | LLM extraction |
| `EMAIL_ADDRESS` | `procurement@nordic-components.example` | Presidio built-in |
| `PHONE_NUMBER` | — | Presidio built-in (DE + intl) |
| `POSTAL_ADDRESS` | `Hauptstr. 12, 70173 Stuttgart` | LLM extraction + DE postal-code regex |
| `POSTAL_CODE` | `70173` | Regex: `\b\d{5}\b` (DE format) |
| `ORGANIZATION_NAME` | `Nordic Components GmbH` | Presidio NER + LLM |
| `GERMAN_VAT_ID` | `DE123456789` | Regex: `\bDE\d{9}\b` |
| `IBAN` | (not in samples — add to custom test files) | Presidio built-in |
| `DATE` | `10 May 2026`, `19 May 2026` | Presidio built-in |
| `FINANCIAL_AMOUNT` | `128.40 EUR`, `24.90 EUR` | Regex: `\b\d+[.,]\d{2}\s*EUR\b` |
| `LOCATION` | `Office Floor 3` | Presidio NER |
| `SYSTEM_IDENTIFIER` | `Document Management Portal` | LLM extraction |

If a recognizer fires that doesn't match this list, label it `OTHER` and include the original Presidio entity type inside the `context` field.

## 4. Core data models

All field names are `snake_case`. All timestamps are ISO 8601 UTC with `Z` suffix. All IDs are strings, never integers.

### 4.1 `Finding` — the central object

This is what the scanner produces and what `/findings/*` endpoints return. Frontend renders one row per Finding in the user view.

```json
{
  "id": "f_001",
  "scan_id": "scan_2026053014",
  "file_id": "file_001",
  "file_name": "Expense_Report_Example_A.pdf",
  "file_path": "/data/onedrive/sara.hoffmann/Expense_Report_Example_A.pdf",
  "file_size_bytes": 2470,
  "file_sha256": "a3f5e8...",
  "document_type": "expense_report",
  "sensitivity_level": "high",
  "entities": [
    {
      "type": "PERSON_NAME",
      "value": "Sara Hoffmann",
      "context": "Employee field, page 1",
      "detector": "presidio",
      "confidence": 0.92
    },
    {
      "type": "EMPLOYEE_ID",
      "value": "E-20491",
      "context": "Employee field, page 1",
      "detector": "regex",
      "confidence": 1.0
    },
    {
      "type": "PERSON_NAME",
      "value": "Philipp Neumann",
      "context": "Manager field, page 2",
      "detector": "presidio",
      "confidence": 0.89
    },
    {
      "type": "FINANCIAL_AMOUNT",
      "value": "128.40 EUR",
      "context": "Amount field, page 1",
      "detector": "regex",
      "confidence": 1.0
    }
  ],
  "reasoning": "Expense reimbursement record containing full name and employee ID of Sara Hoffmann (E-20491), department assignment, and manager identification. Personal data processed under GDPR Art. 6(1)(b) — contract necessity. Fiscal retention obligation (§147 AO, DE) of 10 years overrides immediate erasure rights.",
  "retention_recommendation": "Retain 10 years from end of fiscal year for §147 AO compliance, then delete.",
  "owner_user_id": "u_001",
  "owner_name": "Sara Hoffmann",
  "owner_type": "direct",
  "master_of_data_id": null,
  "scan_timestamp": "2026-05-30T14:23:11Z",
  "review_status": "pending",
  "reviewed_by_user_id": null,
  "reviewed_at": null,
  "review_note": null
}
```

**Field rules:**
- `owner_type`: `"direct"` (owner_user_id is populated) or `"master_of_data"` (master_of_data_id is populated). Exactly one of the two ID fields must be non-null.
- `review_status`: `"pending"` until the user clicks an action button. Then `"confirmed_business_need"` or `"acknowledged_cleanup"`.
- `reasoning` is **mandatory** and must be 2–4 sentences. This is what the user sees in the review sheet — it carries the entire "Focus 02: Classify with context" demo.
- `entities` is never empty for a flagged finding. If there are no entities, the file isn't flagged and no Finding is created.
- `confidence` is 0.0–1.0. Regex matches are always 1.0. Presidio reports its own score. LLM-extracted entities default to 0.85 unless the LLM is asked to self-rate.

### 4.2 `File`

```json
{
  "id": "file_001",
  "name": "Expense_Report_Example_A.pdf",
  "path": "/data/onedrive/sara.hoffmann/Expense_Report_Example_A.pdf",
  "size_bytes": 2470,
  "sha256": "a3f5e8...",
  "mime_type": "application/pdf",
  "source_id": "src_onedrive_sara",
  "owner_user_id": "u_001",
  "last_modified": "2026-05-27T09:11:00Z",
  "last_scanned_at": "2026-05-30T14:23:11Z",
  "has_findings": true
}
```

### 4.3 `User`

```json
{
  "id": "u_001",
  "name": "Sara Hoffmann",
  "email": "sara.hoffmann@bosch.example",
  "department": "Project Management",
  "role": "employee",
  "is_master_of_data": false
}
```

`role`: `"employee" | "admin"`. Admins see the dashboard; employees see only their own findings.

### 4.4 `MasterOfData`

```json
{
  "id": "mod_hr_shared",
  "user_id": "u_006",
  "user_name": "Markus Weber",
  "assigned_sources": [
    "/data/shared/HR/",
    "/data/shared/HR/onboarding/"
  ],
  "description": "Master of Data for HR shared drives"
}
```

### 4.5 `Scan`

```json
{
  "id": "scan_2026053014",
  "source_id": "src_onedrive_all",
  "scan_type": "full",
  "started_at": "2026-05-30T14:22:48Z",
  "completed_at": "2026-05-30T14:23:11Z",
  "duration_sec": 23.4,
  "files_processed": 15,
  "files_skipped": 0,
  "files_with_findings": 12,
  "total_findings": 47,
  "result_hash": "b91e4c..."
}
```

`scan_type`: `"full" | "delta"`. `result_hash` = SHA256 of the canonicalized sorted findings JSON — **two scans of the same input must produce the same hash**. This is your reproducibility proof.

### 4.6 `DashboardStats`

What `/admin/dashboard` returns. Frontend (Admin Dashboard) renders this directly.

```json
{
  "total_files_scanned": 15,
  "total_size_bytes": 37650,
  "files_with_findings": 12,
  "total_findings": 47,
  "scan_speed_files_per_sec": 0.64,
  "avg_file_scan_ms": 1560,
  "precision_pct": 94.2,
  "recall_pct": 87.0,
  "f1_score": 0.91,
  "last_scan_at": "2026-05-30T14:23:11Z",
  "last_scan_duration_sec": 23.4,
  "findings_by_document_type": {
    "expense_report": 12,
    "it_access_request": 9,
    "incident_report": 7,
    "supplier_onboarding": 11,
    "training_evaluation": 8,
    "unknown": 0
  },
  "findings_by_sensitivity": {
    "high": 28,
    "medium": 15,
    "low": 4
  },
  "recent_scans": [
    {"id": "scan_2026053014", "completed_at": "2026-05-30T14:23:11Z", "duration_sec": 23.4, "files_processed": 15, "findings_count": 47}
  ]
}
```

### 4.7 `OwnerSummary`

What `/admin/owners` returns — one entry per row of the dashboard's owners table.

```json
{
  "user_id": "u_001",
  "name": "Sara Hoffmann",
  "type": "direct",
  "assigned_sources": ["/data/onedrive/sara.hoffmann/"],
  "files_assigned": 3,
  "pending_reviews": 2,
  "completed_reviews": 1
}
```

`type`: `"direct" | "master_of_data"`.

## 5. API endpoints

Base URL during dev: `http://localhost:8000`. All responses are JSON. All errors follow §9. CORS allows `http://localhost:3000`.

| Method | Path | Purpose | Request body | Response |
|---|---|---|---|---|
| GET | `/health` | Liveness | — | `{"status": "ok"}` |
| GET | `/users` | List of selectable users for the auth switcher | — | `User[]` |
| POST | `/scan/run` | Trigger full scan | `{"source_path": "/data/..."}` | `{"scan_id": "...", "status": "running"}` |
| POST | `/scan/delta` | Trigger delta scan | `{"source_path": "/data/..."}` | `{"scan_id": "...", "status": "running", "files_to_process": 3}` |
| GET | `/scan/{scan_id}` | Scan status + summary | — | `Scan` |
| GET | `/scans` | Recent scans (default last 10) | — | `Scan[]` |
| GET | `/findings/by-user/{user_id}` | All findings owned by user | query: `?status=pending` (optional) | `Finding[]` |
| GET | `/findings/{finding_id}` | Single finding detail | — | `Finding` |
| POST | `/findings/{finding_id}/action` | Record user decision | `{"action": "confirm_business_need" \| "acknowledge_cleanup", "note": "..."}` | `Finding` (updated) |
| GET | `/admin/dashboard` | All KPIs | — | `DashboardStats` |
| GET | `/admin/owners` | Owner table | — | `OwnerSummary[]` |
| GET | `/files/{file_id}/preview` | Raw PDF bytes for in-app preview | — | `application/pdf` stream |

**Implementation notes for Tech 2:**
- `POST /scan/run` should return immediately (background task), not block 23 seconds. Use FastAPI `BackgroundTasks` or a thread.
- `POST /findings/{id}/action` writes `reviewed_by_user_id` from a header `X-User-Id` (mocked auth — frontend sends the selected user's ID).
- `/files/{file_id}/preview` is what powers the PDF viewer inside the user-view review sheet. If you skip this, the sheet shows reasoning only.

## 6. Enums (single source of truth)

```python
DOCUMENT_TYPES = ["expense_report", "it_access_request", "incident_report",
                  "supplier_onboarding", "training_evaluation", "unknown"]

SENSITIVITY_LEVELS = ["high", "medium", "low"]

REVIEW_STATUSES = ["pending", "confirmed_business_need", "acknowledged_cleanup"]

OWNER_TYPES = ["direct", "master_of_data"]

SCAN_TYPES = ["full", "delta"]

SCAN_STATUSES = ["running", "completed", "failed"]

ENTITY_TYPES = ["PERSON_NAME", "EMPLOYEE_ID", "DEPARTMENT", "JOB_TITLE",
                "EMAIL_ADDRESS", "PHONE_NUMBER", "POSTAL_ADDRESS", "POSTAL_CODE",
                "ORGANIZATION_NAME", "GERMAN_VAT_ID", "IBAN", "DATE",
                "FINANCIAL_AMOUNT", "LOCATION", "SYSTEM_IDENTIFIER", "OTHER"]
```

## 7. Delta-scan contract (Priority 1 + reproducibility)

The scan logic must satisfy these invariants. They're enforced by the eval harness.

1. **Hash-based change detection.** For each file, store `sha256(file_bytes)` and `last_scanned_at` in the `files` table. On `/scan/delta`, only process files where `current_sha256 != stored_sha256` OR the file is new (not in the table).
2. **Idempotency.** Running `/scan/run` twice on the same unchanged source produces the same `result_hash`. The eval harness asserts this.
3. **Deterministic ordering.** Findings are sorted by `(file_path, page_number, entity_offset)` before hashing.
4. **LLM determinism.** All LLM calls use `temperature=0` and a fixed `seed` if supported. Same prompt + same input → same output.
5. **Skip unchanged files cheaply.** Delta scan must not re-extract text or call the LLM for unchanged files. The `files_skipped` counter in the Scan object proves this on the dashboard.

## 8. Master of Data routing rules

When the scanner finds a sensitive file, attribution follows this order:

1. **If the file path matches a known direct-owner source** (e.g. `/data/onedrive/{username}/...`), set `owner_user_id` and `owner_type="direct"`, leave `master_of_data_id` null.
2. **Else if the file path is under any `assigned_sources` of a `MasterOfData` entry**, set `master_of_data_id` and `owner_type="master_of_data"`, leave `owner_user_id` null.
3. **Else** (orphan file), set `owner_type="master_of_data"` and `master_of_data_id` to the catch-all MoD (`mod_default`).

Routing config lives in `master_of_data.yaml`:

```yaml
direct_owner_patterns:
  - pattern: "/data/onedrive/sara.hoffmann/"
    user_id: u_001
  - pattern: "/data/onedrive/david.schmid/"
    user_id: u_002
  # ... one per user

masters_of_data:
  - id: mod_hr_shared
    user_id: u_006
    sources: ["/data/shared/HR/"]
  - id: mod_finance_shared
    user_id: u_007
    sources: ["/data/shared/Finance/"]
  - id: mod_it_shared
    user_id: u_008
    sources: ["/data/shared/IT/"]
  - id: mod_default
    user_id: u_006
    sources: ["**"]   # catch-all, last resort
```

## 9. Error response shape

All non-2xx responses:

```json
{
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "No file with id 'file_999' exists",
    "details": {"file_id": "file_999"}
  }
}
```

Standard codes: `FILE_NOT_FOUND`, `SCAN_NOT_FOUND`, `FINDING_NOT_FOUND`, `USER_NOT_FOUND`, `INVALID_ACTION`, `SCAN_IN_PROGRESS`, `LLM_ERROR`, `INTERNAL_ERROR`.

## 10. Mock fixtures (so frontend can build without backend)

Both frontends import this from `/frontend/lib/mock-data.ts` until hour ~20, then swap to real `fetch()`.

### 10.1 Users (5 selectable + 3 MoD)

```json
[
  {"id": "u_001", "name": "Sara Hoffmann",   "email": "sara.hoffmann@bosch.example",   "department": "Project Management",  "role": "employee", "is_master_of_data": false},
  {"id": "u_002", "name": "David Schmid",    "email": "david.schmid@bosch.example",    "department": "Engineering",          "role": "employee", "is_master_of_data": false},
  {"id": "u_003", "name": "Elena Fischer",   "email": "elena.fischer@bosch.example",   "department": "Digital Operations",   "role": "employee", "is_master_of_data": false},
  {"id": "u_004", "name": "Nina Beck",       "email": "nina.beck@bosch.example",       "department": "People & Culture",     "role": "employee", "is_master_of_data": false},
  {"id": "u_005", "name": "Jonas Keller",    "email": "jonas.keller@bosch.example",    "department": "IT Governance",        "role": "admin",    "is_master_of_data": false},
  {"id": "u_006", "name": "Markus Weber",    "email": "markus.weber@bosch.example",    "department": "HR",                   "role": "admin",    "is_master_of_data": true},
  {"id": "u_007", "name": "Anna Schmidt",    "email": "anna.schmidt@bosch.example",    "department": "Finance",              "role": "admin",    "is_master_of_data": true},
  {"id": "u_008", "name": "Tobias Becker",   "email": "tobias.becker@bosch.example",   "department": "IT",                   "role": "admin",    "is_master_of_data": true}
]
```

### 10.2 Sample findings for the user view

Three findings owned by Sara Hoffmann (u_001), so the default user view never looks empty:

```json
[
  {
    "id": "f_001",
    "file_name": "Expense_Report_Example_A.pdf",
    "document_type": "expense_report",
    "sensitivity_level": "high",
    "entities": [
      {"type": "PERSON_NAME", "value": "Sara Hoffmann", "context": "Employee", "detector": "presidio", "confidence": 0.92},
      {"type": "EMPLOYEE_ID", "value": "E-20491", "context": "Employee ID", "detector": "regex", "confidence": 1.0},
      {"type": "PERSON_NAME", "value": "Philipp Neumann", "context": "Manager", "detector": "presidio", "confidence": 0.89},
      {"type": "FINANCIAL_AMOUNT", "value": "128.40 EUR", "context": "Amount", "detector": "regex", "confidence": 1.0}
    ],
    "reasoning": "Expense reimbursement containing your full name, employee ID, and manager information. Personal data processed under GDPR Art. 6(1)(b). Fiscal retention obligation (§147 AO) of 10 years applies.",
    "retention_recommendation": "Retain 10 years from end of fiscal year, then delete.",
    "owner_user_id": "u_001",
    "owner_name": "Sara Hoffmann",
    "owner_type": "direct",
    "master_of_data_id": null,
    "scan_timestamp": "2026-05-30T14:23:11Z",
    "review_status": "pending"
  },
  {
    "id": "f_002",
    "file_name": "Travel_Itinerary_Q2.pdf",
    "document_type": "expense_report",
    "sensitivity_level": "medium",
    "entities": [
      {"type": "PERSON_NAME", "value": "Sara Hoffmann", "context": "Traveler", "detector": "presidio", "confidence": 0.91},
      {"type": "POSTAL_ADDRESS", "value": "Hauptstr. 12, 70173 Stuttgart", "context": "Hotel address", "detector": "llm", "confidence": 0.85},
      {"type": "DATE", "value": "10 May 2026", "context": "Travel date", "detector": "presidio", "confidence": 0.99}
    ],
    "reasoning": "Travel record containing your name and accommodation details. Travel history is sensitive under GDPR Recital 75 (movement profiling risk). Review whether record is still operationally needed.",
    "retention_recommendation": "Retain 3 years for tax substantiation, then delete unless still operationally needed.",
    "owner_user_id": "u_001",
    "owner_name": "Sara Hoffmann",
    "owner_type": "direct",
    "master_of_data_id": null,
    "scan_timestamp": "2026-05-30T14:23:11Z",
    "review_status": "pending"
  },
  {
    "id": "f_003",
    "file_name": "Training_Evaluation_DataProtection.pdf",
    "document_type": "training_evaluation",
    "sensitivity_level": "low",
    "entities": [
      {"type": "PERSON_NAME", "value": "Sara Hoffmann", "context": "Participant", "detector": "presidio", "confidence": 0.93},
      {"type": "DATE", "value": "14 May 2026", "context": "Course date", "detector": "presidio", "confidence": 0.99}
    ],
    "reasoning": "Training feedback record with your name and course attendance. Personal data under GDPR Art. 6(1)(f) — legitimate interest in training records. Retention beyond 2 years is generally not justified.",
    "retention_recommendation": "Retain 2 years for HR records, then delete.",
    "owner_user_id": "u_001",
    "owner_name": "Sara Hoffmann",
    "owner_type": "direct",
    "master_of_data_id": null,
    "scan_timestamp": "2026-05-30T14:23:11Z",
    "review_status": "pending"
  }
]
```

### 10.3 Dashboard stats (matches §4.6 above)

Use the example block in §4.6 verbatim as the mock for the admin dashboard.

## 11. Naming conventions

- **Backend (Python):** `snake_case` for everything. Pydantic models use `Field(alias=...)` only if absolutely needed.
- **Frontend (TypeScript):** also `snake_case` for fields that come from the API. **Do not camelCase API fields** — the cost of translation layers in a 48-hour hackathon is not worth the aesthetic win.
- **TypeScript types:** generate them once from the Pydantic models using `datamodel-code-generator` and check into `/frontend/types/api.ts`. If you change a backend model, regenerate.
- **File IDs:** `file_001`, `f_001` (finding), `u_001` (user), `scan_YYYYMMDDHH`, `mod_<slug>` (master of data). Stable, sortable, debuggable.

## 12. What's intentionally out of scope

- Real Microsoft Graph authentication (Tech 2 ships `graph_stub.py` with method signatures only).
- Multi-tenant support — single workspace.
- Encryption at rest — SQLite file on local disk only.
- Pagination on `/findings/by-user/{id}` — return everything, max 100 per user in practice.
- Full PDF in-browser viewer with annotations — `/files/{id}/preview` streams the raw PDF and the frontend uses `<embed>`.
- Localization — UI is English-only. Sample data is German because Bosch is German.

---

**If you change this file, announce it in chat and bump the date below.**
Last updated: 2026-05-30 (initial draft, pre-kickoff).
