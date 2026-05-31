"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FindingDetailPanel } from "@/components/finding-detail-panel";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { use_app_state } from "@/context/app-state";
import { cn } from "@/lib/utils";
import { format_document_type, format_timestamp, format_timestamp_short } from "@/lib/utils";
import { Finding } from "@/types/models";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

// Row left-border color by review status
function row_status_class(status: Finding["review_status"], active: boolean): string {
  if (active) return "border-l-4 border-l-bosch_red bg-bosch_red/5 dark:bg-bosch_red/10";
  if (status === "kept_business_need") return "border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-500/5";
  if (status === "marked_false_positive") return "border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-500/5";
  if (status === "cleanup_overdue") return "border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-500/5";
  if (status === "deleted") return "border-l-4 border-l-red-400 bg-red-50/60 opacity-60 dark:bg-red-500/5";
  return "border-l-4 border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60";
}

export function MyFindingsPage() {
  const { selected_user, selected_user_id, findings, is_findings_loading, fetch_finding_detail, apply_finding_action } =
    use_app_state();

  const [selected_finding_id, set_selected_finding_id] = useState<string | null>(null);
  const [selected_finding_detail, set_selected_finding_detail] = useState<null | Finding>(null);
  const [search, set_search] = useState("");
  const [drawer_open, set_drawer_open] = useState(false);
  const [expanded_row_id, set_expanded_row_id] = useState<string | null>(null);
  const drawer_ref = useRef<HTMLDivElement>(null);

  const my_findings = useMemo(() => {
    if (!selected_user_id || !selected_user) return [];
    return findings.filter((f) => {
      if (f.review_status === "deleted") return false;
      if (f.owner_user_id === selected_user_id) return true;
      if (selected_user.is_master_of_data && f.master_of_data_id === selected_user_id) return true;
      return false;
    });
  }, [findings, selected_user, selected_user_id]);

  useEffect(() => {
    if (my_findings.length === 0) {
      set_selected_finding_id(null);
      set_selected_finding_detail(null);
      return;
    }
    const still_exists = my_findings.some((f) => f.id === selected_finding_id);
    if (!still_exists) {
      set_selected_finding_id(my_findings[0].id);
      set_selected_finding_detail(null);
    }
  }, [my_findings, selected_finding_id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selected_finding_id) { set_selected_finding_detail(null); return; }
      const detail = await fetch_finding_detail(selected_finding_id);
      if (!cancelled && detail && detail.id === selected_finding_id) {
        set_selected_finding_detail(detail);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fetch_finding_detail, selected_finding_id]);

  useEffect(() => {
    if (!selected_finding_id || !selected_finding_detail) return;
    if (selected_finding_detail.id !== selected_finding_id) return;
    const latest = my_findings.find((f) => f.id === selected_finding_id);
    if (latest && latest.review_status !== selected_finding_detail.review_status) {
      set_selected_finding_detail(latest);
    }
  }, [my_findings, selected_finding_detail, selected_finding_id]);

  // Close drawer on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (drawer_open && drawer_ref.current && !drawer_ref.current.contains(e.target as Node)) {
        set_drawer_open(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [drawer_open]);

  // Close drawer on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") set_drawer_open(false); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  const selected_finding = useMemo(
    () =>
      selected_finding_detail && selected_finding_detail.id === selected_finding_id
        ? selected_finding_detail
        : my_findings.find((f) => f.id === selected_finding_id) ?? null,
    [my_findings, selected_finding_detail, selected_finding_id]
  );

  const pending_reviews = my_findings.filter((f) => f.review_status === "pending").length;
  const high_sensitivity = my_findings.filter((f) => f.sensitivity_level === "high").length;
  const medium_sensitivity = my_findings.filter((f) => f.sensitivity_level === "medium").length;
  const confirmed_business_need = my_findings.filter((f) =>
    f.review_status === "confirmed_business_need" || f.review_status === "kept_business_need"
  ).length;
  const cleanup_acknowledged = my_findings.filter((f) =>
    f.review_status === "acknowledged_cleanup" || f.review_status === "marked_false_positive"
  ).length;

  const SENSITIVITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

  const filtered_findings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? my_findings.filter((f) =>
          f.file_name.toLowerCase().includes(q) ||
          f.document_type.toLowerCase().includes(q)
        )
      : my_findings;
    // Sort: cleanup_overdue first, then pending, then reviewed
    // Within pending: high → medium → low sensitivity, then newest first
    return [...base].sort((a, b) => {
      const a_overdue = a.review_status === "cleanup_overdue" ? 0 : a.review_status === "pending" ? 1 : 2;
      const b_overdue = b.review_status === "cleanup_overdue" ? 0 : b.review_status === "pending" ? 1 : 2;
      if (a_overdue !== b_overdue) return a_overdue - b_overdue;
      const a_sens = SENSITIVITY_ORDER[a.sensitivity_level] ?? 3;
      const b_sens = SENSITIVITY_ORDER[b.sensitivity_level] ?? 3;
      if (a_sens !== b_sens) return a_sens - b_sens;
      return new Date(b.scan_timestamp).getTime() - new Date(a.scan_timestamp).getTime();
    });
  }, [my_findings, search]);

  const handle_row_click = (finding_id: string) => {
    set_selected_finding_id(finding_id);
    set_selected_finding_detail(null);
    set_drawer_open(true);
    set_expanded_row_id(null);
  };

  const handle_expand_click = (e: React.MouseEvent, finding_id: string) => {
    e.stopPropagation();
    set_expanded_row_id(expanded_row_id === finding_id ? null : finding_id);
  };

  const handle_quick_action = async (e: React.MouseEvent, finding_id: string, action: "keep_business_need" | "mark_false_positive") => {
    e.stopPropagation();
    await apply_finding_action({ finding_id, review_status: action, review_note: "Quick action" });
  };

  if (!selected_user_id || !selected_user) return null;

  return (
    <div className="relative min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">My review queue</h1>
        <p className="mt-1 text-sm text-text_medium">Findings assigned to you for review and decision.</p>
      </div>

      {/* KPI summary cards */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Pending reviews" value={pending_reviews} accent="text-bosch_red" />
        <SummaryCard title="High sensitivity" value={high_sensitivity} accent="text-bosch_red" />
        <SummaryCard title="Medium sensitivity" value={medium_sensitivity} accent="text-amber-700" />
        <SummaryCard title="Confirmed business need" value={confirmed_business_need} accent="text-bosch_blue" />
        <SummaryCard title="Cleanup acknowledged" value={cleanup_acknowledged} accent="text-success_green" />
      </div>

      {is_findings_loading && (
        <Card>
          <CardContent className="py-8 text-sm text-text_medium">Loading findings for {selected_user.name}...</CardContent>
        </Card>
      )}

      {my_findings.length === 0 && !is_findings_loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-lg font-semibold text-text_dark">No findings assigned to {selected_user.name}</p>
            <p className="mt-2 text-sm text-text_medium">Switch user to view another review queue.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="min-w-0">
          <CardContent className="min-w-0 p-0">
            {/* Search bar */}
            <div className="border-b border-border_grey/80 px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text_medium" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => set_search(e.target.value)}
                  placeholder="Search by file name or document type…"
                  className="w-full rounded-md border border-border_grey bg-page_bg py-1.5 pl-8 pr-8 text-sm text-text_dark placeholder:text-text_medium focus:border-bosch_blue focus:outline-none dark:bg-slate-800"
                />
                {search && (
                  <button
                    onClick={() => set_search("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text_medium hover:text-text_dark"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>File name</TableHead>
                    <TableHead>Document type</TableHead>
                    <TableHead>Sensitivity</TableHead>
                    <TableHead className="text-center">Entities</TableHead>
                    <TableHead className="text-center">Scanned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered_findings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-sm text-text_medium">
                        No files match &ldquo;{search}&rdquo;.
                      </td>
                    </tr>
                  ) : filtered_findings.map((finding) => {
                    const active = finding.id === selected_finding_id && drawer_open;
                    const expanded = finding.id === expanded_row_id;
                    const is_reviewed = finding.review_status !== "pending";

                    return (
                      <>
                        <TableRow
                          key={finding.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            row_status_class(finding.review_status, active)
                          )}
                          onClick={() => handle_row_click(finding.id)}
                        >
                          {/* Expand toggle */}
                          <TableCell className="py-2 pr-0" onClick={(e) => handle_expand_click(e, finding.id)}>
                            <button className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700">
                              {expanded
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className={cn("font-medium", is_reviewed && "text-text_medium line-through decoration-slate-400")}>
                            {finding.file_name}
                          </TableCell>
                          <TableCell>{format_document_type(finding.document_type)}</TableCell>
                          <TableCell><StatusBadge value={finding.sensitivity_level} /></TableCell>
                          <TableCell className="text-center tabular-nums">{finding.entities.length}</TableCell>
                          <TableCell className="text-center text-xs text-text_medium" title={format_timestamp(finding.scan_timestamp)}>
                            {format_timestamp_short(finding.scan_timestamp)}
                          </TableCell>
                          <TableCell><StatusBadge value={finding.review_status} /></TableCell>

                          {/* Quick action buttons */}
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            {finding.review_status === "pending" && (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  title="Keep: business need"
                                  onClick={(e) => handle_quick_action(e, finding.id, "keep_business_need")}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-400"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  title="Acknowledge cleanup"
                                  onClick={(e) => handle_quick_action(e, finding.id, "mark_false_positive")}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expandable inline detail row */}
                        {expanded && (
                          <TableRow key={`${finding.id}-expanded`} className="bg-slate-50/80 dark:bg-slate-800/40">
                            <TableCell colSpan={8} className="px-6 py-3">
                              <div className="grid gap-3 text-sm md:grid-cols-3">
                                <div>
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text_medium">Reasoning</p>
                                  <p className="text-text_dark">{finding.reasoning}</p>
                                </div>
                                <div>
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text_medium">Retention</p>
                                  <p className="text-text_dark">{finding.retention_recommendation}</p>
                                </div>
                                <div>
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text_medium">Entities detected ({finding.entities.length})</p>
                                  <div className="flex flex-wrap gap-1">
                                    {finding.entities.map((entity, i) => (
                                      <span key={i} className="inline-flex items-center rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                        {entity.type}: {entity.value}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 text-right">
                                <button
                                  onClick={() => handle_row_click(finding.id)}
                                  className="text-xs font-medium text-bosch_blue underline underline-offset-2 hover:text-bosch_blue/80"
                                >
                                  Open full detail →
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slide-in drawer overlay */}
      {drawer_open && (
        <div className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40" aria-hidden="true" />
      )}

      {/* Drawer panel */}
      <div
        ref={drawer_ref}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border_grey bg-card_bg shadow-2xl transition-transform duration-300 ease-in-out",
          drawer_open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-border_grey px-4 py-3">
          <p className="font-semibold text-text_dark">Finding detail</p>
          <button
            onClick={() => set_drawer_open(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text_medium hover:bg-slate-100 hover:text-text_dark dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer content — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FindingDetailPanel
            finding={selected_finding}
            preview_url={selected_finding ? `${API_BASE_URL}/files/${selected_finding.file_id}/preview` : undefined}
            on_apply_action={async (finding_id, review_status, review_note, options) => {
              await apply_finding_action({
                finding_id,
                review_status,
                review_note,
                legal_basis: options?.legal_basis,
                cleanup_deadline: options?.cleanup_deadline,
              });
              set_drawer_open(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, accent }: { title: string; value: number; accent?: string }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{title}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${accent ?? "text-text_dark"}`}>{value}</p>
    </Card>
  );
}
