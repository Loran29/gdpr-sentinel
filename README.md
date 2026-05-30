# GDPR Sentinel — Backend

AI-assisted GDPR data discovery prototype for the TechOn 2026 Challenge 03 (Bosch). Scans corporate document stores, classifies personal data, suggests retention, and routes findings to the right human reviewer (direct owner or Master of Data).

The backend exposes a FastAPI service backed by SQLite. The scan pipeline combines deterministic regex/Presidio recognizers (for IDs, VAT, postal codes, financial amounts) with a Claude LLM classifier via OpenRouter (for document type, sensitivity level, reasoning, and retention recommendation).

## Setup

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1          # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_lg && python -m spacy download de_core_news_lg
cp .env.example .env                # then edit and set OPENROUTER_API_KEY
```

If `OPENROUTER_API_KEY` is not set, the pipeline falls back to a filename-based stub classifier so the service still boots and seeds without network access.

## Run

```bash
# Delete the DB first if the schema has changed since the last run:
Remove-Item gdpr_sentinel.db -ErrorAction Ignore   # PowerShell
# rm -f gdpr_sentinel.db                           # bash

uvicorn main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

CORS allows `http://localhost:3000` (the frontend).

On first boot the service seeds 8 users, downloads (or synthesizes) 15 sample PDFs, and runs an initial full scan automatically.

## Eval

```bash
python -m eval.harness
```

Runs the scan twice, computes precision/recall/F1 against `eval/ground_truth.csv`, and asserts `result_hash` is identical across both runs (`REPRODUCIBILITY: PASS`). Results are written to `eval/results/run_<timestamp>.json` and picked up by `GET /admin/dashboard`.

**Current numbers** (claude-haiku-4.5, 15 sample PDFs):

| Metric | Value |
|--------|-------|
| Precision | 59.7% |
| Recall | 95.6% |
| F1 | 0.735 |
| Document type accuracy | 100% |
| Reproducibility | PASS |
| Scan speed (cold, parallel) | ~23s for 15 files |
| Scan speed (cache hit) | ~0.7s for 15 files |

Precision is intentionally tuned toward recall — a missed PII record is a GDPR violation; an extra flag is reviewer time.

## LLM cache

LLM responses are cached on disk in `.llm_cache/` keyed on `sha256(model + document_text)`. Repeated scans of unchanged files return instantly. The cache directory is git-ignored. Delete it to force re-classification.

## Verify OpenRouter wiring

```bash
python scripts/verify_openrouter.py
```

Sends one sample document to the classifier and asserts the response is live (not the filename stub). Prints `ALL ASSERTIONS PASSED` on success.

## Requires Python 3.13

spaCy 3.8 wheels are required; spaCy 3.7 has no prebuilt CPython 3.13 wheels and corporate EDR blocks compilation.

## Project layout

```
api/         FastAPI routes, pydantic schemas, error helpers
scanner/     PDF extraction, Presidio recognizers, LLM classifier, pipeline
connectors/  Abstract Connector + local_folder impl + Microsoft Graph stub
db/          SQLAlchemy models, session, seed
core/        Enums, config, canonical hashing
eval/        CLI harness + labeled ground truth (ground_truth.csv)
scripts/     One-shot verification scripts (verify_openrouter.py)
.llm_cache/  Disk cache for LLM responses (git-ignored, auto-created)
```

## Key design decisions

- **Reproducibility hash** covers only deterministic (presidio/regex) entities — LLM `additional_entities` are stored in the DB but excluded from the hash because OpenRouter proxies don't honour `seed` in practice.
- **Entity suppression** — `DATE` and `JOB_TITLE` are detected internally but not surfaced as findings; neither is personal data under GDPR when standing alone.
- **Parallel scan** — files are processed with `ThreadPoolExecutor(max_workers=5)`; the LLM call is I/O-bound so threading gives ~5× throughput.
- **Owner routing** — direct owner from `master_of_data.yaml` path patterns; falls through to Master-of-Data for shared drives; catch-all `**` → `mod_default`.
- **Stage timings** — `GET /admin/dashboard` returns `last_scan_timing_breakdown` with `{extract_ms, presidio_ms, llm_ms, db_ms}` for the last completed scan.

See `CONTRACT.md` (one level up in the parent project) for the field-level API contract with the frontend.
