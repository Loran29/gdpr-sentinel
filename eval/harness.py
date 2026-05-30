"""Eval harness — CLI entrypoint.

Usage:
    python -m eval.harness

What it does:
1. Loads `eval/ground_truth.csv`.
2. Triggers a full scan via the pipeline directly (not over HTTP).
3. Compares findings against ground truth → precision / recall / F1 per entity
   type and overall.
4. Triggers a SECOND full scan and asserts the `result_hash` is identical.
   Prints `REPRODUCIBILITY: PASS` or `FAIL`.
5. Writes a JSON report to `eval/results/run_<timestamp>.json`.
6. Prints a summary table to stdout.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import desc, select

from connectors.local_folder import LocalFolderConnector
from core.config import get_settings
from db.models import Entity, File, Finding, Scan
from db.session import SessionLocal, init_db
from scanner.pipeline import run_full_scan


GROUND_TRUTH_PATH = Path("eval/ground_truth.csv")
RESULTS_DIR = Path("eval/results")


# ---------------------------------------------------------------------------
# Ground truth loading
# ---------------------------------------------------------------------------


def load_ground_truth() -> dict[str, dict]:
    """Returns {file_name: {expected_document_type, expected_entity_types(list[str])}}."""
    if not GROUND_TRUTH_PATH.exists():
        print(f"ERROR: {GROUND_TRUTH_PATH} not found", file=sys.stderr)
        sys.exit(2)
    out: dict[str, dict] = {}
    with GROUND_TRUTH_PATH.open(newline="", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        for row in reader:
            out[row["file_name"]] = {
                "expected_document_type": row["expected_document_type"],
                "expected_entity_types": [
                    t for t in row["expected_entity_types_pipe_separated"].split("|") if t
                ],
            }
    return out


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def compute_metrics(predicted: dict[str, dict], truth: dict[str, dict]) -> dict:
    """Per-entity-type and overall precision / recall / F1.

    Treats this as a multi-label problem: for each (file, entity_type), is the
    type present in prediction / truth? The frontend KPIs use the overall numbers.
    """
    # Per-entity-type tallies.
    by_type_tp: dict[str, int] = defaultdict(int)
    by_type_fp: dict[str, int] = defaultdict(int)
    by_type_fn: dict[str, int] = defaultdict(int)

    doc_type_correct = 0
    doc_type_total = 0

    for fname, expected in truth.items():
        pred = predicted.get(fname)
        expected_types_multiset: list[str] = list(expected["expected_entity_types"])
        # Compare as multisets so "PERSON_NAME twice" requires two predictions.
        pred_types_multiset: list[str] = list(pred["entity_types"]) if pred else []

        # Convert to count dicts.
        from collections import Counter

        ec = Counter(expected_types_multiset)
        pc = Counter(pred_types_multiset)

        for t in set(ec) | set(pc):
            tp = min(ec[t], pc[t])
            fp = max(0, pc[t] - ec[t])
            fn = max(0, ec[t] - pc[t])
            by_type_tp[t] += tp
            by_type_fp[t] += fp
            by_type_fn[t] += fn

        if pred is not None:
            doc_type_total += 1
            if pred["document_type"] == expected["expected_document_type"]:
                doc_type_correct += 1

    # Overall.
    total_tp = sum(by_type_tp.values())
    total_fp = sum(by_type_fp.values())
    total_fn = sum(by_type_fn.values())

    def _prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        return precision, recall, f1

    overall_p, overall_r, overall_f1 = _prf(total_tp, total_fp, total_fn)

    by_type: dict[str, dict] = {}
    for t in sorted(set(by_type_tp) | set(by_type_fp) | set(by_type_fn)):
        p, r, f1 = _prf(by_type_tp[t], by_type_fp[t], by_type_fn[t])
        by_type[t] = {
            "tp": by_type_tp[t],
            "fp": by_type_fp[t],
            "fn": by_type_fn[t],
            "precision_pct": round(p * 100, 1),
            "recall_pct": round(r * 100, 1),
            "f1_score": round(f1, 3),
        }

    doc_type_acc = doc_type_correct / doc_type_total if doc_type_total else 0.0

    return {
        "overall": {
            "tp": total_tp,
            "fp": total_fp,
            "fn": total_fn,
            "precision_pct": round(overall_p * 100, 1),
            "recall_pct": round(overall_r * 100, 1),
            "f1_score": round(overall_f1, 3),
            "document_type_accuracy_pct": round(doc_type_acc * 100, 1),
        },
        "by_entity_type": by_type,
    }


# ---------------------------------------------------------------------------
# Pipeline glue
# ---------------------------------------------------------------------------


def collect_predictions(scan_id: str) -> dict[str, dict]:
    """Pull what the pipeline produced for this scan and shape it for compare."""
    out: dict[str, dict] = {}
    with SessionLocal() as s:
        rows = (
            s.execute(
                select(Finding, File)
                .join(File, File.id == Finding.file_id)
                .where(Finding.scan_id == scan_id)
            )
            .all()
        )
        for finding, file_row in rows:
            entities = (
                s.execute(select(Entity).where(Entity.finding_id == finding.id)).scalars().all()
            )
            out[file_row.name] = {
                "document_type": finding.document_type,
                "entity_types": [e.type for e in entities],
            }
    return out


def get_scan_summary(scan_id: str) -> dict:
    with SessionLocal() as s:
        scan = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one()
        return {
            "id": scan.id,
            "scan_type": scan.scan_type,
            "duration_sec": float(scan.duration_sec),
            "files_processed": scan.files_processed,
            "files_skipped": scan.files_skipped,
            "files_with_findings": scan.files_with_findings,
            "total_findings": scan.total_findings,
            "result_hash": scan.result_hash,
        }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def print_summary(metrics: dict, scan_a: dict, scan_b: dict, reproducible: bool) -> None:
    print()
    print("=" * 72)
    print("GDPR Sentinel — Eval Summary")
    print("=" * 72)
    overall = metrics["overall"]
    print(
        f"Overall          P={overall['precision_pct']:>5}%  "
        f"R={overall['recall_pct']:>5}%  F1={overall['f1_score']:.3f}"
    )
    print(f"Document type    accuracy={overall['document_type_accuracy_pct']}%")
    print()
    print(f"{'Entity type':<22}{'TP':>5}{'FP':>5}{'FN':>5}{'P%':>8}{'R%':>8}{'F1':>8}")
    for t, m in metrics["by_entity_type"].items():
        print(
            f"{t:<22}{m['tp']:>5}{m['fp']:>5}{m['fn']:>5}"
            f"{m['precision_pct']:>8}{m['recall_pct']:>8}{m['f1_score']:>8.3f}"
        )
    print()
    print("Scan A   ", scan_a)
    print("Scan B   ", scan_b)
    print()
    if reproducible:
        print("REPRODUCIBILITY: PASS")
    else:
        print("REPRODUCIBILITY: FAIL")
    print("=" * 72)


def write_results(
    metrics: dict,
    scan_a: dict,
    scan_b: dict,
    reproducible: bool,
) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_path = RESULTS_DIR / f"run_{ts}.json"
    out_path.write_text(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "overall": metrics["overall"],
                "precision_pct": metrics["overall"]["precision_pct"],
                "recall_pct": metrics["overall"]["recall_pct"],
                "f1_score": metrics["overall"]["f1_score"],
                "by_entity_type": metrics["by_entity_type"],
                "scan_a": scan_a,
                "scan_b": scan_b,
                "reproducible": reproducible,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return out_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    init_db()  # ensures DB + seed exist
    truth = load_ground_truth()

    connector = LocalFolderConnector(root=get_settings().data_root_path)

    scan_a_id = run_full_scan(connector=connector, source_id="src_local_data")
    scan_a = get_scan_summary(scan_a_id)

    predictions = collect_predictions(scan_a_id)
    metrics = compute_metrics(predictions, truth)

    scan_b_id = run_full_scan(connector=connector, source_id="src_local_data")
    scan_b = get_scan_summary(scan_b_id)

    reproducible = scan_a["result_hash"] == scan_b["result_hash"] and scan_a["result_hash"] != ""

    out_path = write_results(metrics, scan_a, scan_b, reproducible)
    print_summary(metrics, scan_a, scan_b, reproducible)
    print(f"\nResults written to {out_path}")

    return 0 if reproducible else 1


if __name__ == "__main__":
    sys.exit(main())
