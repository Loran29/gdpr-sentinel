"""Presidio analyzer with custom regex recognizers + EN/DE NLP engines.

Engines are loaded lazily and cached. The Presidio wrappers map built-in entity
names to our `EntityType` enum so the rest of the pipeline only sees our values.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from core.enums import EntityType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public dataclass
# ---------------------------------------------------------------------------


@dataclass
class PresidioEntity:
    type: str  # one of EntityType values
    value: str
    context: str
    detector: str  # "presidio" | "regex"
    confidence: float


# ---------------------------------------------------------------------------
# Mapping from Presidio's built-in entity names to our enum.
# ---------------------------------------------------------------------------

PRESIDIO_TO_ENUM = {
    "PERSON": EntityType.PERSON_NAME.value,
    "EMAIL_ADDRESS": EntityType.EMAIL_ADDRESS.value,
    "PHONE_NUMBER": EntityType.PHONE_NUMBER.value,
    "LOCATION": EntityType.LOCATION.value,
    "DATE_TIME": EntityType.DATE.value,
    "IBAN_CODE": EntityType.IBAN.value,
    "ORGANIZATION": EntityType.ORGANIZATION_NAME.value,
}


# ---------------------------------------------------------------------------
# Custom regex recognizers — applied alongside Presidio. Score 1.0 for hard regex.
# ---------------------------------------------------------------------------

CUSTOM_REGEX_RECOGNIZERS = [
    (EntityType.EMPLOYEE_ID.value, re.compile(r"\bE-\d{5}\b"), 1.0),
    (EntityType.GERMAN_VAT_ID.value, re.compile(r"\bDE\d{9}\b"), 1.0),
    (EntityType.FINANCIAL_AMOUNT.value, re.compile(r"\b\d+[.,]\d{2}\s*EUR\b"), 1.0),
    # Postal code with a following capitalized word (city) — looser is too noisy.
    (EntityType.POSTAL_CODE.value, re.compile(r"\b\d{5}\b(?=\s+[A-ZÄÖÜ])"), 0.85),
    # German phone numbers: +49 or 0 prefix, various formats.
    (EntityType.PHONE_NUMBER.value, re.compile(r"\+49[\s\-]?[\d][\d\s\-]{6,14}\d|\b0\d{2,4}[\s\-\/]?\d{3,}[\d\s\-]{2,}"), 0.9),
]


# ---------------------------------------------------------------------------
# Lazy Presidio analyzer init.
# ---------------------------------------------------------------------------

_analyzer = None
_analyzer_lock = __import__("threading").Lock()
_analyzer_built = False  # distinguishes "not built yet" from "built but None (no models)"


def _build_analyzer():
    """Build a multi-language Presidio AnalyzerEngine (en + de).

    Falls back gracefully if either spaCy model is missing — the regex
    recognizers will still run.
    """
    try:
        from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
        from presidio_analyzer.nlp_engine import NlpEngineProvider
    except Exception as exc:  # noqa: BLE001
        logger.warning("Presidio not importable: %s — regex-only mode", exc)
        return None

    nlp_configuration = {
        "nlp_engine_name": "spacy",
        "models": [
            {"lang_code": "en", "model_name": "en_core_web_lg"},
            {"lang_code": "de", "model_name": "de_core_news_lg"},
        ],
    }

    try:
        provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
        nlp_engine = provider.create_engine()
    except Exception as exc:  # noqa: BLE001
        logger.warning("spaCy models missing (%s) — regex-only mode", exc)
        return None

    registry = RecognizerRegistry(supported_languages=["en", "de"])
    registry.load_predefined_recognizers(languages=["en", "de"])

    analyzer = AnalyzerEngine(
        nlp_engine=nlp_engine,
        registry=registry,
        supported_languages=["en", "de"],
    )
    return analyzer


def _get_analyzer():
    """Return the shared AnalyzerEngine, building it exactly once.

    Thread-safe double-checked locking: the scan pipeline runs files across a
    ThreadPoolExecutor, so without this lock the first scan could have several
    threads building the (expensive, ~hundreds of MB) spaCy analyzer at the same
    time. `_analyzer_built` lets us cache a legitimate None (no spaCy models →
    regex-only mode) without re-attempting the costly build on every call.
    """
    global _analyzer, _analyzer_built
    if _analyzer_built:
        return _analyzer
    with _analyzer_lock:
        if not _analyzer_built:
            _analyzer = _build_analyzer()
            _analyzer_built = True
    return _analyzer


# ---------------------------------------------------------------------------
# Lightweight language detection (no extra dependency)
# ---------------------------------------------------------------------------

# Frequent German function words + endings. Their presence is a strong signal
# the document is German, so we should run the German spaCy engine rather than
# the English one (which mis-handles German names/locations).
_GERMAN_MARKERS = (
    " der ", " die ", " das ", " und ", " mit ", " von ", " für ", " ist ",
    " nicht ", " sich ", " wird ", " den ", " dem ", " ein ", " eine ", " auf ",
    " bei ", " auch ", " werden ", " sehr ", " geehrte ", " herr ", " frau ",
    "ä", "ö", "ü", "ß", "Geburtsdatum", "Krankenversicherung", "Anschrift",
    "Personalnummer", "Abteilung", "Datum", "Unterschrift",
)


def detect_language(text: str) -> str:
    """Return 'de' if the text looks German, else 'en'. Cheap, deterministic.

    Counts German marker hits in the (lowercased, padded) text. A handful of
    hits is enough — German docs trip many markers; English docs trip ~none.
    """
    if not text:
        return "en"
    sample = (" " + text[:3000].lower() + " ")
    hits = sum(sample.count(m.lower()) for m in _GERMAN_MARKERS)
    return "de" if hits >= 3 else "en"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def analyze(text: str, language: str = "auto") -> list[PresidioEntity]:
    """Run Presidio + custom regexes over `text`. Returns deduplicated entities.

    `language="auto"` (default) detects EN vs DE per-document and routes to the
    matching spaCy engine. Pass "en"/"de" explicitly to override.
    """
    if not text or not text.strip():
        return []

    if language == "auto":
        language = detect_language(text)

    out: list[PresidioEntity] = []

    # 1. Custom regex recognizers — always run, fast, deterministic.
    for entity_type, pattern, score in CUSTOM_REGEX_RECOGNIZERS:
        for m in pattern.finditer(text):
            value = m.group(0).strip()
            out.append(
                PresidioEntity(
                    type=entity_type,
                    value=value,
                    context=_context_window(text, m.start(), m.end()),
                    detector="regex",
                    confidence=score,
                )
            )

    # 2. Presidio NER — best-effort. Falls back to English if the chosen
    #    language engine is unavailable for any reason.
    analyzer = _get_analyzer()
    if analyzer is not None:
        try:
            try:
                results = analyzer.analyze(text=text, language=language)
            except ValueError:
                # Requested language not loaded in the registry — fall back to EN.
                results = analyzer.analyze(text=text, language="en")
            for r in results:
                # Per-type confidence thresholds.
                # Phone numbers score lower by design in Presidio — use a relaxed floor.
                min_score = 0.6 if r.entity_type == "PHONE_NUMBER" else 0.7
                if r.score < min_score:
                    continue
                presidio_type = r.entity_type
                mapped = PRESIDIO_TO_ENUM.get(presidio_type)
                if mapped is None:
                    mapped = EntityType.OTHER.value
                value = text[r.start : r.end].strip()
                if not value:
                    continue
                out.append(
                    PresidioEntity(
                        type=mapped,
                        value=value,
                        context=(
                            f"Presidio {presidio_type} " + _context_window(text, r.start, r.end)
                        ),
                        detector="presidio",
                        confidence=float(r.score),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Presidio analysis failed: %s", exc)

    return _dedupe(out)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _context_window(text: str, start: int, end: int, span: int = 30) -> str:
    """A short snippet around the match for the `context` field."""
    a = max(0, start - span)
    b = min(len(text), end + span)
    snippet = text[a:b].replace("\n", " ").strip()
    return snippet[:120]


def _dedupe(entities: list[PresidioEntity]) -> list[PresidioEntity]:
    """De-dupe by (type, value). Keep the first (regex wins over Presidio)."""
    seen: set[tuple[str, str]] = set()
    out: list[PresidioEntity] = []
    for e in entities:
        key = (e.type, e.value.casefold())
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out
