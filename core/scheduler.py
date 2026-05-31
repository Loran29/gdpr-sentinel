"""Periodic delta-scan scheduler using a daemon thread.

Activated only when DELTA_SCAN_INTERVAL_MINUTES > 0 in settings (or set at
runtime via the /admin/scheduler API endpoint).
"""

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_stop_event: threading.Event = threading.Event()
_thread: Optional[threading.Thread] = None

_interval_minutes: int = 0
_next_run_at: Optional[datetime] = None


def get_state() -> dict:
    with _lock:
        return {
            "interval_minutes": _interval_minutes,
            "running": _thread is not None and _thread.is_alive(),
            "next_run_at": _next_run_at.isoformat() if _next_run_at else None,
        }


def _loop() -> None:
    global _next_run_at
    logger.info("Scheduler: delta-scan thread started")

    while not _stop_event.is_set():
        with _lock:
            interval_sec = _interval_minutes * 60

        if interval_sec <= 0:
            logger.info("Scheduler: interval is 0, stopping")
            return

        # Record next fire time.
        deadline = time.monotonic() + interval_sec
        with _lock:
            _next_run_at = datetime.utcnow().replace(microsecond=0)

        # Sleep in 1-second ticks so we notice stop/reconfigure quickly.
        while not _stop_event.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            with _lock:
                from datetime import timedelta
                _next_run_at = datetime.utcnow().replace(microsecond=0)
                _next_run_at = _next_run_at.replace(
                    second=(_next_run_at.second)
                )
                # Simpler: just store seconds-remaining as a future timestamp
            time.sleep(min(1.0, remaining))

        if _stop_event.is_set():
            return

        # Re-check interval (may have changed during sleep).
        with _lock:
            interval_sec = _interval_minutes * 60
        if interval_sec <= 0:
            return

        try:
            from connectors.local_folder import LocalFolderConnector
            from core.config import get_settings
            from scanner.pipeline import reserve_scan_id, run_delta_scan

            settings = get_settings()
            connector = LocalFolderConnector(root=settings.data_root_path)
            scan_id = reserve_scan_id(scan_type="delta", source_id="src_local_data")
            logger.info("Scheduler: starting automated delta scan %s", scan_id)
            run_delta_scan(connector=connector, source_id="src_local_data", scan_id=scan_id)
            logger.info("Scheduler: delta scan %s complete", scan_id)
        except Exception:
            logger.exception("Scheduler: delta scan failed")


def start(interval_minutes: int) -> None:
    global _thread, _interval_minutes
    with _lock:
        _interval_minutes = interval_minutes
    if interval_minutes <= 0:
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_loop, daemon=True, name="delta-scan-scheduler")
    _thread.start()


def reconfigure(interval_minutes: int) -> None:
    global _thread, _interval_minutes
    with _lock:
        _interval_minutes = interval_minutes

    if interval_minutes <= 0:
        _stop_event.set()
        return

    if _thread is None or not _thread.is_alive():
        _stop_event.clear()
        _thread = threading.Thread(target=_loop, daemon=True, name="delta-scan-scheduler")
        _thread.start()
    # If already running, the loop re-reads _interval_minutes each tick.


def stop() -> None:
    _stop_event.set()
