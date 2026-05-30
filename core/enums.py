"""Single source of truth for enums shared with the frontend.

Mirrors CONTRACT.md §6 verbatim. Changes here MUST be coordinated with the frontend
(types/api.ts) and bumped in CONTRACT.md.
"""

from enum import Enum


class DocumentType(str, Enum):
    EXPENSE_REPORT = "expense_report"
    IT_ACCESS_REQUEST = "it_access_request"
    INCIDENT_REPORT = "incident_report"
    SUPPLIER_ONBOARDING = "supplier_onboarding"
    TRAINING_EVALUATION = "training_evaluation"
    MEDICAL_RECORD = "medical_record"
    FINANCIAL_AUTHORIZATION = "financial_authorization"
    UNKNOWN = "unknown"


class SensitivityLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ReviewStatus(str, Enum):
    PENDING = "pending"
    DELETED = "deleted"
    MARKED_FALSE_POSITIVE = "marked_false_positive"
    KEPT_BUSINESS_NEED = "kept_business_need"


class UserAction(str, Enum):
    DELETE = "delete"
    MARK_FALSE_POSITIVE = "mark_false_positive"
    KEEP_BUSINESS_NEED = "keep_business_need"


class OwnerType(str, Enum):
    DIRECT = "direct"
    MASTER_OF_DATA = "master_of_data"


class ScanType(str, Enum):
    FULL = "full"
    DELTA = "delta"


class ScanStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EntityType(str, Enum):
    PERSON_NAME = "PERSON_NAME"
    EMPLOYEE_ID = "EMPLOYEE_ID"
    DEPARTMENT = "DEPARTMENT"
    JOB_TITLE = "JOB_TITLE"
    EMAIL_ADDRESS = "EMAIL_ADDRESS"
    PHONE_NUMBER = "PHONE_NUMBER"
    POSTAL_ADDRESS = "POSTAL_ADDRESS"
    POSTAL_CODE = "POSTAL_CODE"
    ORGANIZATION_NAME = "ORGANIZATION_NAME"
    GERMAN_VAT_ID = "GERMAN_VAT_ID"
    IBAN = "IBAN"
    DATE = "DATE"
    FINANCIAL_AMOUNT = "FINANCIAL_AMOUNT"
    LOCATION = "LOCATION"
    SYSTEM_IDENTIFIER = "SYSTEM_IDENTIFIER"
    OTHER = "OTHER"


class UserRole(str, Enum):
    EMPLOYEE = "employee"
    ADMIN = "admin"


# String list mirrors for places that prefer plain lists (e.g. JSON Schema gen).
DOCUMENT_TYPES = [e.value for e in DocumentType]
SENSITIVITY_LEVELS = [e.value for e in SensitivityLevel]
REVIEW_STATUSES = [e.value for e in ReviewStatus]
USER_ACTIONS = [e.value for e in UserAction]
OWNER_TYPES = [e.value for e in OwnerType]
SCAN_TYPES = [e.value for e in ScanType]
SCAN_STATUSES = [e.value for e in ScanStatus]
ENTITY_TYPES = [e.value for e in EntityType]
