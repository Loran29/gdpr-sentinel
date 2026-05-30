export type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: "employee" | "admin";
  is_master_of_data: boolean;
};

export type Entity = {
  type:
    | "PERSON_NAME"
    | "EMPLOYEE_ID"
    | "DEPARTMENT"
    | "JOB_TITLE"
    | "EMAIL_ADDRESS"
    | "PHONE_NUMBER"
    | "POSTAL_ADDRESS"
    | "POSTAL_CODE"
    | "ORGANIZATION_NAME"
    | "GERMAN_VAT_ID"
    | "IBAN"
    | "DATE"
    | "FINANCIAL_AMOUNT"
    | "LOCATION"
    | "SYSTEM_IDENTIFIER"
    | "OTHER";
  value: string;
  context: string;
  detector: "presidio" | "regex" | "llm" | "other";
  confidence: number;
};

export type Finding = {
  id: string;
  scan_id: string;
  file_id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  file_sha256: string;
  document_type:
    | "expense_report"
    | "it_access_request"
    | "incident_report"
    | "supplier_onboarding"
    | "training_evaluation"
    | "unknown";
  sensitivity_level: "high" | "medium" | "low";
  entities: Entity[];
  reasoning: string;
  retention_recommendation: string;
  owner_user_id: string | null;
  owner_name: string;
  owner_type: "direct" | "master_of_data";
  master_of_data_id: string | null;
  scan_timestamp: string;
  review_status:
    | "pending"
    | "confirmed_business_need"
    | "acknowledged_cleanup"
    | "kept_business_need"
    | "marked_false_positive"
    | "deleted";
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type Scan = {
  id: string;
  source_id: string;
  scan_type: "full" | "delta";
  started_at: string;
  completed_at: string | null;
  duration_sec: number;
  files_processed: number;
  files_skipped: number;
  files_with_findings: number;
  total_findings: number;
  result_hash: string;
  status: "running" | "completed" | "failed";
};

export type DashboardStats = {
  total_files_scanned: number;
  total_size_bytes: number;
  files_with_findings: number;
  total_findings: number;
  scan_speed_files_per_sec: number;
  avg_file_scan_ms: number;
  precision_pct: number;
  recall_pct: number;
  f1_score: number;
  last_scan_at: string;
  last_scan_duration_sec: number;
  findings_by_document_type: Record<string, number>;
  findings_by_sensitivity: Record<string, number>;
  recent_scans: {
    id: string;
    completed_at: string;
    duration_sec: number;
    files_processed: number;
    files_skipped?: number;
    findings_count: number;
    scan_type?: "full" | "delta";
  }[];
  last_scan_timing_breakdown?: {
    extract_ms?: number;
    presidio_ms?: number;
    llm_ms?: number;
    db_ms?: number;
  } | null;
  files_past_retention?: number;
};

export type OwnerSummary = {
  user_id: string;
  name: string;
  type: "direct" | "master_of_data";
  assigned_sources: string[];
  files_assigned: number;
  pending_reviews: number;
  completed_reviews: number;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  finding_id: string;
  file_name: string;
  user: string;
  action: string;
  review_note: string;
  resulting_status:
    | "pending"
    | "confirmed_business_need"
    | "acknowledged_cleanup"
    | "kept_business_need"
    | "marked_false_positive"
    | "deleted";
};

export type SourceOption = {
  id: string;
  label: string;
  path: string;
};

export type ScanProgress = {
  progress_pct: number;
  files_processed: number;
  files_skipped: number;
  files_with_findings: number;
  duration_sec: number;
  scan_speed_files_per_sec: number;
  status: "running" | "completed";
  result_hash: string;
};

export type ReproducibilitySnapshot = {
  last_full_scan_hash: string;
  previous_full_scan_hash: string;
  matching_status: "Match" | "Mismatch";
  explanation: string;
};

export type ResourceIntensity = {
  cpu_load_pct: number;
  memory_peak_mb: number;
  llm_calls_skipped_in_delta_scan: number;
  files_skipped: number;
  text_extraction_avoided: number;
};
