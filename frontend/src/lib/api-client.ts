import { AuditEntry, DashboardStats, Finding, OwnerSummary, Scan, User } from "@/types/models";
import {
  api_endpoints,
  audit_log_entries,
  base_scans,
  dashboard_stats,
  initial_findings,
  owner_summaries,
  resource_intensity,
  users
} from "@/src/lib/mock-data";
import {
  ApiClientQueryTypes,
  ApiClientSource,
  ApiErrorEnvelope,
  ApiMutationError,
  ApiMutationResult,
  BackendAction,
  DisplayReviewStatus,
  ResourceHealth,
  RetentionView,
  ScanRunResponse,
  UiAction
} from "@/src/lib/api-types";

const API_BASE_URL_DEFAULT = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 8000;

const api_base_url = (process.env.NEXT_PUBLIC_API_BASE_URL ?? API_BASE_URL_DEFAULT).replace(/\/+$/, "");
const use_mock_api =
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true" || process.env.NEXT_PUBLIC_API_MOCK_MODE === "true";

export const api_runtime_config = {
  api_base_url,
  mock_mode: use_mock_api
};

function clone_value<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function is_error_envelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const root = value as Record<string, unknown>;
  if (!root.error || typeof root.error !== "object") {
    return false;
  }

  const error_payload = root.error as Record<string, unknown>;
  return typeof error_payload.code === "string" && typeof error_payload.message === "string";
}

function normalize_error(error: ApiMutationError): ApiMutationError {
  if (error.code === "CONFIRMATION_REQUIRED") {
    return {
      ...error,
      confirmation_required: true
    };
  }

  return error;
}

function now_utc_iso() {
  return new Date().toISOString();
}

function to_query_string(query?: Record<string, string | number | undefined>): string {
  if (!query) {
    return "";
  }

  const query_params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    query_params.set(key, String(value));
  });

  const as_string = query_params.toString();
  return as_string ? `?${as_string}` : "";
}

function with_url(path: string, query?: Record<string, string | number | undefined>) {
  const normalized_path = path.startsWith("/") ? path : `/${path}`;
  return `${api_base_url}${normalized_path}${to_query_string(query)}`;
}

