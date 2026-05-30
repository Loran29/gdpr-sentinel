"""pdfplumber wrapper. Returns per-page text for downstream entity detection."""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PageText:
    page_number: int
    text: str


def extract_text(pdf_bytes: bytes) -> list[PageText]:
    """Extract per-page text from a PDF.

    Uses pdfplumber as the primary path; if pdfplumber returns nothing usable
    (which can happen on the synthetic placeholder PDFs the seeder writes when
    upstream samples are unreachable), we fall back to a crude regex sweep over
    the raw bytes so the pipeline still has *something* to classify.
    """
    pages: list[PageText] = []
    try:
        import pdfplumber  # local import — heavy

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                txt = page.extract_text() or ""
                pages.append(PageText(page_number=i, text=txt))
    except Exception as exc:  # noqa: BLE001
        logger.warning("pdfplumber failed; falling back to byte-sweep: %s", exc)

    if not any(p.text.strip() for p in pages):
        # Crude fallback: pull text segments wrapped in ()Tj operators that the
        # placeholder PDF generator emits.
        recovered = "\n".join(re.findall(r"\(([^()]+)\)\s*Tj", pdf_bytes.decode("latin-1", errors="ignore")))
        if recovered.strip():
            return [PageText(page_number=1, text=recovered)]

    return pages or [PageText(page_number=1, text="")]
