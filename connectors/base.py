"""Abstract Connector — all storage backends implement this interface.

The pipeline talks only to this; swapping local-folder for Microsoft Graph is a
two-line change. See `graph_stub.py` for the SDK calls a real implementation
would make.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class FileMeta:
    path: str
    name: str
    size_bytes: int
    last_modified: datetime
    mime_type: str


class Connector(ABC):
    @abstractmethod
    def list_files(self) -> list[FileMeta]:
        """Enumerate files visible to this connector. Recursive."""

    @abstractmethod
    def read_file(self, path: str) -> bytes:
        """Return raw bytes for the file at `path` (path as returned by list_files)."""

    @abstractmethod
    def get_owner(self, path: str) -> str | None:
        """Return the user_id of the direct owner, or None if there is no direct owner.

        When None is returned, the pipeline falls back to Master-of-Data routing.
        """