async function safe_request<T>({
  path,
  method = "GET",
  query,
  user_id,
  body
}: {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  user_id?: string;
  body?: unknown;
}): Promise<ApiMutationResult<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (user_id) {
    headers["X-User-Id"] = user_id;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(with_url(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });

    const raw_text = await response.text();
    const parsed_body: unknown = raw_text ? JSON.parse(raw_text) : null;

    if (!response.ok) {
      if (is_error_envelope(parsed_body)) {
        return {
          ok: false,
          source: "api",
          error: normalize_error({
            ...parsed_body.error,
            http_status: response.status
          })
        };
      }

      return {
        ok: false,
        source: "api",
        error: {
          code: "HTTP_ERROR",
          message: `Request failed with status ${response.status}`,
          details: raw_text ? { body: raw_text } : null,
          http_status: response.status
        }
      };
    }

    if (is_error_envelope(parsed_body)) {
      return {
        ok: false,
        source: "api",
        error: normalize_error({
          ...parsed_body.error,
          http_status: response.status
        })
      };
    }

    return {
      ok: true,
      source: "api",
      data: parsed_body as T
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";

    return {
      ok: false,
      source: "api",
      error: {
        code: "NETWORK_ERROR",
        message,
        details: null
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function query_with_fallback<T>({
  path,
  query,
  user_id,
  fallback
}: {
  path: string;
  query?: Record<string, string | number | undefined>;
  user_id?: string;
  fallback: () => T;
}): Promise<T> {
  if (api_runtime_config.mock_mode) {
    return fallback();
  }

  const result = await safe_request<T>({ path, query, user_id, method: "GET" });
  if (result.ok) {
    return result.data;
  }

  return fallback();
}

function find_scan_in_mock_data(scan_id: string): Scan | null {
  return base_scans.find((scan) => scan.id === scan_id) ?? null;
}

function find_finding_in_mock_data(finding_id: string): Finding | null {
  return initial_findings.find((finding) => finding.id === finding_id) ?? null;
}

function build_retention_view_from_mock_data(): RetentionView {
  const grouped = new Map<string, { document_type: string; retention_recommendation: string; findings_count: number }>();

  for (const finding of initial_findings) {
    const key = `${finding.document_type}__${finding.retention_recommendation}`;
    const current = grouped.get(key);
    if (current) {
      current.findings_count += 1;
      continue;
    }

    grouped.set(key, {
      document_type: finding.document_type,
      retention_recommendation: finding.retention_recommendation,
      findings_count: 1
    });
  }

  return {
    generated_at: now_utc_iso(),
    total_findings: initial_findings.length,
    rows: [...grouped.values()]
  };
}

function build_resource_health_from_mock_data(): ResourceHealth {
  return {
    status: resource_intensity.cpu_load_pct <= 80 ? "ok" : "degraded",
    cpu_load_pct: resource_intensity.cpu_load_pct,
    memory_peak_mb: resource_intensity.memory_peak_mb,
    files_skipped: resource_intensity.files_skipped,
    text_extraction_avoided: resource_intensity.text_extraction_avoided,
    llm_calls_skipped_in_delta_scan: resource_intensity.llm_calls_skipped_in_delta_scan,
    checked_at: now_utc_iso()
  };
}

export function map_backend_status_to_display(status: string): DisplayReviewStatus {
  if (
    status === "pending" ||
    status === "confirmed_business_need" ||
    status === "acknowledged_cleanup" ||
    status === "kept_business_need" ||
    status === "marked_false_positive" ||
    status === "deleted"
  ) {
    return status;
  }

  if (status === "keep_business_need") {
    return "kept_business_need";
  }

  if (status === "mark_false_positive") {
    return "marked_false_positive";
  }

  if (status === "delete") {
    return "deleted";
  }

  return "pending";
}

export function map_ui_action_to_backend_action(
  action: UiAction,
  options?: { explicit_delete?: boolean }
): BackendAction {
  if (action === "confirmed_business_need" || action === "keep_business_need") {
    return "keep_business_need";
  }

  if (action === "acknowledged_cleanup") {
    return options?.explicit_delete ? "delete" : "mark_false_positive";
  }

  if (action === "mark_false_positive") {
    return "mark_false_positive";
  }

  return "delete";
}

export async function get_users(): Promise<ApiClientQueryTypes["users"]> {
  return query_with_fallback<User[]>({
    path: "/users",
    fallback: () => clone_value(users)
  });
}

export async function get_findings_by_user(
  user_id: string,
  status?: string
): Promise<ApiClientQueryTypes["findings_by_user"]> {
  return query_with_fallback<Finding[]>({
    path: `/findings/by-user/${user_id}`,
    query: { status },
    user_id,
    fallback: () => {
      const current_user = users.find((candidate) => candidate.id === user_id) ?? null;
      const filtered = initial_findings.filter((finding) => {
        const is_direct_owner = finding.owner_user_id === user_id;
        const is_mod_owner = Boolean(current_user?.is_master_of_data && finding.master_of_data_id === user_id);
        const status_match = status ? finding.review_status === status : true;
        return status_match && (is_direct_owner || is_mod_owner);
      });

      return clone_value(filtered);
    }
  });
}

export async function get_finding(finding_id: string): Promise<ApiClientQueryTypes["finding"]> {
  return query_with_fallback<Finding | null>({
    path: `/findings/${finding_id}`,
    fallback: () => clone_value(find_finding_in_mock_data(finding_id))
  });
}

export async function get_admin_dashboard(): Promise<ApiClientQueryTypes["admin_dashboard"]> {
  return query_with_fallback<DashboardStats>({
    path: "/admin/dashboard",
    fallback: () => clone_value(dashboard_stats)
  });
}

export async function get_admin_owners(): Promise<ApiClientQueryTypes["admin_owners"]> {
  return query_with_fallback<OwnerSummary[]>({
    path: "/admin/owners",
    fallback: () => clone_value(owner_summaries)
  });
}

export async function get_recent_scans(): Promise<ApiClientQueryTypes["recent_scans"]> {
  return query_with_fallback<Scan[]>({
    path: "/scans",
    query: { limit: 10, offset: 0 },
    fallback: () => clone_value(base_scans.slice(0, 10))
  });
}

export async function get_scan(scan_id: string): Promise<ApiClientQueryTypes["scan"]> {
  return query_with_fallback<Scan | null>({
    path: `/scan/${scan_id}`,
    fallback: () => clone_value(find_scan_in_mock_data(scan_id))
  });
}

export async function run_full_scan(source_path: string): Promise<ApiMutationResult<ScanRunResponse>> {
  if (api_runtime_config.mock_mode) {
    return {
      ok: true,
      source: "mock",
      data: {
        scan_id: `scan_${Date.now()}`,
        status: "running"
      }
    };
  }

  return safe_request<ScanRunResponse>({
    path: "/scan/run",
    method: "POST",
    body: { source_path }
  });
}

export async function run_delta_scan(source_path: string): Promise<ApiMutationResult<ScanRunResponse>> {
  if (api_runtime_config.mock_mode) {
    return {
      ok: true,
      source: "mock",
      data: {
        scan_id: `scan_${Date.now()}`,
        status: "running",
        files_to_process: 3
      }
    };
  }

  return safe_request<ScanRunResponse>({
    path: "/scan/delta",
    method: "POST",
    body: { source_path }
  });
}

export async function submit_finding_action(
  finding_id: string,
  action: string,
  note: string,
  user_id: string,
  confirm?: boolean
): Promise<ApiMutationResult<Finding>> {
  const mapped_action = map_ui_action_to_backend_action(action as UiAction, {
    explicit_delete: confirm === true && action === "acknowledged_cleanup"
  });

  if (api_runtime_config.mock_mode) {
    const fallback_finding = find_finding_in_mock_data(finding_id);
    if (!fallback_finding) {
      return {
        ok: false,
        source: "mock",
        error: {
          code: "FINDING_NOT_FOUND",
          message: `No finding with id '${finding_id}' exists`,
          details: { finding_id }
        }
      };
    }

    const mapped_status =
      mapped_action === "keep_business_need" ? "confirmed_business_need" : "acknowledged_cleanup";

    return {
      ok: true,
      source: "mock",
      data: {
        ...clone_value(fallback_finding),
        review_status: mapped_status,
        reviewed_at: now_utc_iso(),
        reviewed_by_user_id: user_id,
        review_note: note
      }
    };
  }

  const result = await safe_request<Finding>({
    path: `/findings/${finding_id}/action`,
    method: "POST",
    user_id,
    body: {
      action: mapped_action,
      note,
      confirm: confirm === true
    }
  });

  if (!result.ok) {
    return {
      ...result,
      error: normalize_error(result.error)
    };
  }

  return result;
}

export async function get_audit_log(): Promise<ApiClientQueryTypes["audit_log"]> {
  return query_with_fallback<AuditEntry[]>({
    path: "/admin/audit",
    query: { limit: 50, offset: 0 },
    fallback: () => clone_value(audit_log_entries)
  });
}

export async function get_retention_view(): Promise<ApiClientQueryTypes["retention_view"]> {
  return query_with_fallback<RetentionView>({
    path: "/admin/retention",
    fallback: () => clone_value(build_retention_view_from_mock_data())
  });
}

export async function get_resource_health(): Promise<ApiClientQueryTypes["resource_health"]> {
  return query_with_fallback<ResourceHealth>({
    path: "/admin/health",
    fallback: () => clone_value(build_resource_health_from_mock_data())
  });
}

export function get_supported_api_endpoints() {
  return clone_value(api_endpoints);
}

export function get_api_mode(): ApiClientSource {
  return api_runtime_config.mock_mode ? "mock" : "api";
}
