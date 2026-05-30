"""OpenRouter (OpenAI-compatible) classifier for document type, sensitivity, reasoning, and
extra entities the deterministic recognizers missed.

Falls back to a filename-based stub when OPENROUTER_API_KEY is unset, so the
backend boots without an API key for hackathon dev.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from core.config import get_settings
from core.enums import DocumentType, EntityType, SensitivityLevel
from scanner.presidio_scanner import PresidioEntity

logger = logging.getLogger(__name__)

CACHE_DIR = Path(".llm_cache")


def _cache_key(text: str, model: str) -> str:
    return hashlib.sha256(f"{model}::{text}".encode("utf-8")).hexdigest()


def _cache_get(key: str) -> dict | None:
    path = CACHE_DIR / f"{key}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    return None


def _cache_put(key: str, value: dict) -> None:
    try:
        CACHE_DIR.mkdir(exist_ok=True)
        (CACHE_DIR / f"{key}.json").write_text(
            json.dumps(value, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:  # noqa: BLE001
        pass


# DO NOT PARAPHRASE — used verbatim per CONTRACT.md.
LLM_SYSTEM_PROMPT = """You are a GDPR compliance classifier for a German corporate environment.

You receive: (1) the text of one document, (2) a list of entities already detected by deterministic recognizers.

Your job: return ONLY a JSON object with this exact shape:
{
  "document_type": "expense_report" | "it_access_request" | "incident_report" | "supplier_onboarding" | "training_evaluation" | "unknown",
  "sensitivity_level": "high" | "medium" | "low",
  "reasoning": "<2-4 sentences explaining the GDPR relevance, citing the specific personal data found and the most relevant legal basis (Art. 6 GDPR sub-clause, German retention obligation if applicable)>",
  "retention_recommendation": "<one sentence with concrete retention period and trigger event>",
  "additional_entities": [
    {"type": "<ENTITY_TYPE>", "value": "<exact string from document>", "context": "<which field, which page>"}
  ]
}

