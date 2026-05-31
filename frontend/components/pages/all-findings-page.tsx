"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Select, SelectItem } from "@/components/ui/select";
import { use_app_state } from "@/context/app-state";
import { get_all_findings, reassign_finding } from "@/src/lib/api-client";
import { format_document_type, format_timestamp_short, format_timestamp } from "@/lib/utils";
import { Finding } from "@/types/models";

const SENSITIVITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function AllFindingsPage() {
  const { users } = use_app_state();
  const [findings, set_findings] = useState<Finding[]>([]);
  const [loading, set_loading] = useState(true);
  const [filter_owner, set_filter_owner] = useState("");
  const [filter_status, set_filter_status] = useState("");
  const [filter_sensitivity, set_filter_sensitivity] = useState("");
  const [search, set_search] = useState("");
  const [reassigning, set_reassigning] = useState<string | null>(null);
  const [reassign_target, set_reassign_target] = useState<Record<string, string>>({});
  const [expanded_finding_id, set_expanded_finding_id] = useState<string | null>(null);

  const load = useCallback(async () => {
    set_loading(true);
    const data = await get_all_findings({
      status: filter_status || undefined,
      owner_user_id: filter_owner || undefined,
      sensitivity: filter_sensitivity || undefined,
    });
    set_findings(data);
    set_loading(false);
  }, [filter_status, filter_owner, filter_sensitivity]);

  useEffect(() => { load(); }, [load]);

  const get_owner_name = (finding: Finding): string => {
    if (finding.owner_user_id) {
      return users.find(u => u.id === finding.owner_user_id)?.name ?? finding.owner_name ?? "Unknown";
    }
    if (finding.master_of_data_id) {
      const mod_user = users.find(u => u.id === finding.master_of_data_id);
      return mod_user ? `${mod_user.name} (MoD)` : "Master of Data";
    }
    return "Unassigned";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? findings.filter(f =>
          f.file_name.toLowerCase().includes(q) ||
          f.document_type.toLowerCase().includes(q) ||
          get_owner_name(f).toLowerCase().includes(q)
        )
      : findings;
    return [...base].sort((a, b) => {
      const a_p = a.review_status === "cleanup_overdue" ? 0 : a.review_status === "pending" ? 1 : 2;
      const b_p = b.review_status === "cleanup_overdue" ? 0 : b.review_status === "pending" ? 1 : 2;
      if (a_p !== b_p) return a_p - b_p;
      return (SENSITIVITY_ORDER[a.sensitivity_level] ?? 3) - (SENSITIVITY_ORDER[b.sensitivity_level] ?? 3);
    });
  }, [findings, search, users]);

  const handle_reassign = async (finding_id: string) => {
    const target = reassign_target[finding_id];
    if (!target) return;
    set_reassigning(finding_id);
    const result = await reassign_finding(finding_id, target);
    if (result.ok) {
      set_findings(prev => prev.map(f => f.id === finding_id ? result.data : f));
      set_reassign_target(prev => { const n = { ...prev }; delete n[finding_id]; return n; });
    }
    set_reassigning(null);
  };

  // Summary counts
  const pending_count = findings.filter(f => f.review_status === "pending").length;
  const overdue_count = findings.filter(f => f.review_status === "cleanup_overdue").length;
  const reviewed_count = findings.filter(f => f.review_status !== "pending" && f.review_status !== "cleanup_overdue").length;
  const unassigned_count = findings.filter(f => !f.owner_user_id && !f.master_of_data_id).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">All findings</h1>
        <p className="mt-1 text-sm text-text_medium">
          Admin view — every finding across all owners. Reassign ownership or monitor review progress.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Pending" value={pending_count} accent="text-amber-700" />
        <SummaryCard label="Reviewed" value={reviewed_count} accent="text-success_green" />
        <SummaryCard label="Cleanup overdue" value={overdue_count} accent="text-orange-600" />
        <SummaryCard label="Unassigned" value={unassigned_count} accent={unassigned_count > 0 ? "text-bosch_red" : "text-text_dark"} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-3 py-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text_medium" />
            <input
              type="text"
              value={search}
              onChange={e => set_search(e.target.value)}
              placeholder="Search by file, type, or owner..."
              className="w-full rounded-md border border-border_grey bg-white py-1.5 pl-8 pr-3 text-sm text-text_dark focus:border-bosch_blue focus:outline-none dark:bg-slate-800"
            />
          </div>
          <div className="w-48">
            <Select value={filter_owner} onChange={e => set_filter_owner(e.target.value)}>
              <SelectItem value="">All owners</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </Select>
          </div>
          <div className="w-40">
            <Select value={filter_status} onChange={e => set_filter_status(e.target.value)}>
              <SelectItem value="">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="kept_business_need">Kept</SelectItem>
              <SelectItem value="marked_false_positive">Cleanup ack.</SelectItem>
              <SelectItem value="cleanup_overdue">Cleanup overdue</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </Select>
          </div>
          <div className="w-36">
            <Select value={filter_sensitivity} onChange={e => set_filter_sensitivity(e.target.value)}>
              <SelectItem value="">All sensitivity</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Findings table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Findings
            {!loading && <span className="ml-2 text-sm font-normal text-text_medium">({filtered.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-text_medium">Loading findings...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-text_medium">No findings match the current filters.</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead>File name</TableHead>
                  <TableHead>Document type</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Legal basis</TableHead>
                  <TableHead>Scanned</TableHead>
                  <TableHead className="text-center">Reassign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(finding => {
                  const is_overdue = finding.review_status === "cleanup_overdue";
                  const is_pending = finding.review_status === "pending";
                  const owner_name = get_owner_name(finding);
                  const expanded = finding.id === expanded_finding_id;

                  return (
                    <>
                      <TableRow
                        key={finding.id}
                        className={`cursor-pointer transition-colors ${
                          is_overdue ? "border-l-4 border-l-orange-500 bg-orange-50/40 dark:bg-orange-500/5" :
                          is_pending ? "hover:bg-slate-50 dark:hover:bg-slate-800/60" :
                          "opacity-70 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        }`}
                        onClick={() => set_expanded_finding_id(expanded ? null : finding.id)}
                      >
                        <TableCell className="font-medium text-text_dark">
                          <span className={finding.review_status === "deleted" ? "line-through text-text_medium" : ""}>
                            {finding.file_name}
                          </span>
                        </TableCell>
                        <TableCell>{format_document_type(finding.document_type)}</TableCell>
                        <TableCell><StatusBadge value={finding.sensitivity_level} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-text_medium" />
                            <span className="text-sm">{owner_name}</span>
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge value={finding.review_status as any} /></TableCell>
                        <TableCell className="text-xs text-text_medium">
                          {finding.legal_basis ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-text_medium" title={format_timestamp(finding.scan_timestamp)}>
                          {format_timestamp_short(finding.scan_timestamp)}
                        </TableCell>

                        {/* Reassign column */}
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <select
                              value={reassign_target[finding.id] ?? ""}
                              onChange={e => set_reassign_target(prev => ({ ...prev, [finding.id]: e.target.value }))}
                              className="rounded border border-border_grey bg-white px-1.5 py-1 text-xs text-text_dark dark:bg-slate-800"
                            >
                              <option value="">Pick user...</option>
                              {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                            <button
                              disabled={!reassign_target[finding.id] || reassigning === finding.id}
                              onClick={() => handle_reassign(finding.id)}
                              className="flex h-6 w-6 items-center justify-center rounded bg-bosch_blue text-white transition-colors hover:bg-bosch_blue/80 disabled:opacity-40"
                              title="Confirm reassign"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row — reasoning + entities */}
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
                                {finding.cleanup_deadline && (
                                  <p className="mt-1 text-xs text-orange-600">Cleanup deadline: {finding.cleanup_deadline.split("T")[0]}</p>
                                )}
                              </div>
                              <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text_medium">
                                  Entities ({finding.entities.length})
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {finding.entities.slice(0, 8).map((e, i) => (
                                    <span key={i} className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                      {e.type}: {e.value}
                                    </span>
                                  ))}
                                  {finding.entities.length > 8 && (
                                    <span className="text-xs text-text_medium">+{finding.entities.length - 8} more</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${accent ?? "text-text_dark"}`}>{value}</p>
    </Card>
  );
}
