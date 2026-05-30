# GDPR Sentinel — Backend

AI-assisted GDPR data discovery prototype for the TechOn 2026 Challenge 03 (Bosch). Scans corporate document stores, classifies personal data, suggests retention, and routes findings to the right human reviewer (direct owner or Master of Data).

The backend exposes a FastAPI service backed by SQLite. The scan pipeline combines deterministic regex/Presidio recognizers (for IDs, VAT, postal codes, financial amounts, phone numbers) with a Claude LLM classifier via OpenRouter (for document type, sensitivity level, GDPR reasoning, and retention recommendation).

## Setup

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1          # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_lg && python -m spacy download de_core_news_lg
cp .env.example .env                # then set OPENROUTER_API_KEY
```

Optional OCR for scanned PDFs (requires [Tesseract](https://github.com/tesseract-ocr/tesseract) on PATH):
```bash
pip install pytesseract pdf2image
```

If `OPENROUTER_API_KEY` is not set, the pipeline falls back to a filename-based stub classifier — still boots and seeds without network access.

## Run

```bash
Remove-Item gdpr_sentinel.db -ErrorAction Ignore   # PowerShell — reset DB
uvicorn main:app --reload --port 8000
```

- API docs: **http://localhost:8000/docs** (grouped by tag: Health, Users, Scans, Findings, Admin, Files)
- Health: http://localhost:8000/health
- Resource metrics: http://localhost:8000/admin/health

CORS allows `http://localhost:3000` (frontend).

On first boot: seeds 8 users, downloads (or synthesizes) 27 sample PDFs, and runs an initial full scan automatically.

## Eval

```bash
python -m eval.harness
```

Runs two full scans, computes P/R/F1 against `eval/ground_truth.csv` (27 PDFs), and asserts identical `result_hash` across runs. Results written to `eval/results/run_<timestamp>.json`, surfaced on `GET /admin/dashboard`.

**Current numbers** (claude-haiku-4.5, 27 PDFs across 9 document types):

| Metric | Value |
|--------|-------|
| Precision | 93.8% |
| Recall | 97.4% |
| F1 | **0.955** |
| Document type accuracy | **100%** |
| Reproducibility | **PASS** |
| Scan speed (cold, parallel) | ~30s for 27 files |
| Scan speed (cache hit) | ~1.5s for 27 files |

Precision tuned toward recall — a missed PII record is a GDPR violation; an extra flag is reviewer time.

## Verify OpenRouter wiring

```bash
python scripts/verify_openrouter.py
```

Sends one sample document to the classifier, asserts the response is live (not the filename stub). Prints `ALL ASSERTIONS PASSED` on success.

## Resource intensity

```bash
python scripts/measure_resources.py
```

Measures peak RSS and CPU time for a full scan. Typical: ~4GB RSS (spaCy large models, loaded once at startup), CPU-bound on Presidio NER.

## LLM cache

Responses cached in `.llm_cache/` keyed on `sha256(model + document_text)`. Repeat scans on unchanged files return instantly. Delete the directory to force re-classification.

## API endpoints (27 total)

| Tag | Endpoints |
|-----|-----------|
| **Health** | `GET /health`, `GET /admin/health` |
| **Users** | `GET /users` |
| **Scans** | `POST /scan/run`, `POST /scan/delta`, `GET /scan/{id}`, `GET /scans`, `GET /scans/compare` |
| **Findings** | `GET /findings/by-user/{id}`, `GET /findings/{id}`, `POST /findings/{id}/action`, `POST /findings/batch-action`, `GET /findings/export` |
| **Admin** | `GET /admin/dashboard`, `GET /admin/retention`, `POST /admin/retention/notify`, `GET /admin/owners`, `GET /admin/audit`, `GET /connectors/graph/test` |
| **Files** | `GET /files/{id}/preview`, `GET /files/{id}/summary`, `POST /files/{id}/rescan` |

## Document types supported (9)

`expense_report`, `it_access_request`, `incident_report`, `supplier_onboarding`, `training_evaluation`, `medical_record`, `financial_authorization`, `internal_memo`, `unknown`

## Key design decisions

- **Reproducibility hash** covers only deterministic (presidio/regex) entities — LLM `additional_entities` excluded (OpenRouter proxies don't honour `seed`)
- **Entity suppression** — DATE, JOB_TITLE, LOCATION, POSTAL_CODE, OTHER suppressed (not personal data standalone)
- **Contextual filters** — FINANCIAL_AMOUNT requires a person context; DEPARTMENT requires co-occurring PERSON_NAME; SYSTEM_IDENTIFIER single-word alpha values dropped
- **Parallel scan** — `ThreadPoolExecutor(max_workers=5)`, LLM calls are I/O-bound
- **Surname dedup** — honorific variants ("Dr. Ingrid Haller" + "Ingrid Haller") collapsed to one entity
- **Document year extraction** — retention clock uses earliest year found in document text (not scan date)
- **OCR fallback** — pdfplumber → byte-sweep → pytesseract (if installed)
- **Owner routing** — direct owner (OneDrive path) → MoD (shared drive) → catch-all

## Requires Python 3.13

spaCy 3.8 requires prebuilt CPython 3.13 wheels — compilation blocked by corporate EDR on 3.7.

## Project layout

```
api/             FastAPI routes (tagged), pydantic schemas, error helpers
scanner/         PDF extraction (+ OCR), Presidio recognizers, LLM classifier, pipeline
connectors/      Abstract Connector + local_folder + Microsoft Graph stub
db/              SQLAlchemy models, session, seed
core/            Enums, config, canonical hashing
eval/            CLI harness + labeled ground truth (27 PDFs)
scripts/         verify_openrouter.py, measure_resources.py, generate_test_pdfs.py
.llm_cache/      Disk cache for LLM responses (git-ignored, auto-created)
```

See `CONTRACT.md` (parent project) for the field-level API contract with the frontend.
