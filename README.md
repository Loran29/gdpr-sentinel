# GDPR Sentinel — Monorepo

AI-assisted GDPR data discovery prototype for the TechOn 2026 Challenge 03 (Bosch). Scans corporate document stores, classifies personal data, suggests retention, and routes findings to the right human reviewer (direct owner or Master of Data).

**Stack:** Python 3.13 + FastAPI backend · Next.js 14 + TypeScript frontend · SQLite · Presidio + Gemini 2.5 Flash via OpenRouter · Microsoft Graph OAuth (OneDrive/SharePoint)

---

## Quick start (one click)

Double-click **`start.bat`** in the repo root — opens two terminal windows and starts both servers.

| Service | URL |
|---------|-----|
| Frontend (Next.js) | **http://localhost:3000** |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

Or run manually:

**Terminal 1 — backend:**
```powershell
.venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 — frontend:**
```powershell
cd frontend
npm run dev
```

---

## Backend setup (first time only)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m spacy download en_core_web_lg
python -m spacy download de_core_news_lg
cp .env.example .env          # then set OPENROUTER_API_KEY
```

On first boot the backend auto-seeds 8 users, 27 PDFs, and runs an initial scan. If `OPENROUTER_API_KEY` is empty it falls back to a filename-based stub and still boots.

To regenerate the custom test PDFs if they are missing:

```powershell
python scripts/generate_test_pdfs.py   # 8 custom PDFs → data/custom/
python scripts/generate_extra_pdfs.py  # 4 more       → data/custom/
```

## Frontend setup (first time only)

```powershell
cd frontend
npm install
echo NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 > .env.local
```

