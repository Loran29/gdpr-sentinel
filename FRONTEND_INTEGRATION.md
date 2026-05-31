# GDPR Sentinel — Frontend Integration Guide

**Backend URL:** `http://localhost:8000`  
**CORS:** allowed from `http://localhost:3000`  
**Auth:** mock only — send `X-User-Id: u_001` header on every mutating request  
**All responses:** JSON. All errors follow the error envelope (§ Error Handling below).

---

## Two personas

| Persona | Who | What they see |
|---|---|---|
| **Employee** | u_001–u_004 (`role: "employee"`) | Only their own flagged files + review actions |
| **Admin** | u_005–u_008 (`role: "admin"`) | Full dashboard, all owners, all scans, retention view |

On login (user picker), call `GET /users` to populate the dropdown. Store the selected user's `id` and `role`. Use `role` to decide which view to render.

---

## Employee View

Employee logs in → sees only files they own that have been flagged.

### 1. Load findings for the logged-in user
```
GET /findings/by-user/{user_id}
X-User-Id: u_001
```
Returns `Finding[]`. Each finding is one flagged file with entities and GDPR reasoning. Returns all findings for the user (max 100) — pagination is intentionally out of scope.

**Optional filters:**
- `?status=pending` — only unreviewed

### 2. Open a single finding
```
GET /findings/{finding_id}
```
Returns full `Finding` object including `entities[]`, `reasoning`, `retention_recommendation`.

### 3. Preview the PDF
```
GET /files/{file_id}/preview
```
Returns raw `application/pdf` bytes. Use inside `<embed src="..." type="application/pdf">`.

### 4. Re-scan a file
```
POST /files/{file_id}/rescan
```
Forces an immediate re-scan of a single file, bypassing the delta-scan cache. Use this if the LLM classification looks wrong and the reviewer wants a fresh result.

Returns:
```json
{ "file_id": "file_001", "rescanned": true, "has_findings": true }
```

Show a "Re-scan" button on the finding detail panel. Refresh the finding after it returns.

### 5. Get a human-readable summary
```
GET /files/{file_id}/summary
```
Returns a plain-English paragraph describing what was found. Good for the review sheet header.

### 6. Take action on a finding (the core user action)
```
POST /findings/{finding_id}/action
X-User-Id: u_001
Content-Type: application/json

{ "action": "keep_business_need", "note": "Required for ongoing project X" }
```

**Three actions:**
| `action` | Meaning | Extra |
|---|---|---|
| `keep_business_need` | User confirms they need this file | Optional `note` |
| `mark_false_positive` | Not actually personal data | Optional `note` |
| `delete` | Delete the file from disk | Add `?confirm=true` to URL |

Delete example:
```
POST /findings/{finding_id}/action?confirm=true
{ "action": "delete" }
```

Returns updated `Finding` on success. The row should disappear from the list.

### 7. Bulk action (optional, for "select all + mark false positive")
```
POST /findings/batch-action
X-User-Id: u_001
Content-Type: application/json

{
  "finding_ids": ["f_abc123", "f_def456"],
  "action": "mark_false_positive",
  "note": "All from test folder"
}
```

---

## Admin View

### Dashboard KPIs
```
GET /admin/dashboard
```
Returns:
```json
{
  "total_files_scanned": 27,
  "total_size_bytes": 94210,
  "files_with_findings": 25,
  "total_findings": 25,
  "scan_speed_files_per_sec": 0.59,
  "avg_file_scan_ms": 1690,
  "precision_pct": 95.2,
  "recall_pct": 97.1,
  "f1_score": 0.961,
  "last_scan_at": "2026-05-30T15:45:00Z",
  "last_scan_duration_sec": 40.9,
  "findings_by_document_type": { "expense_report": 5, "incident_report": 3, ... },
  "findings_by_sensitivity": { "high": 14, "medium": 7, "low": 4 },
  "recent_scans": [ { "id": "scan_...", "duration_sec": 40.9, "files_processed": 27, "findings_count": 25 } ],
  "last_scan_timing_breakdown": { "extract_ms": 3100, "presidio_ms": 18400, "llm_ms": 12000, "db_ms": 1400 },
  "files_past_retention": 1
}
```

### Run a new scan (with live progress)
```
POST /scan/run
Content-Type: application/json

{ "source_path": "./data" }
```
Returns immediately: `{ "scan_id": "scan_...", "status": "running" }`

**Poll for progress every 500ms:**
```
GET /scan/{scan_id}
```
While `status == "running"`, response includes:
```json
"progress": {
  "files_total": 27,
  "files_completed": 12,
  "current_file": "Expense_Report_Example_A.pdf",
  "percent": 44,
  "elapsed_sec": 18.3,
  "estimated_remaining_sec": 23.1
}
```
When `status == "completed"`, stop polling and refresh the dashboard.

### Delta scan (only re-scans changed files)
```
POST /scan/delta
Content-Type: application/json

{ "source_path": "./data" }
```
Returns `{ "scan_id": "...", "status": "running", "files_to_process": 3 }`. Poll same as above.

### Recent scans list
```
GET /scans?limit=10&offset=0
```

### Compare two scans
```
GET /scans/compare?a={older_scan_id}&b={newer_scan_id}
```
Returns which files were added, removed, changed, or unchanged between runs.

### Owners table
```
GET /admin/owners
```
Returns one row per direct owner and Master of Data, with pending/completed review counts.

### Retention view (files past GDPR deadline)
```
GET /admin/retention
```
Returns `{ past_deadline: [...], expiring_within_1_year: [...], compliant: [...] }`.  
`past_deadline` items should be highlighted in red — these are GDPR Art. 5(1)(e) violations.

