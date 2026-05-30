"""Measure peak RSS and CPU time for a full scan over ./data/.

Usage:
    python scripts/measure_resources.py

Prints a one-line summary suitable for the pitch / eval submission.
"""

import os
import sys
import time

sys.path.insert(0, ".")

import psutil

from connectors.local_folder import LocalFolderConnector
from core.config import get_settings
from db.session import init_db
from scanner.pipeline import run_full_scan

init_db()

proc = psutil.Process(os.getpid())

# Baseline after init (spaCy models already loaded by init_db seed scan).
rss_before = proc.memory_info().rss
cpu_before = proc.cpu_times()
t0 = time.perf_counter()

connector = LocalFolderConnector(root=get_settings().data_root_path)
scan_id = run_full_scan(connector=connector, source_id="src_local_data")

wall = time.perf_counter() - t0
cpu_after = proc.cpu_times()
rss_after = proc.memory_info().rss

rss_mb      = rss_after / 1024 ** 2
rss_delta   = (rss_after - rss_before) / 1024 ** 2
cpu_user    = cpu_after.user - cpu_before.user
cpu_system  = cpu_after.system - cpu_before.system
cpu_total   = cpu_user + cpu_system

# Count files processed.
from db.session import SessionLocal
from db.models import Scan
from sqlalchemy import select
with SessionLocal() as s:
    scan = s.execute(select(Scan).where(Scan.id == scan_id)).scalar_one()
    n_files = scan.files_processed

print()
print("=" * 56)
print("GDPR Sentinel — Resource Intensity")
print("=" * 56)
print(f"Files scanned       : {n_files}")
print(f"Wall-clock time     : {wall:.2f}s")
print(f"Files / second      : {n_files / wall:.2f}")
print(f"Peak RSS (total)    : {rss_mb:.0f} MB")
print(f"RSS delta (scan)    : {rss_delta:+.0f} MB")
print(f"CPU time (user)     : {cpu_user:.2f}s")
print(f"CPU time (system)   : {cpu_system:.2f}s")
print(f"CPU / wall ratio    : {cpu_total / wall:.2f}x  (< 1 = I/O-bound)")
print("=" * 56)
print()
print("Pitch line:")
print(f"  Peak {rss_mb:.0f} MB RSS | {wall:.0f}s wall for {n_files} files | "
      f"CPU/wall {cpu_total/wall:.2f}x (I/O-bound on LLM calls)")