Rules:
- Use ONLY these entity types: PERSON_NAME, EMPLOYEE_ID, DEPARTMENT, JOB_TITLE, EMAIL_ADDRESS, PHONE_NUMBER, POSTAL_ADDRESS, POSTAL_CODE, ORGANIZATION_NAME, GERMAN_VAT_ID, IBAN, DATE, FINANCIAL_AMOUNT, LOCATION, SYSTEM_IDENTIFIER, OTHER.
- Only include entities in `additional_entities` that the deterministic recognizers MISSED. Do not duplicate.
- `sensitivity_level`: high = contains direct personal identifiers (name + ID, name + financial, name + health); medium = contains personal data but lower stakes (training, B2B contact); low = minimal or only indirect personal data.
- `reasoning` MUST reference at least one specific entity value from the document. Generic reasoning is rejected.
- Output ONLY the JSON. No prose, no markdown fences, no preamble."""


@dataclass
class LLMResult:
    document_type: str
    sensitivity_level: str
    reasoning: str
    retention_recommendation: str
    additional_entities: list[dict]


_FAILURE_RESULT = {
    "document_type": DocumentType.UNKNOWN.value,
    "sensitivity_level": SensitivityLevel.LOW.value,
    "reasoning": "LLM classification failed",
    "retention_recommendation": "Manual review required",
    "additional_entities": [],
}


# ---------------------------------------------------------------------------
# OpenAI client (pointed at OpenRouter) — lazy singleton
# ---------------------------------------------------------------------------

_client = None


def _get_client():
    global _client
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None
    if _client is None:
        try:
            from openai import OpenAI
        except Exception as exc:  # noqa: BLE001
            logger.warning("openai SDK not importable: %s — using stub", exc)
            return None
        _client = OpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "GDPR Sentinel",
            },
        )
    return _client


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


_live_mode_logged = False


def classify(text: str, presidio_entities: list[PresidioEntity], filename_hint: str = "") -> dict:
    """Classify a document. Returns a dict matching the LLM schema."""
    global _live_mode_logged
    settings = get_settings()
    if not settings.has_llm:
        logger.warning("LLM stub mode active (no OPENROUTER_API_KEY)")
        return _stub_classify(text, presidio_entities, filename_hint)

    client = _get_client()
    if client is None:
        logger.warning("LLM stub mode active (client init failed)")
        return _stub_classify(text, presidio_entities, filename_hint)

    if not _live_mode_logged:
        logger.info("LLM live mode active (model=%s)", settings.openrouter_model)
        _live_mode_logged = True

    # Check disk cache — keyed on model + document text so identical input always
    # returns identical output, which is also our reproducibility guarantee.
    cache_key = _cache_key(text[:8000], settings.openrouter_model)
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.debug("LLM cache hit for key %s", cache_key[:12])
        return cached

    user_message = _build_user_message(text, presidio_entities)

    def _call(retry: bool = False) -> str:
        system = LLM_SYSTEM_PROMPT
        if retry:
            system += "\n\nYour previous response was not valid JSON. Return ONLY the JSON object."
        response = client.chat.completions.create(
            model=settings.openrouter_model,
            temperature=0,
            seed=42,
            max_tokens=1024,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""

    try:
        raw = _call()
        result = _parse_or_raise(raw)
    except _BadJSON:
        try:
            raw = _call(retry=True)
            result = _parse_or_raise(raw)
        except _BadJSON:
            logger.error("LLM returned non-JSON twice; using failure result")
            return dict(_FAILURE_RESULT)
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM call failed: %s", exc)
        return dict(_FAILURE_RESULT)

    _cache_put(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


class _BadJSON(Exception):
    pass


def _build_user_message(text: str, entities: list[PresidioEntity]) -> str:
    detected = [
        {"type": e.type, "value": e.value, "detector": e.detector}
        for e in entities
    ]
    return (
        "Document text:\n---\n"
        + text[:8000]  # generous budget; full sample PDFs are far smaller
        + "\n---\n\nDeterministic recognizers already detected:\n"
        + json.dumps(detected, ensure_ascii=False, indent=2)
    )


def _parse_or_raise(raw: str) -> dict:
    """Strip code fences and parse JSON. Raise _BadJSON on failure."""
    s = raw.strip()
    # Be defensive about ```json ... ``` even though we tell the LLM not to.
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    try:
        parsed = json.loads(s)
    except json.JSONDecodeError as exc:
        raise _BadJSON(str(exc)) from exc

    # Coerce/validate enums softly — fall back to UNKNOWN/LOW if model wandered.
    valid_doc = {e.value for e in DocumentType}
    valid_sens = {e.value for e in SensitivityLevel}
    valid_ent = {e.value for e in EntityType}
    if parsed.get("document_type") not in valid_doc:
        parsed["document_type"] = DocumentType.UNKNOWN.value
    if parsed.get("sensitivity_level") not in valid_sens:
        parsed["sensitivity_level"] = SensitivityLevel.LOW.value

    cleaned_extra = []
    for e in parsed.get("additional_entities", []) or []:
        t = e.get("type")
        if t not in valid_ent:
            t = EntityType.OTHER.value
        cleaned_extra.append(
            {
                "type": t,
                "value": str(e.get("value", "")).strip(),
                "context": str(e.get("context", "")).strip(),
            }
        )
    parsed["additional_entities"] = [e for e in cleaned_extra if e["value"]]
    parsed.setdefault("reasoning", "")
    parsed.setdefault("retention_recommendation", "")
    return parsed


# ---------------------------------------------------------------------------
# Stub classifier — used when no API key is configured.
# ---------------------------------------------------------------------------

_STUB_BY_FILENAME = [
    ("expense_report", "expense"),
    ("it_access_request", "it_access"),
    ("it_access_request", "access_request"),
    ("incident_report", "incident"),
    ("supplier_onboarding", "supplier"),
    ("training_evaluation", "training"),
]

_STUB_REASONING = {
    "expense_report": "Expense reimbursement record containing employee name, employee ID, and a financial amount; processed under GDPR Art. 6(1)(b) (contract necessity) with a §147 AO 10-year fiscal retention obligation.",
    "it_access_request": "IT access provisioning record naming the requester, manager, and approver alongside system identifier; processed under GDPR Art. 6(1)(f) (legitimate interest in access governance).",
    "incident_report": "Security incident record describing personal data of named individuals and a specific location; processed under GDPR Art. 6(1)(c) (legal obligation under §33 BDSG / GDPR Art. 33).",
    "supplier_onboarding": "Supplier onboarding record containing a named contact email, postal address, and German VAT ID; mostly B2B but the contact is a named individual under GDPR Art. 4(1).",
    "training_evaluation": "Training feedback record containing the participant's name and free-text comments; processed under GDPR Art. 6(1)(f) (legitimate interest in training records).",
    "unknown": "Document could not be classified automatically; manual review recommended.",
}

_STUB_RETENTION = {
    "expense_report": "Retain 10 years from end of fiscal year for §147 AO compliance, then delete.",
    "it_access_request": "Retain for the lifetime of the access plus 1 year for audit, then delete.",
    "incident_report": "Retain 5 years from incident closure for audit and §33 BDSG compliance, then delete.",
    "supplier_onboarding": "Retain for the duration of the supplier relationship plus 10 years per §147 AO, then delete.",
    "training_evaluation": "Retain 2 years for HR records, then delete.",
    "unknown": "Manual review required.",
}

_STUB_SENSITIVITY = {
    "expense_report": "high",
    "it_access_request": "high",
    "incident_report": "high",
    "supplier_onboarding": "medium",
    "training_evaluation": "low",
    "unknown": "low",
}


def _stub_classify(text: str, entities: list[PresidioEntity], filename_hint: str) -> dict:
    name = filename_hint.lower()
    doc_type = DocumentType.UNKNOWN.value
    for candidate, needle in _STUB_BY_FILENAME:
        if needle in name:
            doc_type = candidate
            break

    # Reference at least one detected entity value in the reasoning so the demo
    # doesn't show a generic boilerplate message.
    cited = next((e.value for e in entities if e.type in {"PERSON_NAME", "EMPLOYEE_ID", "ORGANIZATION_NAME"}), None)
    reasoning = _STUB_REASONING[doc_type]
    if cited:
        reasoning = f"{reasoning} Detected: {cited}."

    return {
        "document_type": doc_type,
        "sensitivity_level": _STUB_SENSITIVITY[doc_type],
        "reasoning": reasoning,
        "retention_recommendation": _STUB_RETENTION[doc_type],
        "additional_entities": [],
    }
