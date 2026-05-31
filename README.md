# GDPR Sentinel — Monorepo

AI-assisted GDPR data discovery prototype for the TechOn 2026 Challenge 03 (Bosch). Scans corporate document stores, classifies personal data, suggests retention, and routes findings to the right human reviewer (direct owner or Master of Data).

**Stack:** Python 3.13 + FastAPI backend · Next.js 14 + TypeScript frontend · SQLite · Presidio + Gemini 2.5 Flash via OpenRouter

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
uvicorn main:app --reload --port 8000
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

On first boot the backend auto-seeds 8 users, 15 sample PDFs (from the public
GitHub sample repo), and runs an initial scan. If `OPENROUTER_API_KEY` is empty it
falls back to a filename-based stub and still boots.

To get the **full 27-file eval corpus** (adds 12 custom German/edge-case PDFs that
`eval/ground_truth.csv` expects), also run:

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

| Persona | Users | View |
|---------|-------|------|
| **Employee** | u_001–u_004 | Own flagged files only + review actions |
| **Admin** | u_005–u_008 | Full dashboard, owners, scans, retention, audit log |

---

## Eval harness

```powershell
python -m eval.harness
```

Runs two full scans over 27 PDFs, computes P/R/F1 against `eval/ground_truth.csv`, asserts identical `result_hash` across runs.

**Current numbers** (google/gemini-2.5-flash, 27 PDFs, 9 document types):

| Metric | Value |
|--------|-------|
| Precision | 95.2% |
| Recall | 97.1% |
| F1 | **0.961** |
| Document type accuracy | **91.7%** |
| Reproducibility | **PASS** (identical `result_hash` across runs) |
| Scan cold (parallel) | ~39s / 27 files |
| Scan cached | ~1.5s / 27 files |

Detection is tuned to keep recall high — a missed PII record is a GDPR violation; an extra flag is just reviewer time.

> Reproduce these numbers from a clean checkout: generate the full 27-file corpus
> (`python scripts/generate_test_pdfs.py && python scripts/generate_extra_pdfs.py`)
> then run `python -m eval.harness`. The harness writes a timestamped report to
> `eval/results/` which the admin dashboard reads for its accuracy KPIs.

---

## API endpoints (27 total)

| Tag | Endpoints |
|-----|-----------|
| **Health** | `GET /health` · `GET /admin/health` |
| **Users** | `GET /users` |
| **Scans** | `POST /scan/run` · `POST /scan/delta` · `GET /scan/{id}` · `GET /scans` · `GET /scans/compare` |
| **Findings** | `GET /findings/by-user/{id}` · `GET /findings/{id}` · `POST /findings/{id}/action` · `POST /findings/batch-action` · `GET /findings/export` |
| **Admin** | `GET /admin/dashboard` · `GET /admin/retention` · `POST /admin/retention/notify` · `GET /admin/owners` · `GET /admin/audit` · `GET /connectors/graph/test` |
| **Files** | `GET /files/{id}/preview` · `GET /files/{id}/summary` · `POST /files/{id}/rescan` |

Full interactive docs at **http://localhost:8000/docs**.

---

## Document types (9)

`expense_report` · `it_access_request` · `incident_report` · `supplier_onboarding` · `training_evaluation` · `medical_record` · `financial_authorization` · `internal_memo` · `unknown`

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
- **Per-document language routing** — a cheap deterministic detector picks EN vs DE per file and runs the matching spaCy engine, so German documents (Krankmeldung, SEPA mandates) are analysed by `de_core_news_lg` instead of the English model (+PERSON_NAME precision)
- **Contextual entity filters** — FINANCIAL_AMOUNT requires co-occurring PERSON_NAME; DEPARTMENT same; SYSTEM_IDENTIFIER single-word alpha dropped; GERMAN_VAT_ID enforces `DE\d{9}` format
- **Surname dedup** — honorific variants ("Dr. Ingrid Haller" + "Ingrid Haller") collapsed to longest form
- **Document year extraction** — retention deadline uses earliest 4-digit year in document text, not scan date
- **Parallel scan** — `ThreadPoolExecutor(max_workers=5)`; LLM calls are I/O-bound
- **LLM disk cache** — keyed on `sha256(model + text[:8000])`; repeat scans ~26× faster (39s → 1.5s on 27 files)
- **OCR fallback** — pdfplumber → byte-sweep → pytesseract (silent if Tesseract not installed)
- **Owner routing** — direct owner (OneDrive path pattern) → Master of Data (shared drive) → catch-all

---

## Project layout

```
start.bat            One-click launcher (backend + frontend)
main.py              FastAPI entrypoint
requirements.txt     Python dependencies
.env.example         Environment variable template
master_of_data.yaml  Owner routing config

api/                 Routes (tagged), Pydantic schemas, error handlers
scanner/             PDF extractor (+ OCR), Presidio NER, LLM classifier, pipeline
connectors/          Abstract Connector, local folder, Microsoft Graph stub
db/                  SQLAlchemy models, session, seed (8 users + 27 PDFs)
core/                Enums, settings, canonical hashing
eval/                CLI harness, ground_truth.csv (27 PDFs)
scripts/             Verification and generation utilities

frontend/            Next.js 14 app (TypeScript + Tailwind)
  app/               Pages: login, my-findings, admin-dashboard, run-scan, audit-log
  components/        UI components, charts, finding detail panel
  src/lib/           API client, type definitions
  types/             Shared TypeScript models

FRONTEND_INTEGRATION.md   API handoff guide for frontend developers
```

---

## Reset database

```powershell
Remove-Item gdpr_sentinel.db -ErrorAction Ignore
# restart backend — it will re-seed automatically
```

## Requires Python 3.13

spaCy 3.8 has no prebuilt wheels for Python 3.7 — compilation blocked by corporate EDR.
