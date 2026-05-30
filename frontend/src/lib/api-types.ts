import { AuditEntry, DashboardStats, Finding, OwnerSummary, Scan, User } from "@/types/models";

export type ApiClientSource = "api" | "mock";

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
};

export type ApiErrorEnvelope = {
  error: ApiErrorPayload;
};

export type ApiMutationError = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
  http_status?: number;
  confirmation_required?: boolean;
};

export type ApiMutationResult<T> =
  | {
      ok: true;
      source: ApiClientSource;
      data: T;
    }
  | {
      ok: false;
      source: ApiClientSource;
      error: ApiMutationError;
    };

export type BackendAction = "keep_business_need" | "mark_false_positive" | "delete";

export type UiAction =
  | "confirmed_business_need"
  | "acknowledged_cleanup"
  | "keep_business_need"
  | "mark_false_positive"
  | "delete";

export type DisplayReviewStatus =
  | "pending"
  | "confirmed_business_need"
  | "acknowledged_cleanup"
  | "kept_business_need"
  | "marked_false_positive"
  | "deleted";

export type ScanRunResponse = {
  scan_id: string;
  status: "running" | "completed" | "failed";
  files_to_process?: number;
};

export type RetentionViewRow = {
  document_type: string;
  retention_recommendation: string;
  findings_count: number;
};

export type RetentionView = {
  generated_at: string;
  total_findings: number;
  rows: RetentionViewRow[];
};

export type ResourceHealth = {
  status: "ok" | "degraded";
  cpu_load_pct: number;
  memory_peak_mb: number;
  files_skipped: number;
  text_extraction_avoided: number;
  llm_calls_skipped_in_delta_scan: number;
  checked_at: string;
};

export type ApiClientQueryTypes = {
  users: User[];
  findings_by_user: Finding[];
  finding: Finding | null;
  admin_dashboard: DashboardStats;
  admin_owners: OwnerSummary[];
  recent_scans: Scan[];
  scan: Scan | null;
  audit_log: AuditEntry[];
  retention_view: RetentionView;
  resource_health: ResourceHealth;
};