Optional OCR for scanned PDFs (requires [Tesseract](https://github.com/tesseract-ocr/tesseract) on PATH):
```powershell
pip install pytesseract pdf2image
```

---

## Two personas

| Persona | Users | Landing page |
|---------|-------|------|
| **Employee** | u_001–u_004 | My findings — own flagged files + review actions |
| **Admin** | u_005–u_008 | Run scan — full dashboard, all findings, owners, audit log |

---

## Eval harness

```powershell
python -m eval.harness
```

Runs two full scans over 27 PDFs, computes P/R/F1 against `eval/ground_truth.csv`, asserts identical `result_hash` across runs.

**Current numbers** (google/gemini-2.5-flash, 27 PDFs, 9 document types):

| Metric | Value |
|--------|-------|
| Precision | 90.9% |
| Recall | 91.8% |
| F1 | **0.914** |
| Reproducibility | **PASS** (identical `result_hash` across runs) |
| Scan cold (parallel, LLM via API) | ~10–27s / 27 files |
| Scan cached (delta, disk cache) | ~1.5–3s / 27 files |

Detection is tuned to keep recall high — a missed PII record is a GDPR violation; an extra flag is just reviewer time.

> Reproduce: run `python -m eval.harness` from a clean checkout. The harness writes a timestamped report to `eval/results/` which the admin dashboard reads for its accuracy KPIs.

---

## API endpoints (35 total)

| Tag | Endpoints |
|-----|-----------|
| **Health** | `GET /health` · `GET /admin/health` |
| **Users** | `GET /users` |
| **Auth** | `GET /auth/microsoft` · `GET /auth/callback` · `GET /auth/status` · `POST /auth/logout` · `POST /auth/onedrive/scan` |
| **Scans** | `POST /scan/run` · `POST /scan/delta` · `GET /scan/{id}` · `GET /scans` · `GET /scans/compare` |
| **Findings** | `GET /findings/all` · `GET /findings/by-user/{id}` · `GET /findings/{id}` · `POST /findings/{id}/action` · `POST /findings/{id}/reassign` · `POST /findings/batch-action` · `GET /findings/export` |
| **Admin** | `GET /admin/dashboard` · `GET /admin/retention` · `POST /admin/retention/notify` · `GET /admin/owners` · `GET /admin/audit` · `GET /admin/scheduler` · `POST /admin/scheduler` · `GET /connectors/graph/test` |
| **Files** | `GET /files/{id}/preview` · `GET /files/{id}/summary` · `POST /files/{id}/rescan` · `POST /upload/scan` |

Full interactive docs at **http://localhost:8000/docs**.

---

## Document types (9)

`expense_report` · `it_access_request` · `incident_report` · `supplier_onboarding` · `training_evaluation` · `medical_record` · `financial_authorization` · `internal_memo` · `unknown`

---

## GDPR compliance flow

The full review lifecycle implemented:

1. **Scan** — full or delta scan detects PII across PDF and DOCX files
2. **Route** — findings assigned to direct owner (by OneDrive path) or Master of Data (shared drives)
3. **Employee review** — three structured actions:
   - **Keep: business need** — requires selecting GDPR legal basis (Art. 6(1)(b/c/f))
   - **Acknowledge cleanup** — requires setting a deadline date; escalates to `cleanup_overdue` on next scan if deadline passes and file still exists
   - **Delete** — two-step confirm; physically removes file from disk
4. **Admin oversight** — All Findings view with filters, ownership reassignment, top-pending-by-owner drill-down
5. **Audit trail** — every action logged with user, timestamp, legal basis, and deadline

---

## Microsoft OneDrive / SharePoint connector

Real OAuth2 auth-code flow implemented. Configure in `.env`:

```
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=...
```

Then in the UI: **Run scan → OneDrive connector → Sign in with Microsoft**.

---

## Scripts

```powershell
python scripts/verify_openrouter.py    # confirm LLM is live, not stub
python scripts/measure_resources.py   # peak RSS + CPU for a full scan
python scripts/generate_test_pdfs.py  # regenerate 8 custom test PDFs
python scripts/generate_extra_pdfs.py # regenerate 4 additional test PDFs
```

---

## Key design decisions

- **Reproducibility hash** — covers only deterministic (presidio/regex) entities; LLM extras excluded since OpenRouter proxies don't honour `seed`
- **Gemini 2.5 Flash** — fast multilingual LLM via OpenRouter; per-document-type extraction rules in prompt (payslips, medical records, IT access requests)
- **Quality gate** — findings only created if ≥1 deterministic entity with confidence ≥0.7; prevents near-empty findings from clean documents
- **Contextual entity filters** — FINANCIAL_AMOUNT requires co-occurring PERSON_NAME; DEPARTMENT uses blocklist; SYSTEM_IDENTIFIER requires digit/separator or known system suffix
- **DEPARTMENT false positive fix** — split blocklist: PERSON_NAME filter uses full set; DEPARTMENT filter uses smaller noise-only set so valid dept names (Engineering, Project Management) are kept
- **Surname dedup** — honorific variants ("Dr. Ingrid Haller" + "Ingrid Haller") collapsed to longest form
- **Document year extraction** — retention deadline uses earliest 4-digit year in document text, not scan date
- **Parallel scan** — `ThreadPoolExecutor(max_workers=5)`; LLM calls are I/O-bound
- **LLM disk cache** — keyed on `sha256(model + text[:8000])`; repeat scans ~5× faster
- **OCR fallback** — pdfplumber → byte-sweep → pytesseract (silent if Tesseract not installed)
- **Word (.docx) support** — python-docx extracts paragraphs + table cells; same pipeline as PDF
- **Owner routing** — direct owner (OneDrive path pattern) → Master of Data (shared drive) → catch-all
- **N+1 query fix** — `/admin/owners` and `/admin/dashboard` use bulk IN+GROUP BY queries

---

## Project layout

```
start.bat            One-click launcher (backend + frontend)
main.py              FastAPI entrypoint
requirements.txt     Python dependencies
.env.example         Environment variable template
master_of_data.yaml  Owner routing config

api/                 Routes (tagged), Pydantic schemas, error handlers
  routes.py          All HTTP routes
  auth.py            Microsoft OAuth2 (OneDrive/SharePoint)
  schemas.py         Pydantic request/response models
scanner/             PDF/DOCX extractor, Presidio NER, LLM classifier, pipeline
connectors/          Abstract Connector, local folder, Microsoft Graph (real OAuth)
  graph_connector.py Real OneDrive connector using MSAL + requests
db/                  SQLAlchemy models, session, seed (8 users + 27 PDFs)
core/                Enums, settings, canonical hashing, scheduler
eval/                CLI harness, ground_truth.csv (27 PDFs)
scripts/             Verification and generation utilities

frontend/            Next.js 14 app (TypeScript + Tailwind)
  app/               Pages:
    login/           Login page
    my-findings/     Employee review queue
    admin-dashboard/ Admin KPI dashboard
    run-scan/        Scan configuration + OneDrive connector + upload
    all-findings/    Admin view of all findings with reassignment
    data-owners/     Owner accountability table
    audit-log/       Review action history + CSV/JSON export
  components/        UI components, charts, finding detail panel
  src/lib/           API client, type definitions
  types/             Shared TypeScript models

FRONTEND_INTEGRATION.md   API handoff guide for frontend developers
frontend/CONTRACT.md      Data contract and enum definitions
```

---

## Reset database

```powershell
Remove-Item gdpr_sentinel.db -ErrorAction Ignore
# restart backend — it will re-seed automatically
```

## Requires Python 3.13

spaCy 3.8 has no prebuilt wheels for Python 3.7 — compilation blocked by corporate EDR.
