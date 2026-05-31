"""Real Microsoft Graph connector using MSAL delegated auth (OAuth2 auth-code flow).

This connector is used after the user has completed the OAuth login flow via
GET /auth/microsoft → GET /auth/callback. The access token is stored in the
in-memory token store and passed in here.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import PurePosixPath

import requests

from connectors.base import Connector, FileMeta

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class GraphConnector(Connector):
    def __init__(self, access_token: str) -> None:
        self.access_token = access_token
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        })

    # -----------------------------------------------------------------------
    # Connector interface
    # -----------------------------------------------------------------------

    def list_files(self) -> list[FileMeta]:
        """List all PDF and DOCX files from the authenticated user's OneDrive."""
        files: list[FileMeta] = []
        try:
            # Get the user's OneDrive root children recursively
            url = f"{GRAPH_BASE}/me/drive/root/search(q='')?$filter=file ne null&$top=100"
            while url:
                resp = self._session.get(url, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("value", []):
                    name: str = item.get("name", "")
                    if not name.lower().endswith((".pdf", ".docx")):
                        continue
                    file_id = item.get("id", "")
                    size = item.get("size", 0)
                    modified_str = item.get("lastModifiedDateTime", "")
                    try:
                        modified = datetime.fromisoformat(modified_str.replace("Z", "+00:00"))
                    except Exception:
                        modified = datetime.now(timezone.utc)

                    # Build a stable virtual path
                    parent = item.get("parentReference", {})
                    parent_path = parent.get("path", "/drive/root:")
                    # Strip the /drive/root: prefix
                    rel = parent_path.split("root:")[-1].strip("/")
                    virtual_path = f"/onedrive/{rel}/{name}".replace("//", "/")

                    files.append(FileMeta(
                        path=f"graph://{file_id}",  # used by read_file
                        name=name,
                        size_bytes=size,
                        last_modified=modified,
                        mime_type="application/pdf" if name.lower().endswith(".pdf")
                                  else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ))
                url = data.get("@odata.nextLink")
        except Exception as exc:
            logger.error("GraphConnector.list_files failed: %s", exc)
        return files

    def read_file(self, path: str) -> bytes:
        """Download file content. path is graph://{item_id}."""
        if not path.startswith("graph://"):
            raise ValueError(f"Invalid graph path: {path}")
        item_id = path[len("graph://"):]
        url = f"{GRAPH_BASE}/me/drive/items/{item_id}/content"
        resp = self._session.get(url, timeout=60)
        resp.raise_for_status()
        return resp.content

    def get_owner(self, path: str) -> str | None:
        # Uploaded files from OneDrive are owned by the authenticated user.
        # We map them to the currently logged-in user via the auth flow.
        return None
