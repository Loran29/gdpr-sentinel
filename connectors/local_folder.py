"""LocalFolderConnector — reads PDFs from a directory tree on disk.

This is the connector used in the demo. Owner attribution comes from
`master_of_data.yaml#direct_owner_patterns`; if the file path matches one of those
prefixes, the matching user_id is returned.
"""

from __future__ import annotations

import mimetypes
from datetime import datetime, timezone
from pathlib import Path

import yaml

from connectors.base import Connector, FileMeta
from core.config import get_settings


class LocalFolderConnector(Connector):
    def __init__(self, root: Path | str, mod_yaml: Path | str | None = None) -> None:
        self.root = Path(root).resolve()
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
        for p in sorted(self.root.rglob("*.pdf")):
            if not p.is_file():
                continue
            stat = p.stat()
            mt, _ = mimetypes.guess_type(p.name)
            out.append(
                FileMeta(
                    path=self._normalize(p),
                    name=p.name,
                    size_bytes=stat.st_size,
                    last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                    mime_type=mt or "application/pdf",
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
