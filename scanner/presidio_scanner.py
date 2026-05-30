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
    global _analyzer
    if _analyzer is None:
        _analyzer = _build_analyzer()
    return _analyzer


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def analyze(text: str, language: str = "en") -> list[PresidioEntity]:
    """Run Presidio + custom regexes over `text`. Returns deduplicated entities."""
    if not text or not text.strip():
        return []

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

    # 2. Presidio NER — best-effort.
    analyzer = _get_analyzer()
    if analyzer is not None:
        try:
            results = analyzer.analyze(text=text, language=language)
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
