"""One-shot live verification that the OpenRouter classifier is engaged."""

import json
import sys

sys.path.insert(0, ".")

from scanner.llm_classifier import classify

SAMPLE_TEXT = (
    "Expense Reimbursement. Employee: Sara Hoffmann (E-20491). "
    "Department: Project Management. Amount: 128.40 EUR."
)

result = classify(SAMPLE_TEXT, [], filename_hint="Expense_Report_Example_A.pdf")

print(json.dumps(result, indent=2, ensure_ascii=False))

assert result["document_type"] == "expense_report", (
    f"Expected expense_report, got {result['document_type']!r}"
)
assert len(result.get("reasoning", "")) > 50, "Reasoning too short"
reasoning = result.get("reasoning", "")
assert "Sara Hoffmann" in reasoning or "E-20491" in reasoning, (
    f"Reasoning does not cite specific entity values: {reasoning!r}"
)

print("\nALL ASSERTIONS PASSED — live LLM is engaged")
