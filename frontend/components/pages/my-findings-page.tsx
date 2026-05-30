"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FindingDetailPanel } from "@/components/finding-detail-panel";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { use_app_state } from "@/context/app-state";
import { format_document_type, format_timestamp } from "@/lib/utils";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export function MyFindingsPage() {
  const { selected_user, selected_user_id, findings, is_findings_loading, fetch_finding_detail, apply_finding_action } =
    use_app_state();
  const [selected_finding_id, set_selected_finding_id] = useState<string | null>(null);
  const [selected_finding_detail, set_selected_finding_detail] = useState<null | (typeof findings)[number]>(null);

  const my_findings = useMemo(() => {
    if (!selected_user_id || !selected_user) {
      return [];
    }

    return findings.filter((finding) => {
      if (finding.owner_user_id === selected_user_id) {
        return true;
      }

      if (selected_user.is_master_of_data && finding.master_of_data_id === selected_user_id) {
        return true;
      }

      return false;
    });
  }, [findings, selected_user, selected_user_id]);

  useEffect(() => {
    if (my_findings.length === 0) {
      set_selected_finding_id(null);
      set_selected_finding_detail(null);
      return;
    }

    const still_exists = my_findings.some((finding) => finding.id === selected_finding_id);
    if (!still_exists) {
      set_selected_finding_id(my_findings[0].id);
      set_selected_finding_detail(null);
    }
  }, [my_findings, selected_finding_id]);

  useEffect(() => {
    let is_cancelled = false;

    const load_selected_finding_detail = async () => {
      if (!selected_finding_id) {
        set_selected_finding_detail(null);
        return;
      }

      const detailed_finding = await fetch_finding_detail(selected_finding_id);
      if (!is_cancelled && detailed_finding && detailed_finding.id === selected_finding_id) {
        set_selected_finding_detail(detailed_finding);
      }
    };

    load_selected_finding_detail();

    return () => {
      is_cancelled = true;
    };
  }, [fetch_finding_detail, selected_finding_id]);

  useEffect(() => {
    if (!selected_finding_id || !selected_finding_detail) {
      return;
    }

    if (selected_finding_detail.id !== selected_finding_id) {
      return;
    }

    const latest = my_findings.find((finding) => finding.id === selected_finding_id);
    if (latest && latest.review_status !== selected_finding_detail.review_status) {
      set_selected_finding_detail(latest);
    }
  }, [my_findings, selected_finding_detail, selected_finding_id]);

  const selected_finding = useMemo(
    () =>
      selected_finding_detail && selected_finding_detail.id === selected_finding_id
        ? selected_finding_detail
        : my_findings.find((finding) => finding.id === selected_finding_id) ?? null,
    [my_findings, selected_finding_detail, selected_finding_id]
  );

  const pending_reviews = my_findings.filter((finding) => finding.review_status === "pending").length;
  const high_sensitivity = my_findings.filter((finding) => finding.sensitivity_level === "high").length;
  const medium_sensitivity = my_findings.filter((finding) => finding.sensitivity_level === "medium").length;
  const confirmed_business_need = my_findings.filter((finding) =>
    finding.review_status === "confirmed_business_need" || finding.review_status === "kept_business_need"
  ).length;
  const cleanup_acknowledged = my_findings.filter((finding) =>
    finding.review_status === "acknowledged_cleanup" || finding.review_status === "marked_false_positive"
  ).length;

  if (!selected_user_id || !selected_user) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">My review queue</h1>
        <p className="mt-1 text-sm text-text_medium">Findings assigned to you for review and decision.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Pending reviews" value={pending_reviews} accent="text-bosch_red" />
        <SummaryCard title="High sensitivity" value={high_sensitivity} accent="text-bosch_red" />
        <SummaryCard title="Medium sensitivity" value={medium_sensitivity} accent="text-amber-700" />
        <SummaryCard title="Confirmed business need" value={confirmed_business_need} accent="text-bosch_blue" />
        <SummaryCard title="Cleanup acknowledged" value={cleanup_acknowledged} accent="text-success_green" />
      </div>

      {is_findings_loading ? (
        <Card>
          <CardContent className="py-8 text-sm text-text_medium">Loading findings for {selected_user.name}...</CardContent>
        </Card>
      ) : null}

      {my_findings.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-lg font-semibold text-text_dark">No findings assigned to {selected_user.name}</p>
            <p className="mt-2 text-sm text-text_medium">
              Switch user to view another review queue.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-3 xl:grid-cols-[1.55fr_1fr]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Findings</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              <div className="max-h-[72vh] overflow-auto">
                <Table className="min-w-[1050px]">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                      <TableHead>File name</TableHead>
                      <TableHead>Document type</TableHead>
                      <TableHead>Sensitivity</TableHead>
                      <TableHead className="text-right">Entity count</TableHead>
                      <TableHead>Scan timestamp</TableHead>
                      <TableHead>Review status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {my_findings.map((finding) => {
                      const active = finding.id === selected_finding_id;

                      return (
                        <TableRow
                          key={finding.id}
                          className={
                            active
                              ? "cursor-pointer border-l-2 border-l-bosch_red bg-bosch_red/5"
                              : "cursor-pointer hover:bg-slate-50"
                          }
                          onClick={() => {
                            set_selected_finding_id(finding.id);
                            set_selected_finding_detail(null);
                          }}
                        >
                          <TableCell className="font-medium">{finding.file_name}</TableCell>
                          <TableCell>{format_document_type(finding.document_type)}</TableCell>
                          <TableCell>
                            <StatusBadge value={finding.sensitivity_level} />
                          </TableCell>
                          <TableCell className="text-right">{finding.entities.length}</TableCell>
                          <TableCell className="text-xs">{format_timestamp(finding.scan_timestamp)}</TableCell>
                          <TableCell>
                            <StatusBadge value={finding.review_status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="min-w-0">
            <FindingDetailPanel
              finding={selected_finding}
              preview_url={selected_finding ? `${API_BASE_URL}/files/${selected_finding.file_id}/preview` : undefined}
              on_apply_action={async (finding_id, review_status, review_note) => {
                await apply_finding_action({ finding_id, review_status, review_note });
              }}
            />
          </div>
        </div>
      )}
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
