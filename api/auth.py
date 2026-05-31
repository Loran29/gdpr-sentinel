"""Microsoft OAuth2 auth-code flow endpoints.

Routes:
  GET /auth/microsoft  — redirect to Microsoft login
  GET /auth/callback   — exchange code for token, store in memory
  GET /auth/status     — check if connected + who is logged in
  POST /auth/logout    — clear the stored token
  POST /auth/scan      — trigger a OneDrive scan with the stored token
"""

from __future__ import annotations

import logging
import threading
import urllib.parse
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from core.config import get_settings
from db.session import get_db

logger = logging.getLogger(__name__)

auth_router = APIRouter()

# In-memory token store — single user for the hackathon demo.
_token_store: dict = {
    "access_token": None,
    "user_name": None,
    "user_email": None,
    "user_id": None,
}
_token_lock = threading.Lock()

SCOPES = ["Files.Read", "User.Read"]


def get_token() -> Optional[str]:
    with _token_lock:
        return _token_store["access_token"]


def get_graph_user_info() -> dict:
    with _token_lock:
        return {
            "connected": _token_store["access_token"] is not None,
            "user_name": _token_store["user_name"],
            "user_email": _token_store["user_email"],
        }


# ---------------------------------------------------------------------------

@auth_router.get("/auth/microsoft", tags=["Auth"])
def auth_microsoft():
    """Redirect user to Microsoft login page."""
    settings = get_settings()
    if not settings.has_azure:
        return {"error": "Azure credentials not configured"}

    import msal
    app = msal.PublicClientApplication(
        client_id=settings.azure_client_id,
        authority=f"https://login.microsoftonline.com/{settings.azure_tenant_id}",
    )
    auth_url = app.get_authorization_request_url(
        scopes=SCOPES,
        redirect_uri=settings.azure_redirect_uri,
        prompt="select_account",
    )
    return RedirectResponse(url=auth_url)


@auth_router.get("/auth/callback", tags=["Auth"])
def auth_callback(code: str = Query(...), db: Session = Depends(get_db)):
    """Exchange auth code for access token, store it, redirect to frontend."""
    settings = get_settings()

    import msal, requests as _req

    app = msal.ConfidentialClientApplication(
        client_id=settings.azure_client_id,
        client_credential=settings.azure_client_secret,
        authority=f"https://login.microsoftonline.com/{settings.azure_tenant_id}",
    )

    result = app.acquire_token_by_authorization_code(
        code=code,
        scopes=SCOPES,
        redirect_uri=settings.azure_redirect_uri,
    )

    if "error" in result:
        error_desc = result.get("error_description", result.get("error"))
        logger.error("MSAL token error: %s", error_desc)
        return HTMLResponse(
            content=f"<h2>Auth failed</h2><p>{error_desc}</p><a href='http://localhost:3000'>Back</a>",
            status_code=400,
        )

    access_token = result["access_token"]

    # Fetch user profile
    profile = _req.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    ).json()

    with _token_lock:
        _token_store["access_token"] = access_token
        _token_store["user_name"] = profile.get("displayName", "Unknown")
        _token_store["user_email"] = profile.get("mail") or profile.get("userPrincipalName", "")
        _token_store["user_id"] = profile.get("id", "")

    logger.info("OneDrive connected: %s (%s)", _token_store["user_name"], _token_store["user_email"])

    # Redirect back to frontend run-scan page
    return RedirectResponse(url="http://localhost:3000/run-scan?onedrive=connected")


@auth_router.get("/auth/status", tags=["Auth"])
def auth_status():
    """Return OneDrive connection status."""
    info = get_graph_user_info()
    settings = get_settings()
    return {
        "connected": info["connected"],
        "user_name": info["user_name"],
        "user_email": info["user_email"],
        "azure_configured": settings.has_azure,
    }


@auth_router.post("/auth/logout", tags=["Auth"])
def auth_logout():
    """Disconnect OneDrive — clear the stored token."""
    with _token_lock:
        _token_store["access_token"] = None
        _token_store["user_name"] = None
        _token_store["user_email"] = None
        _token_store["user_id"] = None
    return {"disconnected": True}


@auth_router.post("/auth/onedrive/scan", tags=["Auth"])
def onedrive_scan(background: BackgroundTasks):
    """Trigger a scan of the connected OneDrive. Returns scan_id for polling."""
    token = get_token()
    if not token:
        return {"error": "Not connected to OneDrive. Visit /auth/microsoft first."}

    from connectors.graph_connector import GraphConnector
    from scanner.pipeline import reserve_scan_id, run_full_scan

    scan_id = reserve_scan_id("full", source_id="src_onedrive")

    def _bg():
        try:
            connector = GraphConnector(access_token=token)
            run_full_scan(connector=connector, source_id="src_onedrive", scan_id=scan_id)
        except Exception as exc:
            logger.exception("OneDrive scan failed: %s", exc)

    background.add_task(_bg)
    return {"scan_id": scan_id, "status": "running"}

