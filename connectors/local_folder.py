"""LocalFolderConnector — reads PDFs and Word docs from a directory tree on disk."""

from __future__ import annotations

import mimetypes
from datetime import datetime, timezone
from pathlib import Path

import yaml

from connectors.base import Connector, FileMeta
from core.config import get_settings


class LocalFolderConnector(Connector):
    # Subfolders excluded from main scans — used for ad-hoc uploads only.
    _EXCLUDED_DIRS = {"uploads"}

    def __init__(self, root: Path | str, mod_yaml: Path | str | None = None, include_uploads: bool = False) -> None:
        self.root = Path(root).resolve()
        self._include_uploads = include_uploads
        if mod_yaml is None:
            mod_yaml = get_settings().master_of_data_config
        self._direct_patterns: list[tuple[str, str]] = []
        cfg_path = Path(mod_yaml).resolve()
        if cfg_path.exists():
            cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            for entry in cfg.get("direct_owner_patterns", []):
                self._direct_patterns.append((entry["pattern"], entry["user_id"]))

    def list_files(self) -> list[FileMeta]:
        if not self.root.exists():
            return []
        out: list[FileMeta] = []
        for p in sorted(self.root.rglob("*")):
            if not p.is_file():
                continue
            if p.suffix.lower() not in (".pdf", ".docx"):
                continue
            # Skip excluded dirs unless explicitly included (upload scans)
            if not self._include_uploads:
                if any(part in self._EXCLUDED_DIRS for part in p.parts):
                    continue
            stat = p.stat()
            mt, _ = mimetypes.guess_type(p.name)
            out.append(
                FileMeta(
                    path=self._normalize(p),
                    name=p.name,
                    size_bytes=stat.st_size,
                    last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                    mime_type=mt or "application/octet-stream",
                )
            )
        return out

    def read_file(self, path: str) -> bytes:
        return self._resolve(path).read_bytes()

    def get_owner(self, path: str) -> str | None:
        normalized = path.replace("\\", "/")
        for pattern, user_id in self._direct_patterns:
            if pattern in normalized:
                return user_id
        return None

    # --- internals -----------------------------------------------------------

    def _normalize(self, p: Path) -> str:
        """Return a stable, forward-slash path that includes a `/data/...` prefix
        so it matches the patterns in master_of_data.yaml regardless of where the
        repo is checked out."""
        rel = p.resolve().relative_to(self.root)
        return f"/data/{rel.as_posix()}"

    def _resolve(self, normalized_path: str) -> Path:
        # `/data/onedrive/sara.hoffmann/foo.pdf` -> root/onedrive/sara.hoffmann/foo.pdf
        if normalized_path.startswith("/data/"):
            rel = normalized_path[len("/data/"):]
        else:
            rel = normalized_path.lstrip("/")
        return (self.root / rel).resolve()
