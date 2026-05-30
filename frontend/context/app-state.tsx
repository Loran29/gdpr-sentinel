"use client";

import {
  createContext,
  Dispatch,
  SetStateAction,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  audit_log_entries,
  base_scans,
  dashboard_stats,
  initial_findings,
  users as mock_users,
  owner_summaries,
  reproducibility_snapshot,
  resource_intensity
} from "@/lib/mock-data";
import {
  get_finding,
  get_findings_by_user,
  get_users,
  map_backend_status_to_display,
  submit_finding_action
} from "@/src/lib/api-client";
import { AuditEntry, Finding, Scan, User } from "@/types/models";

const SELECTED_USER_STORAGE_KEY = "gdpr_sentinel_selected_user_id";

type ApplyActionPayload = {
  finding_id: string;
  review_status: "confirmed_business_need" | "acknowledged_cleanup" | "delete";
  review_note: string;
  confirm?: boolean;
};

type AppStateContextValue = {
  users: User[];
  selected_user_id: string | null;
  set_selected_user_id: Dispatch<SetStateAction<string | null>>;
  selected_user: User | null;
  is_app_state_ready: boolean;
  is_findings_loading: boolean;
  sign_in: (user_id: string) => void;
  logout: () => void;
  findings: Finding[];
  scans: Scan[];
  audit_entries: AuditEntry[];
  fetch_finding_detail: (finding_id: string) => Promise<Finding | null>;
  apply_finding_action: (payload: ApplyActionPayload) => Promise<void>;
  append_scan: (scan: Scan) => void;
};

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [users, set_users] = useState<User[]>(mock_users);
  const [selected_user_id, set_selected_user_id] = useState<string | null>(null);
  const [is_app_state_ready, set_is_app_state_ready] = useState(false);
  const [is_findings_loading, set_is_findings_loading] = useState(false);
  const [findings, set_findings] = useState<Finding[]>(initial_findings);
  const [audit_entries, set_audit_entries] = useState<AuditEntry[]>(audit_log_entries);
  const [scans, set_scans] = useState<Scan[]>(base_scans);

  const to_display_status = useCallback(
    (status: string): Finding["review_status"] => map_backend_status_to_display(status) as Finding["review_status"],
    []
  );

  useEffect(() => {
    let is_cancelled = false;

    const load_users = async () => {
      const resolved_users = await get_users();
      if (is_cancelled) {
        return;
      }

      const safe_users = resolved_users.length > 0 ? resolved_users : mock_users;
      set_users(safe_users);

      const stored_user_id = window.localStorage.getItem(SELECTED_USER_STORAGE_KEY);
      if (stored_user_id && safe_users.some((user) => user.id === stored_user_id)) {
        set_selected_user_id(stored_user_id);
      } else {
        set_selected_user_id(null);
        window.localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
      }

      set_is_app_state_ready(true);
    };

    load_users();

    return () => {
      is_cancelled = true;
    };
  }, []);

  const sign_in = useCallback(
    (user_id: string) => {
      if (!users.some((user) => user.id === user_id)) {
        return;
      }

      set_selected_user_id(user_id);
      window.localStorage.setItem(SELECTED_USER_STORAGE_KEY, user_id);
    },
    [users]
  );

  const logout = useCallback(() => {
    set_selected_user_id(null);
    window.localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
  }, []);

  const selected_user = useMemo(
    () => users.find((user) => user.id === selected_user_id) ?? null,
    [selected_user_id, users]
  );

  useEffect(() => {
    let is_cancelled = false;

    const load_findings_for_selected_user = async () => {
      if (!selected_user) {
        set_findings([]);
        set_is_findings_loading(false);
        return;
      }

      set_is_findings_loading(true);
      const resolved_findings = await get_findings_by_user(selected_user.id);
      if (is_cancelled) {
        return;
      }

      set_findings(
        resolved_findings.map((finding) => ({
          ...finding,
          review_status: to_display_status(String(finding.review_status ?? "pending"))
        }))
      );
      set_is_findings_loading(false);
    };

    load_findings_for_selected_user();

    return () => {
      is_cancelled = true;
    };
  }, [selected_user, to_display_status]);

  const fetch_finding_detail = useCallback(
    async (finding_id: string) => {
      const finding = await get_finding(finding_id);
      if (!finding) {
        return null;
      }

      const normalized_finding: Finding = {
        ...finding,
        review_status: to_display_status(String(finding.review_status ?? "pending"))
      };

      set_findings((current_findings) => {
        const exists = current_findings.some((current_finding) => current_finding.id === finding_id);
        if (!exists) {
          return [normalized_finding, ...current_findings];
        }

        return current_findings.map((current_finding) =>
          current_finding.id === finding_id ? normalized_finding : current_finding
        );
      });

      return normalized_finding;
    },
    [to_display_status]
  );

  const apply_finding_action = useCallback(
    async ({ finding_id, review_status, review_note, confirm }: ApplyActionPayload) => {
      if (!selected_user) {
        return;
      }

      const now = new Date().toISOString();
      let target_file_name = "";
      let resulting_status: Finding["review_status"] = "pending";

      const result = await submit_finding_action(
        finding_id,
        review_status,
        review_note,
        selected_user.id,
        confirm === true
      );

      if (result.ok) {
        const normalized_finding: Finding = {
          ...result.data,
          review_status: to_display_status(String(result.data.review_status ?? "pending")),
          review_note: result.data.review_note ?? review_note,
          reviewed_at: result.data.reviewed_at ?? now,
          reviewed_by_user_id: result.data.reviewed_by_user_id ?? selected_user.id
        };
        resulting_status = normalized_finding.review_status;
        target_file_name = normalized_finding.file_name;

        set_findings((current_findings) => {
          const exists = current_findings.some((finding) => finding.id === finding_id);
          if (!exists) {
            return [normalized_finding, ...current_findings];
          }

          return current_findings.map((finding) => (finding.id === finding_id ? normalized_finding : finding));
        });
      } else {
        resulting_status =
          review_status === "confirmed_business_need"
            ? "confirmed_business_need"
            : review_status === "delete"
              ? "deleted"
              : "acknowledged_cleanup";

        set_findings((current_findings) =>
          current_findings.map((finding) => {
            if (finding.id !== finding_id) {
              return finding;
            }

            target_file_name = finding.file_name;

            return {
              ...finding,
              review_status: resulting_status,
              review_note,
              reviewed_at: now,
              reviewed_by_user_id: selected_user.id
            };
          })
        );
      }

      set_audit_entries((current_entries) => {
        if (!target_file_name) {
          return current_entries;
        }

        const next_entry: AuditEntry = {
          id: `audit_${String(current_entries.length + 1).padStart(3, "0")}`,
          timestamp: now,
          finding_id,
          file_name: target_file_name,
          user: selected_user.name,
          action:
            review_status === "confirmed_business_need"
              ? "Confirmed business need"
              : review_status === "delete"
                ? "Deleted"
                : "Acknowledged cleanup",
          review_note,
          resulting_status
        };

        return [next_entry, ...current_entries];
      });
    },
    [selected_user, to_display_status]
  );

  const append_scan = useCallback((scan: Scan) => {
    set_scans((current_scans) => [scan, ...current_scans]);
  }, []);

  const value = useMemo(
    () => ({
      users,
      selected_user_id,
      set_selected_user_id,
      selected_user,
      is_app_state_ready,
      is_findings_loading,
      sign_in,
      logout,
      findings,
      scans,
      audit_entries,
      fetch_finding_detail,
      apply_finding_action,
      append_scan
    }),
    [
      apply_finding_action,
      append_scan,
      audit_entries,
      fetch_finding_detail,
      findings,
      is_app_state_ready,
      is_findings_loading,
      logout,
      scans,
      selected_user,
      selected_user_id,
      sign_in,
      users
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function use_app_state() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("use_app_state must be used within AppStateProvider");
  }

  return context;
}

export const static_admin_data = {
  dashboard_stats,
  owner_summaries,
  reproducibility_snapshot,
  resource_intensity
};