### Notify owners of overdue files
```
POST /admin/retention/notify
Content-Type: application/json

{ "dry_run": true, "include_expiring_soon": false }
```

- `dry_run: true` — simulate only, nothing is sent (use this to preview the list before confirming)
- `include_expiring_soon: true` — also include files expiring within 1 year, not just already past deadline

Returns:
```json
{ "dry_run": true, "notified": [...], "total": 3 }
```

Show the `notified` list to the user before they confirm. Then re-POST with `"dry_run": false` to trigger actual notifications.

### Graph connector status
```
GET /connectors/graph/test
```
Returns the status of the Microsoft Graph integration. Always returns `"status": "stub"` in this prototype — it never connects to anything real.

```json
{
  "status": "stub",
  "message": "GraphConnector is implemented as a stub...",
  "would_connect_to": "https://graph.microsoft.com/v1.0/users/{userId}/drive/root/children",
  "required_permissions": ["Files.Read.All", "Sites.Read.All", "User.Read.All"],
  "sdk_package": "msgraph-sdk or msal + httpx"
}
```

Display in an "Infrastructure" or "Connectors" section of the Admin view.

### Audit log
```
GET /admin/audit?limit=50&offset=0
```
Every review action ever taken — who did what, when, on which file.

### Export findings
```
GET /findings/export?format=csv
GET /findings/export?format=json
```
Triggers a file download.

### Resource health
```
GET /admin/health
```
Returns live RAM, CPU count, uptime, model name, cache size.

---

## Data shapes

### `Finding` (the main object the employee sees)
```typescript
{
  id: string                    // "f_abc123"
  scan_id: string
  file_id: string
  file_name: string             // "Expense_Report_Example_A.pdf"
  file_path: string             // "/data/onedrive/sara.hoffmann/..."
  file_size_bytes: number
  file_sha256: string
  document_type: string         // see Document types below
  sensitivity_level: "high" | "medium" | "low"
  confidence: number            // 0.0–1.0, mean entity confidence
  entities: Entity[]
  reasoning: string             // 2–4 sentences with GDPR article citation
  retention_recommendation: string
  owner_user_id: string | null
  owner_name: string | null
  owner_type: "direct" | "master_of_data"
  master_of_data_id: string | null
  scan_timestamp: string        // ISO 8601
  review_status: "pending" | "deleted" | "marked_false_positive" | "kept_business_need"
  reviewed_by_user_id: string | null
  reviewed_at: string | null
  review_note: string | null
}
```

### `Entity`
```typescript
{
  type: string        // one of ENTITY_TYPES below
  value: string       // exact string from document
  context: string     // where in the document
  detector: "presidio" | "regex" | "llm"
  confidence: number
}
```

### `User`
```typescript
{
  id: string              // "u_001"
  name: string            // "Sara Hoffmann"
  email: string
  department: string
  role: "employee" | "admin"
  is_master_of_data: boolean
}
```

---

## Enums

### Document types (9)
```
expense_report, it_access_request, incident_report,
supplier_onboarding, training_evaluation,
medical_record, financial_authorization, internal_memo, unknown
```

### Sensitivity badge colors (suggestion)
| Level | Color |
|---|---|
| `high` | Red |
| `medium` | Amber / Orange |
| `low` | Green |

### Entity type badges
All caps strings: `PERSON_NAME`, `EMPLOYEE_ID`, `DEPARTMENT`, `JOB_TITLE`, `EMAIL_ADDRESS`, `PHONE_NUMBER`, `POSTAL_ADDRESS`, `POSTAL_CODE`, `ORGANIZATION_NAME`, `GERMAN_VAT_ID`, `IBAN`, `DATE`, `FINANCIAL_AMOUNT`, `LOCATION`, `SYSTEM_IDENTIFIER`, `OTHER`

### Review status display
| Status | Display |
|---|---|
| `pending` | Gray — "Pending review" |
| `kept_business_need` | Green — "Kept: business need" |
| `marked_false_positive` | Amber — "False positive" |
| `deleted` | Red strikethrough — "Deleted" |

---

## Error handling

All errors return:
```json
{
  "error": {
    "code": "FINDING_NOT_FOUND",
    "message": "No finding with id 'f_xyz' exists",
    "details": { "finding_id": "f_xyz" }
  }
}
```

**Special case — delete without confirm:**
```json
{ "error": { "code": "CONFIRMATION_REQUIRED", ... } }
```
Show a confirm dialog, then re-POST with `?confirm=true`.

---

## Seeded users (for the user picker)

| ID | Name | Role | Notes |
|---|---|---|---|
| u_001 | Sara Hoffmann | employee | Has expense reports + training docs |
| u_002 | David Schmid | employee | Has IT access requests + incident reports |
| u_003 | Elena Fischer | employee | OneDrive owner |
| u_004 | Nina Beck | employee | OneDrive owner |
| u_005 | Jonas Keller | **admin** | IT Governance, custom test docs |
| u_006 | Markus Weber | **admin** ★ MoD | HR shared drive |
| u_007 | Anna Schmidt | **admin** ★ MoD | Finance shared drive |
| u_008 | Tobias Becker | **admin** ★ MoD | IT shared drive |

★ = Master of Data (sees findings from shared drives, not just their own OneDrive)

---

## Quick start checklist

```
1. Run backend:   uvicorn main:app --reload --port 8000
2. Serve frontend: npm run dev  (on port 3000)
3. First call:    GET /users  → populate user picker
4. Employee flow: GET /findings/by-user/u_001
5. Admin flow:    GET /admin/dashboard
6. Test scan:     POST /scan/run { "source_path": "./data" }
                  poll GET /scan/{scan_id} until completed
```

All endpoints browsable at **http://localhost:8000/docs** (grouped by tag).
