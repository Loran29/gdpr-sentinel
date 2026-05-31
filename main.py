"""GDPR Sentinel — FastAPI entrypoint.

Run:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.errors import register_error_handlers
from api.routes import router
from api.auth import auth_router
from core.scheduler import start as start_scheduler, stop as stop_scheduler
from db.session import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Module-level start time — used by /admin/health to compute uptime.
_SERVER_START = time.perf_counter()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    init_db()
    from core.config import get_settings
    from scanner.presidio_scanner import _get_analyzer
    _get_analyzer()  # warm up spaCy models so first scan request is not slow
    start_scheduler(get_settings().delta_scan_interval_minutes)
    yield
    stop_scheduler()


app = FastAPI(
    title="GDPR Sentinel",
    description="AI-assisted GDPR data discovery prototype.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

register_error_handlers(app)
app.include_router(router)
app.include_router(auth_router)
