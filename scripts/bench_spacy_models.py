"""One-off benchmark: en_core_web_sm vs md vs lg on the 27-file eval corpus.

For each model size we rebuild the Presidio analyzer with that English model,
run the SAME detection path the pipeline uses (extract -> presidio -> llm ->
filter) over every file, and score entity-type P/R/F1 against ground truth.

Speed is reported as warm Presidio time (model loaded once, then timed over a
second pass) so we measure steady-state NER cost, not one-time load.

Run: .venv/Scripts/python.exe scripts/bench_spacy_models.py
"""
from __future__ import annotations

import csv
import logging
import time
from collections import Counter, defaultdict
from pathlib import Path

logging.disable(logging.CRITICAL)

from connectors.local_folder import LocalFolderConnector
from core.config import get_settings
from scanner.extractor import extract_text
from scanner.llm_classifier import classify
import scanner.presidio_scanner as ps
from scanner import pipeline as P

MODELS = ["en_core_web_sm", "en_core_web_md", "en_core_web_lg"]


def load_truth() -> dict[str, list[str]]:
    out = {}
    with open("eval/ground_truth.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["file_name"]] = [t for t in r["expected_entity_types_pipe_separated"].split("|") if t]
    return out


def build_analyzer(en_model: str):
    """Rebuild Presidio with a specific English model (English-only for the bench)."""
    from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    cfg = {"nlp_engine_name": "spacy", "models": [{"lang_code": "en", "model_name": en_model}]}
    nlp_engine = NlpEngineProvider(nlp_configuration=cfg).create_engine()
    registry = RecognizerRegistry(supported_languages=["en"])
    registry.load_predefined_recognizers(languages=["en"])
    return AnalyzerEngine(nlp_engine=nlp_engine, registry=registry, supported_languages=["en"])


def extract_all(conn) -> dict[str, tuple[str, str]]:
    """Pre-extract text + cache filename so each model run reuses identical input."""
    data = {}
    for fm in conn.list_files():
        text = "\n".join(p.text for p in extract_text(conn.read_file(fm.path), filename=fm.name) if p.text)
        data[fm.name] = (text, fm.name)
    return data


def run_model(en_model: str, texts: dict, truth: dict) -> dict:
    # Swap the module-level analyzer so ps.analyze() uses this model.
    ps._analyzer = build_analyzer(en_model)

    # Warm pass (not timed) — JIT, caches.
    for text, name in texts.values():
        ps.analyze(text)

    # Timed pass: presidio only.
    t0 = time.perf_counter()
    presidio_by_file = {}
    for name, (text, _) in texts.items():
        presidio_by_file[name] = ps.analyze(text)
    presidio_ms = (time.perf_counter() - t0) * 1000

    # Full detection (presidio + llm[cached] + filter) to score accuracy.
    tp = defaultdict(int); fp = defaultdict(int); fn = defaultdict(int)
    for name, (text, fname) in texts.items():
        pres = presidio_by_file[name]
        llm = classify(text, pres, filename_hint=fname)
        merged = [{"type": e.type, "value": e.value, "context": e.context,
                   "detector": e.detector, "confidence": e.confidence} for e in pres]
        seen = {(e["type"], e["value"].casefold()) for e in merged}
        for ae in llm.get("additional_entities", []) or []:
            k = (ae["type"], str(ae["value"]).casefold())
            if k in seen:
                continue
            seen.add(k)
            merged.append({"type": ae["type"], "value": ae["value"],
                           "context": ae.get("context", ""), "detector": "llm", "confidence": 0.85})
        merged = P._filter_entities(merged, text, llm["document_type"])
        pred = Counter(e["type"] for e in merged)
        exp = Counter(truth.get(name, []))
        for t in set(pred) | set(exp):
            tp[t] += min(pred[t], exp[t])
            fp[t] += max(0, pred[t] - exp[t])
            fn[t] += max(0, exp[t] - pred[t])

    TP, FP, FN = sum(tp.values()), sum(fp.values()), sum(fn.values())
    prec = TP / (TP + FP) if TP + FP else 0
    rec = TP / (TP + FN) if TP + FN else 0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    return {"presidio_ms": presidio_ms, "P": prec * 100, "R": rec * 100, "F1": f1, "TP": TP, "FP": FP, "FN": FN}


def main():
    truth = load_truth()
    conn = LocalFolderConnector(root=get_settings().data_root_path)
    texts = extract_all(conn)
    print(f"Corpus: {len(texts)} files\n")
    print(f"{'model':18}{'presidio_ms':>13}{'P%':>8}{'R%':>8}{'F1':>8}{'TP':>5}{'FP':>5}{'FN':>5}")
    print("-" * 68)
    results = {}
    for m in MODELS:
        r = run_model(m, texts, truth)
        results[m] = r
        print(f"{m:18}{r['presidio_ms']:>13.0f}{r['P']:>8.1f}{r['R']:>8.1f}{r['F1']:>8.3f}{r['TP']:>5}{r['FP']:>5}{r['FN']:>5}")
    print()
    lg = results["en_core_web_lg"]
    for m in ("en_core_web_sm", "en_core_web_md"):
        r = results[m]
        speedup = lg["presidio_ms"] / r["presidio_ms"] if r["presidio_ms"] else 0
        print(f"{m} vs lg: {speedup:.1f}x faster Presidio, F1 {r['F1']:.3f} vs {lg['F1']:.3f} (delta {r['F1']-lg['F1']:+.3f})")


if __name__ == "__main__":
    main()
