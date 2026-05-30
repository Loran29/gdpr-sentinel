# GDPR Sentinel — Backend

AI-assisted GDPR data discovery prototype for the TechOn 2026 Challenge 03 (Bosch). Scans corporate document stores, classifies personal data, suggests retention, and routes findings to the right human reviewer (direct owner or Master of Data).

The backend exposes a FastAPI service backed by SQLite. The scan pipeline combines deterministic regex/Presidio recognizers (for IDs, VAT, postal codes, financial amounts) with an Anthropic Claude classifier (for document type + reasoning + sensitivity).

## Setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_lg && python -m spacy download de_core_news_lg
cp .env.example .env               # then edit and set OPENROUTER_API_KEY
```

If `OPENROUTER_API_KEY` is not set, the pipeline falls back to a filename-based stub classifier so the service still boots.

## Run

```bash
uvicorn main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

CORS allows http://localhost:3000 (the frontend).

## Eval

```bash
python -m eval.harness
```

Runs the scan twice, computes precision/recall/F1 against `eval/ground_truth.csv`, and asserts `result_hash` is identical across the two runs (`REPRODUCIBILITY: PASS`). Results are written to `eval/results/run_<timestamp>.json`.

## Tested with

Python 3.11.

## Project layout

```
api/         FastAPI routes, pydantic schemas, error helpers
scanner/     PDF extraction, Presidio recognizers, LLM classifier, pipeline
connectors/  Abstract Connector + local_folder impl + Microsoft Graph stub
db/          SQLAlchemy models, session, seed
core/        Enums, config, canonical hashing
eval/        CLI harness + labeled ground truth
```

See [CONTRACT.md](../CONTRACT.md) (one level up in the parent project) for the field-level contract with the frontend.
